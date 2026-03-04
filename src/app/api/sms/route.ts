import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { 
  sendSMS, 
  getDeviceStatus 
} from '@/lib/textbee';
import { getSetting } from '@/lib/settings';

// Calculate SMS segments (160 chars per segment, 153 if using concatenation)
function calculateSegments(message: string): number {
  const length = message.length;
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

// Process template with variables
function processTemplate(template: string, variables: Record<string, string | number>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return processed;
}

// Get business signature from settings
async function getSignature(): Promise<string> {
  const signature = await getSetting('sms_signature', 'SMS_SIGNATURE');
  return signature || 'Pickup Jamaica';
}

// Get cost per SMS from settings
async function getCostPerSms(): Promise<number> {
  const costStr = await getSetting('sms_costPerSms', 'SMS_COST_PER_SMS');
  return parseFloat(costStr) || 5; // Default 5 JMD per SMS
}

// Helper to save notification to database
async function saveNotification(
  phone: string, 
  message: string, 
  success: boolean, 
  messageId?: string, 
  error?: string,
  templateKey?: string,
  cost?: number,
  segments?: number
) {
  try {
    // Find or create a system user for notifications
    let systemUser = await prisma.user.findFirst({
      where: { email: 'system@pickupja.com' }
    });
    
    if (!systemUser) {
      try {
        systemUser = await prisma.user.create({
          data: {
            email: 'system@pickupja.com',
            name: 'System',
            role: 'ADMIN',
          }
        });
      } catch {
        systemUser = await prisma.user.findFirst({
          where: { email: 'system@pickupja.com' }
        });
      }
    }
    
    if (!systemUser) {
      console.error('Could not create or find system user');
      return;
    }

    await prisma.notification.create({
      data: {
        userId: systemUser.id,
        type: 'SMS',
        status: success ? 'SENT' : 'FAILED',
        recipient: phone,
        message: message,
        templateKey: templateKey || null,
        gatewayRef: messageId || null,
        errorMessage: error || null,
        sentAt: success ? new Date() : null,
        cost: cost || null,
        segments: segments || null,
      }
    });
  } catch (err) {
    console.error('Failed to save notification:', err);
  }
}

// POST /api/sms - Send SMS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, phone, message, data, useTemplate } = body;

    let result;
    let phoneUsed = phone || data?.phone;
    let messageUsed = message;
    let templateKey: string | undefined;
    let finalMessage = message;

    // Get signature and cost settings
    const signature = await getSignature();
    const costPerSms = await getCostPerSms();

    // If using template, process it
    if (useTemplate && data?.templateKey) {
      const template = await prisma.smsTemplate.findUnique({
        where: { key: data.templateKey }
      });
      
      if (template) {
        templateKey = data.templateKey;
        // Add signature to variables
        const variables = { ...data.variables, signature };
        finalMessage = processTemplate(template.template, variables);
        messageUsed = finalMessage;
      }
    } else if (message && !message.includes('{{signature}}')) {
      // Append signature if not already included
      finalMessage = `${message}\n\n${signature}`;
      messageUsed = finalMessage;
    }

    switch (action) {
      case 'send':
        if (!phone || !finalMessage) {
          return NextResponse.json({
            success: false,
            error: 'Phone and message are required',
          }, { status: 400 });
        }
        result = await sendSMS(phone, finalMessage);
        break;

      case 'send_template':
        if (!data?.phone || !data?.templateKey) {
          return NextResponse.json({
            success: false,
            error: 'Phone and templateKey are required',
          }, { status: 400 });
        }
        
        const templateRecord = await prisma.smsTemplate.findUnique({
          where: { key: data.templateKey }
        });
        
        if (!templateRecord) {
          return NextResponse.json({
            success: false,
            error: 'Template not found',
          }, { status: 400 });
        }
        
        templateKey = data.templateKey;
        // Add signature to variables
        const templateVariables = { ...data.variables, signature };
        finalMessage = processTemplate(templateRecord.template, templateVariables);
        phoneUsed = data.phone;
        messageUsed = finalMessage;
        
        // Send without adding signature again (template already includes it)
        result = await sendSMS(data.phone, finalMessage, true);
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: send, send_template',
        }, { status: 400 });
    }

    // Calculate cost
    const segments = calculateSegments(finalMessage || '');
    const cost = segments * costPerSms;

    // Save to notification history
    await saveNotification(
      phoneUsed,
      messageUsed || 'SMS notification',
      result.success,
      result.messageId,
      result.error,
      templateKey,
      cost,
      segments
    );

    // Return result with cost info
    return NextResponse.json({
      ...result,
      segments,
      estimatedCost: cost
    });

  } catch (error) {
    console.error('SMS API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/sms - Get SMS history and stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get TextBee device status for real stats
    const deviceStatus = await getDeviceStatus();
    
    // Get notification history from database
    const notifications = await prisma.notification.findMany({
      where: { type: 'SMS' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get counts
    const totalSent = await prisma.notification.count({
      where: { type: 'SMS', status: { in: ['SENT', 'DELIVERED'] } }
    });
    
    const totalFailed = await prisma.notification.count({
      where: { type: 'SMS', status: 'FAILED' }
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const sentToday = await prisma.notification.count({
      where: { 
        type: 'SMS', 
        status: { in: ['SENT', 'DELIVERED'] },
        createdAt: { gte: todayStart }
      }
    });

    // Get cost totals
    const costAggregate = await prisma.notification.aggregate({
      where: { type: 'SMS', cost: { not: null } },
      _sum: { cost: true }
    });

    const todayCostAggregate = await prisma.notification.aggregate({
      where: { 
        type: 'SMS', 
        cost: { not: null },
        createdAt: { gte: todayStart }
      },
      _sum: { cost: true }
    });

    return NextResponse.json({
      success: true,
      device: deviceStatus.success ? {
        online: deviceStatus.online,
        brand: deviceStatus.details?.brand,
        model: deviceStatus.details?.model,
        totalSentViaTextBee: deviceStatus.details?.sentSMSCount,
        totalReceived: deviceStatus.details?.receivedSMSCount,
      } : null,
      stats: {
        totalSent,
        totalFailed,
        sentToday,
        textBeeTotal: deviceStatus.details?.sentSMSCount || 0,
        totalCost: costAggregate._sum.cost || 0,
        todayCost: todayCostAggregate._sum.cost || 0,
      },
      history: notifications.map(n => ({
        id: n.id,
        to: n.recipient,
        message: n.message,
        status: n.status,
        templateKey: n.templateKey,
        cost: n.cost,
        segments: n.segments,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('SMS status error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
