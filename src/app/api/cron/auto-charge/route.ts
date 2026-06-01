import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import { chargeCardToken, DimePaySDKConfig } from '@/lib/dimepay';
import { getDimepayConfig } from '@/lib/settings';
import { sendSMS } from '@/lib/textbee';
import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';

/**
 * Storage Fee Auto-Charge Cron Job
 *
 * Automatically charges saved cards for overdue storage fees when customers
 * have opted in to auto-charge.
 *
 * GET /api/cron/auto-charge?key=CRON_SECRET
 *
 * Behavior:
 * - Finds all STORED orders with overdue storage fees (past free period)
 * - For each order, checks if the customer has a saved card with autoChargeEnabled
 * - Charges the default auto-charge card for the storage fee amount
 * - On success: marks order as PICKED_UP, opens the locker box, sends confirmation SMS
 * - On failure: disables auto-charge on the card (after 2+ consecutive failures),
 *   sends SMS notifying customer that auto-charge failed and manual payment is needed
 *
 * Safety guards:
 * - Only charges once per order (checks for existing COMPLETED payment)
 * - Skips cards that have failed auto-charge in the last 24 hours
 * - Maximum single charge of JMD $10,000 to prevent runaway charges
 * - Only runs on orders within the storage fee window (4-30 days)
 */

