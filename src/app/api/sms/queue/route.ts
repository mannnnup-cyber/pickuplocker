import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendSMS } from '@/lib/textbee';

// GET SMS queue (pending, failed, sent messages)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all'; // all, pending, sent, failed, delivered
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const whereClause: Record<string, unknown> = { type: 'SMS' };
    
    if (status !== 'all') {
      if (status === 'pending') {
        whereClause.status = { in: ['PENDING'] };
      } else if (status === 'failed') {
        whereClause.status = 'FAILED';
      } else if (status === 'sent') {
        whereClause.status = { in: ['SENT', 'DELIVERED'] };
      }
    }

    const [messages, totalCount, stats] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: whereClause }),
      getQueueStats()
    ]);

    return NextResponse.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        to: m.recipient,
        message: m.message,
        status: m.status,
        gatewayStatus: m.gatewayStatus,
        templateKey: m.templateKey,
        cost: m.cost,
        segments: m.segments,
        retryCount: m.retryCount,
        maxRetries: m.maxRetries,
        errorMessage: m.errorMessage,
        sentAt: m.sentAt?.toISOString(),
        deliveredAt: m.deliveredAt?.toISOString(),
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: totalCount > offset + limit
      },
      stats
    });
  } catch (error) {
    console.error('Failed to fetch SMS queue:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch SMS queue'
    }, { status: 500 });
  }
}

// POST retry failed message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, messageId, messageIds } = body;

    if (action === 'retry') {
      const ids = messageId ? [messageId] : messageIds;
      if (!ids || ids.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Message ID(s) required'
        }, { status: 400 });
      }

      const results = [];
      for (const id of ids) {
        const notification = await prisma.notification.findUnique({ where: { id } });
        if (!notification) continue;
        
        if (notification.retryCount >= notification.maxRetries) {
          results.push({ id, success: false, error: 'Max retries exceeded' });
          continue;
        }

        // Retry sending
        const result = await sendSMS(notification.recipient, notification.message);
        
        if (result.success) {
          await prisma.notification.update({
            where: { id },
            data: {
              status: 'SENT',
              gatewayRef: result.messageId,
              sentAt: new Date(),
              retryCount: { increment: 1 }
            }
          });
          results.push({ id, success: true });
        } else {
          await prisma.notification.update({
            where: { id },
            data: {
              status: 'FAILED',
              errorMessage: result.error,
              retryCount: { increment: 1 }
            }
          });
          results.push({ id, success: false, error: result.error });
        }
      }

      return NextResponse.json({
        success: true,
        results,
        retried: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 });
  } catch (error) {
    console.error('Failed to process queue action:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process action'
    }, { status: 500 });
  }
}

// DELETE message from queue
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    if (ids) {
      const idList = ids.split(',');
      await prisma.notification.deleteMany({
        where: { id: { in: idList } }
      });
      return NextResponse.json({
        success: true,
        deleted: idList.length
      });
    }

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Message ID required'
      }, { status: 400 });
    }

    await prisma.notification.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'Message deleted'
    });
  } catch (error) {
    console.error('Failed to delete message:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete message'
    }, { status: 500 });
  }
}

// Helper to get queue statistics
async function getQueueStats() {
  const [pending, sent, delivered, failed, totalCost] = await Promise.all([
    prisma.notification.count({ where: { type: 'SMS', status: 'PENDING' } }),
    prisma.notification.count({ where: { type: 'SMS', status: 'SENT' } }),
    prisma.notification.count({ where: { type: 'SMS', status: 'DELIVERED' } }),
    prisma.notification.count({ where: { type: 'SMS', status: 'FAILED' } }),
    prisma.notification.aggregate({
      where: { type: 'SMS', cost: { not: null } },
      _sum: { cost: true }
    })
  ]);

  return {
    pending,
    sent,
    delivered,
    failed,
    totalCost: totalCost._sum.cost || 0
  };
}
