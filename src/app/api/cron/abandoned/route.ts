import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSMS } from '@/lib/textbee';
import { getSetting } from '@/lib/settings';

/**
 * Abandoned Package Workflow Cron Job
 * 
 * Automated escalation for packages:
 * - Day 3-7: First reminder SMS
 * - Day 8-14: Second reminder SMS + email
 * - Day 15-24: Final warning + fee escalation
 * - Day 25-30: Abandoned notice
 * - Day 30+: Mark as ABANDONED
 * 
 * Call this endpoint via cron job (e.g., every 6 hours)
 * Recommended cron: "0 *slash*6 * * *" (every 6 hours)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    // Verify cron secret to prevent unauthorized access
    const cronSecret = process.env.CRON_SECRET || 'pickup-cron-2024';
    if (secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const results = {
      reminders3to7: 0,
      reminders8to14: 0,
      warnings15to24: 0,
      abandonedNotices: 0,
      markedAbandoned: 0,
      errors: [] as string[],
    };

    // Find orders that need attention
    const storedOrders = await db.order.findMany({
      where: {
        status: { in: ['STORED', 'READY'] },
      },
      include: {
        device: true,
        notifications: {
          where: {
            type: 'SMS',
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    for (const order of storedOrders) {
      const daysStored = Math.floor(
        (now.getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check if we already sent a notification today
      const lastNotification = order.notifications[0];
      if (lastNotification) {
        const hoursSinceLastNotification = 
          (now.getTime() - new Date(lastNotification.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastNotification < 20) {
          continue; // Skip if notified within last 20 hours
        }
      }

      try {
        // Day 3-7: First reminder
        if (daysStored >= 3 && daysStored <= 7) {
          await sendReminderNotification(order, 'first', daysStored);
          results.reminders3to7++;
        }
        // Day 8-14: Second reminder
        else if (daysStored >= 8 && daysStored <= 14) {
          await sendReminderNotification(order, 'second', daysStored);
          results.reminders8to14++;
        }
        // Day 15-24: Final warning
        else if (daysStored >= 15 && daysStored <= 24) {
          await sendReminderNotification(order, 'warning', daysStored);
          results.warnings15to24++;
          
          // Update order status to READY if not already
          if (order.status === 'STORED') {
            await db.order.update({
              where: { id: order.id },
              data: { status: 'READY' },
            });
          }
        }
        // Day 25-29: Abandoned notice
        else if (daysStored >= 25 && daysStored <= 29) {
          await sendReminderNotification(order, 'abandoned_notice', daysStored);
          results.abandonedNotices++;
        }
        // Day 30+: Mark as abandoned
        else if (daysStored >= 30) {
          await db.order.update({
            where: { id: order.id },
            data: {
              status: 'ABANDONED',
              abandonedAt: now,
              abandonedReason: `Package not collected after ${daysStored} days`,
            },
          });
          
          // Log activity
          await db.activity.create({
            data: {
              action: 'ORDER_ABANDONED',
              description: `Order ${order.orderNumber} marked as abandoned after ${daysStored} days`,
              orderId: order.id,
            },
          });
          
          results.markedAbandoned++;
        }

      } catch (error) {
        console.error(`Failed to process order ${order.orderNumber}:`, error);
        results.errors.push(`Order ${order.orderNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Log cron execution
    await db.activity.create({
      data: {
        action: 'CRON_ABANDONED_CHECK',
        description: `Processed ${storedOrders.length} stored orders`,
        metadata: JSON.stringify(results),
      },
    });

    return NextResponse.json({
      success: true,
      processedAt: now.toISOString(),
      ordersChecked: storedOrders.length,
      results,
    });

  } catch (error) {
    console.error('Abandoned package cron error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// Helper function to send reminder notifications
async function sendReminderNotification(
  order: {
    id: string;
    orderNumber: string;
    trackingCode: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    storageFee: number;
    device: { name: string } | null;
    boxNumber: number | null;
  },
  type: 'first' | 'second' | 'warning' | 'abandoned_notice',
  daysStored: number
) {
  const templates = {
    first: `Hi ${order.customerName}, your package at ${order.device?.name || 'our locker'} has been stored for ${daysStored} days. Pickup code: ${order.trackingCode}. Storage fees may apply after 3 free days.`,
    second: `REMINDER: ${order.customerName}, your package has been stored for ${daysStored} days. Current storage fee: $${order.storageFee} JMD. Please pick up soon. Code: ${order.trackingCode}`,
    warning: `URGENT: ${order.customerName}, your package has been stored for ${daysStored} days. Storage fee: $${order.storageFee} JMD. Package may be considered abandoned after 30 days. Pickup code: ${order.trackingCode}`,
    abandoned_notice: `FINAL NOTICE: ${order.customerName}, your package will be marked as abandoned in ${30 - daysStored} days. Storage fee: $${order.storageFee} JMD. Contact us immediately. Code: ${order.trackingCode}`,
  };

  const message = templates[type];

  // Send SMS
  try {
    await sendSMS(order.customerPhone, message);
    
    // Log notification
    await db.notification.create({
      data: {
        userId: 'system',
        orderId: order.id,
        type: 'SMS',
        status: 'SENT',
        recipient: order.customerPhone,
        message,
        templateKey: `abandoned_${type}`,
        sentAt: new Date(),
      },
    });
  } catch (smsError) {
    console.error('Failed to send SMS:', smsError);
    
    // Log failed notification
    await db.notification.create({
      data: {
        userId: 'system',
        orderId: order.id,
        type: 'SMS',
        status: 'FAILED',
        recipient: order.customerPhone,
        message,
        templateKey: `abandoned_${type}`,
        errorMessage: smsError instanceof Error ? smsError.message : 'Unknown error',
      },
    });
    
    throw smsError;
  }
}
