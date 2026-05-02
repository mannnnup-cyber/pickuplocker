import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import {
  sendFreePickupReminder,
  sendStorageFeeApplied,
  sendOverdueReminder,
} from '@/lib/textbee';

/**
 * Storage Fee Notification Cron Job
 * 
 * Call this endpoint periodically (e.g., once per day via Vercel Cron or external scheduler)
 * to send SMS notifications about storage fees.
 * 
 * GET /api/cron/storage-notifications?key=CRON_SECRET
 * 
 * Notification cadence:
 * - Day 3: Free pickup reminder (free period ending today)
 * - Day 4: Storage fee applied (first day of fees)
 * - Day 7: Overdue reminder (fees growing, risk of abandonment)
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
    errors: 0,
  };

  const now = new Date();

  try {
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
              in: ['free_pickup_reminder', 'storage_fee_applied', 'overdue_reminder'],
            },
            status: 'SENT',
          },
        });

        const sentTemplates = new Set(existingNotifications.map(n => n.templateKey));

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
        if (daysStored >= 7 && storageFee > 0 && !sentTemplates.has('overdue_reminder')) {
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
      } catch (eoError) {
        console.error(`Failed to process express order ${eo.id}:`, eoError);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: storedOrders.length + storedExpressOrders.length,
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
