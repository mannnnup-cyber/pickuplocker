import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import { sendStorageFeeNotification, sendOverdueReminder } from '@/lib/textbee';

/**
 * SMS Reminder Cron Job
 * 
 * Call this endpoint periodically (e.g., every 6 hours) to send reminders
 * 
 * Triggers:
 * - Day 3: Warning that free period is ending
 * - Day 4+: Daily reminders with current fee
 * - Day 7, 14, 21, 28: Escalating warnings
 * - Day 29: Final warning before abandonment
 */

// Simple auth for cron jobs
const CRON_SECRET = process.env.CRON_SECRET || 'pickup-cron-secret-2025';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = {
      remindersSent: 0,
      finalWarnings: 0,
      abandonedMarked: 0,
      errors: [] as string[],
    };

    // Find all active orders (STORED status)
    const activeOrders = await db.order.findMany({
      where: {
        status: 'STORED',
        storageStartAt: { not: null },
      },
      include: { device: true },
    });

    for (const order of activeOrders) {
      try {
        const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
        const storageCalc = getStorageCalculation(new Date(storageStart));
        
        // Mark as abandoned if over 30 days
        if (storageCalc.isAbandoned) {
          await db.order.update({
            where: { id: order.id },
            data: { 
              status: 'ABANDONED', 
              abandonedAt: new Date(),
              abandonedReason: 'Exceeded 30 day storage limit',
            },
          });
          results.abandonedMarked++;
          continue;
        }

        // Check if we should send a reminder today
        const shouldSend = shouldSendReminder(order, storageCalc.totalDays);
        
        if (!shouldSend) continue;

        // Send appropriate reminder
        if (storageCalc.daysUntilAbandoned <= 1) {
          // Final warning - day 29
          await sendOverdueReminder(
            order.customerPhone,
            order.customerName,
            storageCalc.totalDays,
            storageCalc.storageFee,
            storageCalc.daysUntilAbandoned
          );
          results.finalWarnings++;
        } else {
          // Regular reminder
          await sendStorageFeeNotification(
            order.customerPhone,
            order.customerName,
            storageCalc.totalDays,
            storageCalc.storageFee
          );
        }

        // Log notification
        await db.notification.create({
          data: {
            userId: order.customerId,
            orderId: order.id,
            type: 'SMS',
            status: 'SENT',
            recipient: order.customerPhone,
            message: `Storage reminder: Day ${storageCalc.totalDays}, Fee: JMD $${storageCalc.storageFee}`,
            sentAt: new Date(),
          },
        });

        results.remindersSent++;

      } catch (error) {
        console.error(`Failed to process order ${order.orderNumber}:`, error);
        results.errors.push(`${order.orderNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedOrders: activeOrders.length,
      ...results,
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function shouldSendReminder(order: { updatedAt: Date }, storageDays: number): boolean {
  // Don't send more than once per day
  const hoursSinceLastUpdate = (Date.now() - new Date(order.updatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastUpdate < 20) return false; // At least 20 hours between reminders

  // Day 3: Free period ending warning
  if (storageDays === 3) return true;

  // Days 4-7: Daily reminders
  if (storageDays >= 4 && storageDays <= 7) return true;

  // Days 8-14: Daily reminders
  if (storageDays >= 8 && storageDays <= 14) return true;

  // Days 15-28: Every 2 days
  if (storageDays >= 15 && storageDays <= 28 && storageDays % 2 === 0) return true;

  // Day 29: Final warning
  if (storageDays === 29) return true;

  // Days 21, 28: Escalating warnings
  if ([21, 28].includes(storageDays)) return true;

  return false;
}

// POST for manual trigger (with auth)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { secret, orderId } = body;
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Manual trigger for specific order
  if (orderId) {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { device: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
    const storageCalc = getStorageCalculation(new Date(storageStart));

    await sendStorageFeeNotification(
      order.customerPhone,
      order.customerName,
      storageCalc.totalDays,
      storageCalc.storageFee
    );

    return NextResponse.json({
      success: true,
      message: 'Reminder sent',
      storageDays: storageCalc.totalDays,
      storageFee: storageCalc.storageFee,
    });
  }

  return GET(request);
}
