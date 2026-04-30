import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import {
  sendFreePickupReminder,
  sendStorageFeeApplied,
  sendOverdueReminder,
  sendAutoChargeNotification,
  sendAutoChargeFailed,
} from '@/lib/textbee';
import { chargeCardToken, DimePaySDKConfig } from '@/lib/dimepay';
import { getDimepayConfig, getSetting } from '@/lib/settings';

/**
 * Storage Fee Notification + Auto-Charge Cron Job (Phase 2)
 * 
 * Call this endpoint once per day via Vercel Cron or external scheduler.
 * 
 * GET /api/cron/storage-notifications?key=CRON_SECRET
 * 
 * Notification cadence:
 * - Day 3: Free pickup reminder (free period ending today)
 * - Day 4: Storage fee first applied (first day of fees)
 * - Day 7: Overdue reminder (fees growing, risk of abandonment)
 * - Day 14: Escalating reminder (2 weeks overdue)
 * - Day 21: Urgent warning (approaching abandonment)
 * - Day 28: Final chance warning
 * - Day 29: Last day before abandonment
 * 
 * Auto-charge (if enabled in settings):
 * - Day 4+: If customer has a saved card, automatically charge the storage fee
 * - Only charges if storage_autoChargeEnabled setting is 'true'
 * - Sends SMS confirmation or failure notification
 * - Creates Payment record for each charge
 * - Skips if already charged for this period
 * 
 * Each notification includes:
 * - Payment link to pay online
 * - Account link to add a card
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const cronKey = request.nextUrl.searchParams.get('key');
  const expectedKey = process.env.CRON_SECRET || 'pickup-cron-2024';

  if (cronKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    freePickupReminders: 0,
    storageFeeFirstDay: 0,
    overdueReminders: 0,
    escalatingReminders: 0,
    urgentWarnings: 0,
    finalWarnings: 0,
    autoCharged: 0,
    autoChargeFailed: 0,
    autoChargeSkipped: 0,
    errors: 0,
  };

  const now = new Date();

  try {
    // Check if auto-charge is enabled
    const autoChargeEnabled = await getSetting('storage_autoChargeEnabled') === 'true';

    // Find all stored orders that haven't been picked up
    const storedOrders = await db.order.findMany({
      where: {
        status: { in: ['STORED', 'READY'] },
        storageStartAt: { not: null },
        pickUpAt: null,
      },
      include: {
        customer: {
          include: {
            savedPaymentMethods: {
              where: { isActive: true },
              orderBy: { isDefault: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    for (const order of storedOrders) {
      if (!order.storageStartAt || !order.customerPhone) continue;

      try {
        const calc = getStorageCalculation(new Date(order.storageStartAt));
        const daysStored = calc.totalDays;
        const storageFee = calc.storageFee;

        // Check what notifications have already been sent for this order
        const existingNotifications = await db.notification.findMany({
          where: {
            orderId: order.id,
            templateKey: {
              in: [
                'free_pickup_reminder',
                'storage_fee_applied',
                'overdue_reminder',
                'escalating_reminder',
                'urgent_warning',
                'final_warning',
                'auto_charge_success',
                'auto_charge_failed',
              ],
            },
            status: 'SENT',
          },
        });

        const sentTemplates = new Set(existingNotifications.map(n => n.templateKey));

        // ---- SMS NOTIFICATION CADENCE ----

        // Day 3: Free pickup reminder
        if (daysStored === 3 && !sentTemplates.has('free_pickup_reminder')) {
          await sendFreePickupReminder(
            order.customerPhone,
            order.customerName || 'Customer',
            order.trackingCode,
            'Pickup Locker'
          );
          results.freePickupReminders++;
        }

        // Day 4: Storage fee first applied
        if (daysStored === 4 && storageFee > 0 && !sentTemplates.has('storage_fee_applied')) {
          const paymentRef = `SF-NOTIFY-${order.id}-${Date.now()}`;
          await sendStorageFeeApplied(
            order.customerPhone,
            order.customerName || 'Customer',
            order.trackingCode,
            daysStored,
            storageFee,
            paymentRef
          );
          results.storageFeeFirstDay++;
        }

        // Day 7: Overdue reminder with growing fees
        if (daysStored >= 7 && daysStored <= 13 && storageFee > 0 && !sentTemplates.has('overdue_reminder')) {
          const daysUntilAbandoned = 30 - daysStored;
          await sendOverdueReminder(
            order.customerPhone,
            order.customerName || 'Customer',
            daysStored,
            storageFee,
            Math.max(0, daysUntilAbandoned)
          );
          results.overdueReminders++;
        }

        // Day 14: Escalating reminder (2 weeks)
        if (daysStored >= 14 && daysStored <= 20 && storageFee > 0 && !sentTemplates.has('escalating_reminder')) {
          await sendOverdueReminder(
            order.customerPhone,
            order.customerName || 'Customer',
            daysStored,
            storageFee,
            Math.max(0, 30 - daysStored)
          );
          results.escalatingReminders++;
        }

        // Day 21-27: Urgent warning
        if (daysStored >= 21 && daysStored <= 27 && storageFee > 0 && !sentTemplates.has('urgent_warning')) {
          await sendOverdueReminder(
            order.customerPhone,
            order.customerName || 'Customer',
            daysStored,
            storageFee,
            Math.max(0, 30 - daysStored)
          );
          results.urgentWarnings++;
        }

        // Day 28-29: Final warning before abandonment
        if (daysStored >= 28 && storageFee > 0 && !sentTemplates.has('final_warning')) {
          await sendOverdueReminder(
            order.customerPhone,
            order.customerName || 'Customer',
            daysStored,
            storageFee,
            Math.max(0, 30 - daysStored)
          );
          results.finalWarnings++;
        }

        // ---- AUTO-CHARGE SAVED CARD ----
        // Only attempt auto-charge if:
        // 1. Auto-charge setting is enabled
        // 2. Storage fee > 0 (past free period)
        // 3. Customer has a saved card
        // 4. We haven't already auto-charged for this billing period
        if (autoChargeEnabled && storageFee > 0 && order.customer?.savedPaymentMethods?.length > 0) {
          const savedCard = order.customer.savedPaymentMethods[0];

          // Check if we already auto-charged this order recently (within last 7 days)
          const recentAutoCharge = await db.payment.findFirst({
            where: {
              orderId: order.id,
              type: 'STORAGE_FEE',
              method: 'CARD',
              status: 'COMPLETED',
              description: { contains: 'Auto-charge' },
              createdAt: {
                gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          });

          if (recentAutoCharge) {
            // Already charged this period — skip
            results.autoChargeSkipped++;
          } else {
            // Attempt auto-charge
            try {
              const chargeResult = await attemptAutoCharge(order, savedCard, storageFee, calc.chargeableDays);

              if (chargeResult.success) {
                results.autoCharged++;

                // Send SMS confirmation of auto-charge
                try {
                  await sendAutoChargeNotification(
                    order.customerPhone,
                    order.customerName || 'Customer',
                    savedCard.brand || 'Card',
                    savedCard.last4 || '****',
                    storageFee,
                    order.trackingCode
                  );
                } catch (smsErr) {
                  console.error('[Cron] Failed to send auto-charge SMS:', smsErr);
                }
              } else {
                results.autoChargeFailed++;

                // Send SMS about failed auto-charge
                try {
                  await sendAutoChargeFailed(
                    order.customerPhone,
                    order.customerName || 'Customer',
                    storageFee,
                    order.trackingCode
                  );
                } catch (smsErr) {
                  console.error('[Cron] Failed to send auto-charge failed SMS:', smsErr);
                }
              }
            } catch (chargeErr) {
              console.error(`[Cron] Auto-charge error for order ${order.orderNumber}:`, chargeErr);
              results.autoChargeFailed++;
              results.errors++;
            }
          }
        }

        // Also update the order's storage fee and days
        if (storageFee !== order.storageFee || daysStored !== order.storageDays) {
          await db.order.update({
            where: { id: order.id },
            data: { storageFee, storageDays: daysStored },
          });
        }
      } catch (orderError) {
        console.error(`Failed to process order ${order.id}:`, orderError);
        results.errors++;
      }
    }

    // Also process ExpressOrders (kiosk-lite created orders)
    const storedExpressOrders = await db.expressOrder.findMany({
      where: {
        status: 'STORED',
        saveTime: { not: null },
        customerPhone: { not: null },
      },
    });

    for (const eo of storedExpressOrders) {
      if (!eo.saveTime || !eo.customerPhone) continue;

      try {
        const calc = getStorageCalculation(new Date(eo.saveTime));
        const daysStored = calc.totalDays;

        // Check if we've already notified for this express order
        const alreadyNotified = await db.notification.findFirst({
          where: {
            recipient: eo.customerPhone,
            templateKey: 'free_pickup_reminder',
            message: { contains: eo.pickCode },
            status: 'SENT',
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // last 24 hours
          },
        });

        // Day 3: Free pickup reminder
        if (daysStored === 3 && !alreadyNotified) {
          await sendFreePickupReminder(
            eo.customerPhone,
            eo.customerName || 'Customer',
            eo.pickCode,
            'Pickup Locker'
          );
          results.freePickupReminders++;
        }

        // Day 4+: Storage fee notification
        if (daysStored >= 4 && calc.storageFee > 0) {
          const feeNotified = await db.notification.findFirst({
            where: {
              recipient: eo.customerPhone,
              templateKey: 'storage_fee_applied',
              message: { contains: eo.pickCode },
              status: 'SENT',
              createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
          });

          if (!feeNotified) {
            const paymentRef = `SF-EO-${eo.id}-${Date.now()}`;
            await sendStorageFeeApplied(
              eo.customerPhone,
              eo.customerName || 'Customer',
              eo.pickCode,
              daysStored,
              calc.storageFee,
              paymentRef
            );
            results.storageFeeFirstDay++;
          }
        }

        // Auto-charge for ExpressOrders: find the user by phone, check for saved cards
        if (autoChargeEnabled && calc.storageFee > 0 && daysStored >= 4) {
          const user = await db.user.findFirst({
            where: { phone: eo.customerPhone },
            include: {
              savedPaymentMethods: {
                where: { isActive: true },
                orderBy: { isDefault: 'desc' },
                take: 1,
              },
            },
          });

          if (user && user.savedPaymentMethods.length > 0) {
            const savedCard = user.savedPaymentMethods[0];

            // Find or create an Order linked to this ExpressOrder
            const linkedOrder = await db.order.findFirst({
              where: { orderNumber: eo.orderNo },
            });

            if (linkedOrder) {
              // Check for recent auto-charge
              const recentAutoCharge = await db.payment.findFirst({
                where: {
                  orderId: linkedOrder.id,
                  type: 'STORAGE_FEE',
                  method: 'CARD',
                  status: 'COMPLETED',
                  description: { contains: 'Auto-charge' },
                  createdAt: {
                    gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                  },
                },
              });

              if (!recentAutoCharge) {
                try {
                  const chargeResult = await attemptAutoCharge(linkedOrder, savedCard, calc.storageFee, calc.chargeableDays);

                  if (chargeResult.success) {
                    results.autoCharged++;
                    try {
                      await sendAutoChargeNotification(
                        eo.customerPhone,
                        eo.customerName || 'Customer',
                        savedCard.brand || 'Card',
                        savedCard.last4 || '****',
                        calc.storageFee,
                        eo.pickCode
                      );
                    } catch (smsErr) {
                      console.error('[Cron] Failed to send auto-charge SMS:', smsErr);
                    }
                  } else {
                    results.autoChargeFailed++;
                  }
                } catch (chargeErr) {
                  console.error(`[Cron] Auto-charge error for EO ${eo.orderNo}:`, chargeErr);
                  results.autoChargeFailed++;
                }
              } else {
                results.autoChargeSkipped++;
              }
            }
          }
        }
      } catch (eoError) {
        console.error(`Failed to process express order ${eo.id}:`, eoError);
        results.errors++;
      }
    }

    // Log cron execution
    await db.activity.create({
      data: {
        action: 'CRON_STORAGE_NOTIFICATIONS',
        description: `Storage notifications processed: ${storedOrders.length} orders, ${storedExpressOrders.length} express orders`,
        metadata: JSON.stringify(results),
      },
    });

    return NextResponse.json({
      success: true,
      processed: storedOrders.length + storedExpressOrders.length,
      autoChargeEnabled,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Storage notification cron error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
    }, { status: 500 });
  }
}

/**
 * Attempt to auto-charge a saved card for storage fees
 * Returns { success: boolean, chargeId?: string, error?: string }
 */
