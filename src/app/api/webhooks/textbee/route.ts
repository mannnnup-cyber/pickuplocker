import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * TextBee SMS Delivery Receipts Webhook
 * 
 * Handles delivery status callbacks from TextBee
 * TextBee sends webhooks when SMS messages are:
 * - Sent successfully
 * - Delivered to recipient
 * - Failed to deliver
 * 
 * Configure webhook URL in TextBee dashboard:
 * https://your-domain/api/webhooks/textbee
 */

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-textbee-signature') || '';
    
    // Verify signature (if configured)
    const expectedSignature = process.env.TEXTBEE_WEBHOOK_SECRET;
    if (expectedSignature && signature !== expectedSignature) {
      console.error('Invalid TextBee webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(payload);
    const event = data.event || data.type;
    const messageData = data.data || data.message;

    console.log(`TextBee webhook received: ${event}`, messageData);

    // Handle different event types
    switch (event) {
      case 'sms.sent':
        await handleSMSSent(messageData);
        break;
      
      case 'sms.delivered':
        await handleSMSDelivered(messageData);
        break;
      
      case 'sms.failed':
        await handleSMSFailed(messageData);
        break;
      
      case 'sms.undelivered':
        await handleSMSUndelivered(messageData);
        break;
      
      default:
        console.log(`Unhandled TextBee webhook event: ${event}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('TextBee webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed' 
    }, { status: 500 });
  }
}

// SMS Sent - Message was sent from device
async function handleSMSSent(data: {
  id: string;
  batchId?: string;
  to: string;
  message?: string;
  timestamp: string;
}) {
  // Update notification status
  const updated = await db.notification.updateMany({
    where: {
      gatewayRef: data.batchId || data.id,
      status: 'PENDING',
    },
    data: {
      status: 'SENT',
      gatewayStatus: 'sent',
      sentAt: new Date(),
    },
  });

  console.log(`SMS sent to ${data.to}, updated ${updated.count} records`);
}

// SMS Delivered - Message was delivered to recipient
async function handleSMSDelivered(data: {
  id: string;
  batchId?: string;
  to: string;
  timestamp: string;
}) {
  // Update notification status
  const updated = await db.notification.updateMany({
    where: {
      gatewayRef: data.batchId || data.id,
      status: 'SENT',
    },
    data: {
      status: 'DELIVERED',
      gatewayStatus: 'delivered',
      deliveredAt: new Date(),
    },
  });

  // Log delivery
  await db.activity.create({
    data: {
      action: 'SMS_DELIVERED',
      description: `SMS delivered to ${data.to}`,
      metadata: JSON.stringify({
        messageId: data.id,
        batchId: data.batchId,
        to: data.to,
      }),
    },
  });

  console.log(`SMS delivered to ${data.to}, updated ${updated.count} records`);
}

// SMS Failed - Message failed to send
async function handleSMSFailed(data: {
  id: string;
  batchId?: string;
  to: string;
  error?: string;
  errorCode?: string;
  timestamp: string;
}) {
  // Update notification status
  const updated = await db.notification.updateMany({
    where: {
      gatewayRef: data.batchId || data.id,
    },
    data: {
      status: 'FAILED',
      gatewayStatus: 'failed',
      errorMessage: data.error || data.errorCode || 'Delivery failed',
    },
  });

  // Log failure
  await db.activity.create({
    data: {
      action: 'SMS_FAILED',
      description: `SMS failed to ${data.to}: ${data.error || 'Unknown error'}`,
      metadata: JSON.stringify({
        messageId: data.id,
        batchId: data.batchId,
        to: data.to,
        error: data.error,
        errorCode: data.errorCode,
      }),
    },
  });

  console.log(`SMS failed to ${data.to}: ${data.error}`);
}

// SMS Undelivered - Message could not be delivered
async function handleSMSUndelivered(data: {
  id: string;
  batchId?: string;
  to: string;
  error?: string;
  timestamp: string;
}) {
  // Update notification status
  const updated = await db.notification.updateMany({
    where: {
      gatewayRef: data.batchId || data.id,
    },
    data: {
      status: 'FAILED',
      gatewayStatus: 'undelivered',
      errorMessage: data.error || 'Message undelivered',
    },
  });

  console.log(`SMS undelivered to ${data.to}`);
}

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  // TextBee may send a challenge for webhook verification
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  
  return NextResponse.json({ 
    status: 'ok',
    message: 'TextBee webhook endpoint ready',
  });
}