const MAX_AUTO_CHARGE_AMOUNT = 10000; // JMD $10,000 safety cap
const AUTO_CHARGE_COOLDOWN_HOURS = 24; // Don't retry a failed card within 24h

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronKey = request.nextUrl.searchParams.get('key');
  const expectedKey = process.env.CRON_SECRET;
  if (!expectedKey) {
    console.error('CRON_SECRET environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (cronKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    ordersProcessed: 0,
    chargesAttempted: 0,
    chargesSucceeded: 0,
    chargesFailed: 0,
    chargesSkipped: 0,
    errors: 0,
  };

  try {
    // Find all stored orders that are past the free storage period
    const storedOrders = await db.order.findMany({
      where: {
        status: { in: ['STORED', 'READY'] },
        storageStartAt: { not: null },
        pickUpAt: null,
        // Must have a customer phone for notifications
        customerPhone: { not: null },
      },
      include: {
        customer: {
          include: {
            savedPaymentMethods: {
              where: {
                isActive: true,
                autoChargeEnabled: true,
              },
              orderBy: [
                { isDefault: 'desc' },
                { lastUsedAt: 'desc' },
              ],
            },
          },
        },
        device: true,
        box: true,
      },
    });

    results.ordersProcessed = storedOrders.length;

    for (const order of storedOrders) {
      if (!order.storageStartAt) continue;

      try {
        const calc = getStorageCalculation(new Date(order.storageStartAt));
        const storageFee = calc.storageFee;

        // Skip if no fee (still in free period) or fee is zero
        if (storageFee <= 0) {
          results.chargesSkipped++;
          continue;
        }

        // Skip if beyond 30-day window (handled by abandoned cron)
        if (calc.totalDays > 30) {
          results.chargesSkipped++;
          continue;
        }

        // Safety cap: don't auto-charge more than the maximum
        if (storageFee > MAX_AUTO_CHARGE_AMOUNT) {
          console.warn(
            `[Auto-Charge] Order ${order.orderNumber} fee JMD $${storageFee} exceeds cap JMD $${MAX_AUTO_CHARGE_AMOUNT}, skipping.`
          );
          results.chargesSkipped++;
          continue;
        }

        // Check if already paid (existing completed payment for this order)
        const existingPayment = await db.payment.findFirst({
          where: {
            orderId: order.id,
            status: 'COMPLETED',
            type: 'STORAGE_FEE',
          },
        });
        if (existingPayment) {
          results.chargesSkipped++;
          continue;
        }

        // Skip if manually paid and within grace period
        if (order.manuallyPaidAt && order.manualPaymentGraceUntil) {
          const now = new Date();
          const graceDeadline = new Date(order.manualPaymentGraceUntil);
          if (now <= graceDeadline) {
            // Grace period still active - skip auto-charge
            results.chargesSkipped++;
            continue;
          }
          // Grace period expired - auto-charge can proceed for new fees
        }

        // Check if customer has auto-charge enabled cards
        const autoChargeCards = order.customer?.savedPaymentMethods || [];
        if (autoChargeCards.length === 0) {
          results.chargesSkipped++;
          continue;
        }

        // Pick the first eligible card (default card preferred, then most recently used)
        const card = autoChargeCards[0];

        // Cooldown check: skip if card failed auto-charge recently
        if (card.autoChargeFailedAt) {
          const hoursSinceFailure =
            (Date.now() - card.autoChargeFailedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFailure < AUTO_CHARGE_COOLDOWN_HOURS) {
            console.log(
              `[Auto-Charge] Skipping card ${card.id} for order ${order.orderNumber}: failed ${hoursSinceFailure.toFixed(1)}h ago (cooldown: ${AUTO_CHARGE_COOLDOWN_HOURS}h)`
            );
            results.chargesSkipped++;
            continue;
          }
        }

        // Attempt the charge
        results.chargesAttempted++;

        const config = await getDimepayConfig();
        const effectiveClientId = config.sandboxMode
          ? config.sandboxClientId
          : config.liveClientId;
        const effectiveSecretKey = config.sandboxMode
          ? config.sandboxSecretKey
          : config.liveSecretKey;

        if (!effectiveClientId || !effectiveSecretKey) {
          console.error('[Auto-Charge] DimePay not configured, cannot auto-charge');
          results.chargesFailed++;
          continue;
        }

        const sdkConfig: DimePaySDKConfig = {
          clientId: effectiveClientId,
          secretKey: effectiveSecretKey,
          sandboxMode: config.sandboxMode,
        };

        const chargeResult = await chargeCardToken(
          {
            cardToken: card.cardToken,
            amount: storageFee,
            orderId: `AUTO-SF-${order.id}-${Date.now()}`,
            description: `Auto-Charge: Storage Fee - Order ${order.orderNumber}`,
            metadata: {
              type: 'storage_fee_auto_charge',
              orderId: order.id,
              orderNumber: order.orderNumber,
              customerId: order.customerId,
              cardId: card.id,
            },
          },
          sdkConfig
        );

        if (chargeResult.success) {
          results.chargesSucceeded++;

          // Create payment record
          await db.payment.create({
            data: {
              orderId: order.id,
              userId: order.customerId,
              type: 'STORAGE_FEE',
              amount: storageFee,
              method: 'CARD',
              status: 'COMPLETED',
              gatewayRef: chargeResult.data?.chargeId || `auto-${Date.now()}`,
              gatewayResponse: JSON.stringify(chargeResult.data),
              description: `Auto-charged storage fee for order ${order.orderNumber}`,
              paidAt: new Date(),
            },
          });

          // Update order status and storage fee
          await db.order.update({
            where: { id: order.id },
            data: {
              status: 'PICKED_UP',
              pickUpAt: new Date(),
              storageFee,
              storageDays: calc.totalDays,
            },
          });

          // Mark box as available
          if (order.boxId) {
            await db.box.update({
              where: { id: order.boxId },
              data: { status: 'AVAILABLE' },
            });
          }

          // Update device available count
          if (order.deviceId) {
            await db.device.update({
              where: { id: order.deviceId },
              data: { availableBoxes: { increment: 1 } },
            });
          }

          // Open the box for pickup
          if (order.device && order.boxNumber) {
            try {
              const credentials = await getCredentialsForDevice(order.device.id);
              if (credentials.appId && credentials.appSecret) {
                await openBoxWithCredentials(
                  order.device.deviceId,
                  order.boxNumber,
                  credentials
                );
                console.log(
                  `[Auto-Charge] Box ${order.boxNumber} opened for order ${order.orderNumber}`
                );
              }
            } catch (boxError) {
              console.error(
                `[Auto-Charge] Failed to open box for order ${order.orderNumber}:`,
                boxError
              );
            }
          }

          // Update card's last used timestamp
          await db.savedPaymentMethod.update({
            where: { id: card.id },
            data: {
              lastUsedAt: new Date(),
              autoChargeFailedAt: null, // Clear any previous failure
            },
          });

          // Send confirmation SMS
          try {
            await sendSMS(
              order.customerPhone,
              `Pickup Jamaica: Your storage fee of JMD $${storageFee} has been auto-charged to your ${card.brand || 'card'} ****${card.last4 || '****'}. Your locker is now open for pickup. Code: ${order.trackingCode}`
            );
          } catch (smsError) {
            console.error(
              `[Auto-Charge] Failed to send confirmation SMS for order ${order.orderNumber}:`,
              smsError
            );
          }

          // Log activity
          await db.activity.create({
            data: {
              userId: order.customerId,
              orderId: order.id,
              action: 'AUTO_CHARGE_SUCCESS',
              description: `Storage fee JMD $${storageFee} auto-charged to ${card.brand} ****${card.last4} for order ${order.orderNumber}`,
              metadata: JSON.stringify({
                cardId: card.id,
                amount: storageFee,
                chargeId: chargeResult.data?.chargeId,
              }),
            },
          });

          console.log(
            `[Auto-Charge] Successfully charged JMD $${storageFee} for order ${order.orderNumber}`
          );
        } else {
          // Charge failed
          results.chargesFailed++;

          console.error(
            `[Auto-Charge] Failed to charge card for order ${order.orderNumber}:`,
            chargeResult.error
          );

          // Record the failure on the card
          await db.savedPaymentMethod.update({
            where: { id: card.id },
            data: { autoChargeFailedAt: new Date() },
          });

          // If card has failed before (autoChargeFailedAt was already set),
          // disable auto-charge entirely to prevent repeated failures
          if (card.autoChargeFailedAt) {
            await db.savedPaymentMethod.update({
              where: { id: card.id },
              data: { autoChargeEnabled: false },
            });

            console.warn(
              `[Auto-Charge] Disabled auto-charge on card ${card.id} after repeated failures`
            );
          }

          // Send SMS notifying customer of auto-charge failure
          try {
            await sendSMS(
              order.customerPhone,
              `Pickup Jamaica: Auto-charge for your storage fee of JMD $${storageFee} failed. Please pay at the locker or online. Account: /account?phone=${encodeURIComponent(order.customerPhone)}`
            );
          } catch (smsError) {
            console.error(
              `[Auto-Charge] Failed to send failure notification SMS:`,
              smsError
            );
          }

          // Log activity
          await db.activity.create({
            data: {
              userId: order.customerId,
              orderId: order.id,
              action: 'AUTO_CHARGE_FAILED',
              description: `Auto-charge of JMD $${storageFee} failed for order ${order.orderNumber}: ${chargeResult.error}`,
              metadata: JSON.stringify({
                cardId: card.id,
                amount: storageFee,
                error: chargeResult.error,
              }),
            },
          });
        }
      } catch (orderError) {
        console.error(`[Auto-Charge] Error processing order ${order.id}:`, orderError);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Auto-Charge] Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    );
  }
}
