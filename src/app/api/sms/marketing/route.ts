import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendBulkSMS } from '@/lib/textbee';

/**
 * Bulk SMS Marketing API
 * 
 * Features:
 * - Send marketing SMS to all customers or filtered segments
 * - Track campaign performance
 * - Schedule campaigns for future delivery
 * - Customer segmentation (active, inactive, by courier, etc.)
 */

// POST - Send marketing campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action,
      // Campaign details
      campaignName,
      message,
      targetSegment,
      customPhones,
      scheduledAt,
    } = body;

    // Calculate recipient count for preview
    if (action === 'preview') {
      return await previewRecipients(targetSegment, customPhones);
    }

    // Send campaign
    if (action === 'send') {
      return await sendCampaign({
        campaignName,
        message,
        targetSegment,
        customPhones,
        scheduledAt,
      });
    }

    // Get campaign history
    if (action === 'history') {
      return await getCampaignHistory();
    }

    // Get campaign stats
    if (action === 'stats') {
      return await getCampaignStats();
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: preview, send, history, stats',
    }, { status: 400 });

  } catch (error) {
    console.error('Marketing SMS error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// Preview recipients count
async function previewRecipients(
  targetSegment: string,
  customPhones?: string[]
) {
  let recipients: Array<{ phone: string; name: string }> = [];

  switch (targetSegment) {
    case 'all_customers':
      // Get all unique customer phones from orders
      const customers = await db.order.findMany({
        where: { customerPhone: { not: null } },
        select: { customerPhone: true, customerName: true },
      });
      // Deduplicate by phone
      const seenPhones = new Set<string>();
      for (const c of customers) {
        if (c.customerPhone && !seenPhones.has(c.customerPhone)) {
          seenPhones.add(c.customerPhone);
          recipients.push({
            phone: c.customerPhone,
            name: c.customerName,
          });
        }
      }
      break;

    case 'active_customers':
      // Customers with orders in last 30 days
      const activeCustomers = await db.order.findMany({
        where: {
          customerPhone: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { customerPhone: true, customerName: true },
      });
      const activeSeenPhones = new Set<string>();
      for (const c of activeCustomers) {
        if (c.customerPhone && !activeSeenPhones.has(c.customerPhone)) {
          activeSeenPhones.add(c.customerPhone);
          recipients.push({
            phone: c.customerPhone,
            name: c.customerName,
          });
        }
      }
      break;

    case 'inactive_customers':
      // Customers with no orders in last 60 days but had orders before
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const inactiveCustomers = await db.order.findMany({
        where: {
          customerPhone: { not: null },
          createdAt: {
            lt: thirtyDaysAgo,
            gte: sixtyDaysAgo,
          },
        },
        select: { customerPhone: true, customerName: true },
      });
      const inactiveSeenPhones = new Set<string>();
      for (const c of inactiveCustomers) {
        if (c.customerPhone && !inactiveSeenPhones.has(c.customerPhone)) {
          inactiveSeenPhones.add(c.customerPhone);
          recipients.push({
            phone: c.customerPhone,
            name: c.customerName,
          });
        }
      }
      break;

    case 'pending_pickup':
      // Customers with stored orders (not yet picked up)
      const pendingCustomers = await db.order.findMany({
        where: {
          customerPhone: { not: null },
          status: { in: ['STORED', 'READY'] },
        },
        select: { customerPhone: true, customerName: true },
      });
      const pendingSeenPhones = new Set<string>();
      for (const c of pendingCustomers) {
        if (c.customerPhone && !pendingSeenPhones.has(c.customerPhone)) {
          pendingSeenPhones.add(c.customerPhone);
          recipients.push({
            phone: c.customerPhone,
            name: c.customerName,
          });
        }
      }
      break;

    case 'courier_customers':
      // Customers who used courier services
      const courierCustomers = await db.order.findMany({
        where: {
          customerPhone: { not: null },
          courierId: { not: null },
        },
        select: { customerPhone: true, customerName: true },
      });
      const courierSeenPhones = new Set<string>();
      for (const c of courierCustomers) {
        if (c.customerPhone && !courierSeenPhones.has(c.customerPhone)) {
          courierSeenPhones.add(c.customerPhone);
          recipients.push({
            phone: c.customerPhone,
            name: c.customerName,
          });
        }
      }
      break;

    case 'custom':
      // Custom phone list
      if (customPhones && Array.isArray(customPhones)) {
        recipients = customPhones.map(phone => ({
          phone: phone.replace(/[^0-9+]/g, ''),
          name: 'Customer',
        }));
      }
      break;

    default:
      return NextResponse.json({
        success: false,
        error: 'Invalid target segment',
      }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRecipients: recipients.length,
      recipients: recipients.slice(0, 10), // Preview first 10
      segment: targetSegment,
    },
  });
}

// Send marketing campaign
async function sendCampaign(params: {
  campaignName: string;
  message: string;
  targetSegment: string;
  customPhones?: string[];
  scheduledAt?: string;
}) {
  const { campaignName, message, targetSegment, customPhones, scheduledAt } = params;

  if (!message) {
    return NextResponse.json({
      success: false,
      error: 'Message is required',
    }, { status: 400 });
  }

  // Get recipients
  const previewRes = await previewRecipients(targetSegment, customPhones);
  const previewData = await previewRes.json();
  
  if (!previewData.success) {
    return previewRes;
  }

  const responseData = previewData as { data: { recipients: Array<{ phone: string; name: string }>; totalRecipients: number } };
  const recipients = responseData.data.recipients;
  const totalRecipients = responseData.data.totalRecipients;

  if (totalRecipients === 0) {
    return NextResponse.json({
      success: false,
      error: 'No recipients found for this segment',
    }, { status: 400 });
  }

  // Create campaign record
  const campaign = await db.smsCampaign.create({
    data: {
      name: campaignName || `Campaign ${new Date().toISOString()}`,
      message,
      targetSegment,
      totalRecipients,
      status: scheduledAt ? 'SCHEDULED' : 'SENDING',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  });

  // If scheduled, return early
  if (scheduledAt) {
    return NextResponse.json({
      success: true,
      data: {
        campaignId: campaign.id,
        status: 'SCHEDULED',
        scheduledAt,
        totalRecipients,
      },
    });
  }

  // Process message template (replace variables)
  const messages = recipients.map(recipient => ({
    to: recipient.phone,
    message: message
      .replace(/{name}/g, recipient.name)
      .replace(/{phone}/g, recipient.phone),
  }));

  // Send bulk SMS
  const result = await sendBulkSMS(messages);

  // Update campaign status
  await db.smsCampaign.update({
    where: { id: campaign.id },
    data: {
      status: result.success ? 'SENT' : 'FAILED',
      sentAt: new Date(),
      sentCount: result.sent,
      failedCount: result.failed,
    },
  });

  // Log activity
  await db.activity.create({
    data: {
      action: 'MARKETING_SMS_SENT',
      description: `Marketing campaign "${campaignName}" sent to ${result.sent} recipients`,
      metadata: JSON.stringify({
        campaignId: campaign.id,
        sent: result.sent,
        failed: result.failed,
      }),
    },
  });

  return NextResponse.json({
    success: result.success,
    data: {
      campaignId: campaign.id,
      sent: result.sent,
      failed: result.failed,
      totalRecipients,
    },
  });
}

// Get campaign history
async function getCampaignHistory() {
  const campaigns = await db.smsCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    data: campaigns,
  });
}

// Get campaign statistics
async function getCampaignStats() {
  const [totalCampaigns, totalSent, totalRecipients, recentCampaigns] = await Promise.all([
    db.smsCampaign.count(),
    db.smsCampaign.aggregate({
      _sum: { sentCount: true },
    }),
    db.smsCampaign.aggregate({
      _sum: { totalRecipients: true },
    }),
    db.smsCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      totalCampaigns,
      totalSent: totalSent._sum.sentCount || 0,
      totalRecipients: totalRecipients._sum.totalRecipients || 0,
      recentCampaigns,
    },
  });
}