async function attemptAutoCharge(
  order: { id: string; orderNumber: string; customerId: string; customerPhone: string; customerName: string | null },
  savedCard: { id: string; cardToken: string; brand: string | null; last4: string | null },
  amount: number,
  chargeableDays: number
): Promise<{ success: boolean; chargeId?: string; error?: string }> {
  // Get DimePay config for server-to-server charge
  const dimepayConfig = await getDimepayConfig();
  const effectiveClientId = dimepayConfig.sandboxMode
    ? dimepayConfig.sandboxClientId
    : dimepayConfig.liveClientId;
  const effectiveSecretKey = dimepayConfig.sandboxMode
    ? dimepayConfig.sandboxSecretKey
    : dimepayConfig.liveSecretKey;

  if (!effectiveClientId || !effectiveSecretKey) {
    console.error('[AutoCharge] DimePay not configured — cannot auto-charge');
    return { success: false, error: 'DimePay not configured' };
  }

  if (!savedCard.cardToken) {
    console.error('[AutoCharge] No card token on saved payment method:', savedCard.id);
    return { success: false, error: 'No card token' };
  }

  const sdkConfig: DimePaySDKConfig = {
    clientId: effectiveClientId,
    secretKey: effectiveSecretKey,
    sandboxMode: dimepayConfig.sandboxMode,
  };

  const chargeRef = `AUTO-SF-${order.orderNumber}-${Date.now()}`;

  try {
    // Call DimePay Cards API to charge the saved token
    const chargeResult = await chargeCardToken(
      {
        cardToken: savedCard.cardToken,
        amount: amount, // Amount in JMD dollars
        currency: 'JMD',
        orderId: chargeRef,
        description: `Auto-charge: Storage fee (${chargeableDays} days) - Order ${order.orderNumber}`,
        customerPhone: order.customerPhone,
        metadata: {
          type: 'storage_fee_auto_charge',
          orderId: order.id,
          orderNumber: order.orderNumber,
          savedPaymentMethodId: savedCard.id,
          chargeableDays,
        },
      },
      sdkConfig
    );

    if (chargeResult.success && chargeResult.data) {
      // Record the payment
      await db.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          type: 'STORAGE_FEE',
          amount: amount,
          feeAmount: 0,
          netAmount: amount,
          method: 'CARD',
          status: 'COMPLETED',
          gatewayRef: chargeResult.data.chargeId,
          gatewayResponse: JSON.stringify(chargeResult.data),
          description: `Auto-charge: Storage fee (${chargeableDays} days) - ${savedCard.brand} ****${savedCard.last4}`,
          paidAt: new Date(),
        },
      });

      // Update the saved card's last used timestamp
      await db.savedPaymentMethod.update({
        where: { id: savedCard.id },
        data: { lastUsedAt: new Date() },
      });

      // Log activity
      await db.activity.create({
        data: {
          userId: order.customerId,
          orderId: order.id,
          action: 'STORAGE_FEE_AUTO_CHARGED',
          description: `Storage fee JMD $${amount} auto-charged to ${savedCard.brand} ****${savedCard.last4} for order ${order.orderNumber}`,
          metadata: JSON.stringify({
            chargeRef,
            amount,
            cardBrand: savedCard.brand,
            cardLast4: savedCard.last4,
          }),
        },
      });

      console.log(`[AutoCharge] SUCCESS: JMD $${amount} charged to ${savedCard.brand} ****${savedCard.last4} for order ${order.orderNumber}`);
      return { success: true, chargeId: chargeResult.data.chargeId };
    } else {
      // Charge failed — record it
      await db.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          type: 'STORAGE_FEE',
          amount: amount,
          method: 'CARD',
          status: 'FAILED',
          gatewayRef: chargeRef,
          description: `Auto-charge FAILED: ${savedCard.brand} ****${savedCard.last4} - ${chargeResult.error || 'Unknown error'}`,
        },
      });

      console.error(`[AutoCharge] FAILED for order ${order.orderNumber}: ${chargeResult.error}`);
      return { success: false, error: chargeResult.error || 'Charge failed' };
    }
  } catch (error) {
    console.error(`[AutoCharge] Exception for order ${order.orderNumber}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// POST for manual trigger (with auth)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { secret, orderId } = body;
  
  const cronSecret = process.env.CRON_SECRET || 'pickup-cron-2024';
  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Manual trigger for specific order (useful for testing)
  if (orderId) {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            savedPaymentMethods: {
              where: { isActive: true },
              orderBy: { isDefault: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.storageStartAt) {
      return NextResponse.json({ error: 'No storage start date' }, { status: 400 });
    }

    const calc = getStorageCalculation(new Date(order.storageStartAt));

    // Try auto-charge if card available
    let chargeResult = null;
    if (order.customer?.savedPaymentMethods?.length > 0 && calc.storageFee > 0) {
      const savedCard = order.customer.savedPaymentMethods[0];
      chargeResult = await attemptAutoCharge(order, savedCard, calc.storageFee, calc.chargeableDays);
    }

    // Send reminder SMS
    if (order.customerPhone) {
      await sendStorageFeeApplied(
        order.customerPhone,
        order.customerName,
        order.trackingCode,
        calc.totalDays,
        calc.storageFee,
        `SF-MANUAL-${order.id}-${Date.now()}`
      );
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      storageDays: calc.totalDays,
      storageFee: calc.storageFee,
      autoCharge: chargeResult,
    });
  }

  // No specific order — run full cron
  return GET(request);
}