// GET - Fetch segments and campaigns
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const segments = searchParams.get('segments');

    if (segments === 'list') {
      // Return available segments with counts
      const [
        allCustomers,
        activeCustomers,
        inactiveCustomers,
        pendingCount,
        courierCustomers,
      ] = await Promise.all([
        db.order.findMany({
          where: { customerPhone: { not: null } },
          select: { customerPhone: true },
        }),
        db.order.findMany({
          where: {
            customerPhone: { not: null },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: { customerPhone: true },
        }),
        db.order.findMany({
          where: {
            customerPhone: { not: null },
            createdAt: {
              lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            },
          },
          select: { customerPhone: true },
        }),
        db.order.count({
          where: {
            customerPhone: { not: null },
            status: { in: ['STORED', 'READY'] },
          },
        }),
        db.order.findMany({
          where: {
            customerPhone: { not: null },
            courierId: { not: null },
          },
          select: { customerPhone: true },
        }),
      ]);

      // Count unique phones
      const countUnique = (arr: { customerPhone: string | null }[]) => {
        const set = new Set(arr.filter(c => c.customerPhone).map(c => c.customerPhone));
        return set.size;
      };

      return NextResponse.json({
        success: true,
        data: {
          segments: [
            { id: 'all_customers', name: 'All Customers', count: countUnique(allCustomers) },
            { id: 'active_customers', name: 'Active Customers (30 days)', count: countUnique(activeCustomers) },
            { id: 'inactive_customers', name: 'Inactive Customers (30-60 days)', count: countUnique(inactiveCustomers) },
            { id: 'pending_pickup', name: 'Pending Pickup', count: pendingCount },
            { id: 'courier_customers', name: 'Courier Customers', count: countUnique(courierCustomers) },
            { id: 'custom', name: 'Custom List', count: 0 },
          ],
        },
      });
    }

    // Return campaign history by default
    return getCampaignHistory();
  } catch (error) {
    console.error('Failed to get marketing data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get marketing data',
    }, { status: 500 });
  }
}
