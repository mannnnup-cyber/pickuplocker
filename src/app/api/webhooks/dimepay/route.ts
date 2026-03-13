import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/dimepay';
import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';
import { sendPickupConfirmation } from '@/lib/textbee';
import { getDimepayConfig } from '@/lib/settings';

/**
 * DimePay Webhook Handler
 * 
 * Handles payment confirmations from DimePay gateway
 * Expected events: payment.completed, payment.failed, payment.refunded
 * Supports:
 * - Storage fee payments (opens box on completion)
 * - Courier prepaid account top-ups
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-dimepay-signature') || '';
    
    // Load DimePay config from database for signature verification
    const dimepayConfig = await getDimepayConfig();
    
    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature, dimepayConfig)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(payload);
    const event = data.event || data.type;
    const payment = data.data || data.payment;

    console.log(`DimePay webhook received: ${event}`, payment);

    // Handle different event types
    switch (event) {
      case 'payment.completed':
      case 'payment.succeeded':
        await handlePaymentCompleted(payment);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(payment);
        break;
      
      case 'payment.refunded':
        await handlePaymentRefunded(payment);
        break;
      
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed' 
    }, { status: 500 });
  }
}

async function handlePaymentCompleted(payment: {
  id: string;
  reference?: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  const paymentType = payment.metadata?.type as string;
  
  // Handle courier top-up
  if (paymentType === 'courier_topup') {
    await handleCourierTopup(payment);
    return;
  }
  
  // Handle storage fee payment
  await handleStorageFeePayment(payment);
}

async function handleStorageFeePayment(payment: {
  id: string;
  reference?: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  // Find the related order
  const orderReference = payment.reference || (payment.metadata?.orderId as string);
  
  if (!orderReference) {
    console.error('No order reference in payment:', payment.id);
    return;
  }

  // Try to find by tracking code (if reference is a pickup code)
  let order = await db.order.findUnique({
    where: { trackingCode: orderReference },
    include: { device: true, box: true },
  });

  // Or try to find by order number
  if (!order) {
    order = await db.order.findFirst({
      where: { orderNumber: orderReference },
      include: { device: true, box: true },
    });
  }

  // Or find by payment reference in metadata
  if (!order && payment.metadata?.trackingCode) {
    order = await db.order.findUnique({
      where: { trackingCode: payment.metadata.trackingCode as string },
      include: { device: true, box: true },
    });
  }

  // Or find by order ID in metadata
  if (!order && payment.metadata?.orderId) {
    order = await db.order.findUnique({
      where: { id: payment.metadata.orderId as string },
      include: { device: true, box: true },
    });
  }

  if (!order) {
    console.error('Order not found for payment:', payment.id, 'Reference:', orderReference);
    return;
  }

  // Check if already paid
  const existingPayment = await db.payment.findFirst({
    where: {
      orderId: order.id,
      status: 'COMPLETED',
    },
  });

  if (existingPayment) {
    console.log('Order already paid:', order.orderNumber);
    return;
  }

  // Update or create payment record
  await db.payment.upsert({
    where: { gatewayRef: payment.id },
    create: {
      orderId: order.id,
      userId: order.customerId,
      amount: payment.amount / 100, // Convert from cents
      method: 'ONLINE',
      status: 'COMPLETED',
      gatewayRef: payment.id,
      gatewayResponse: JSON.stringify(payment),
      paidAt: new Date(),
    },
    update: {
      status: 'COMPLETED',
      paidAt: new Date(),
      gatewayResponse: JSON.stringify(payment),
    },
  });

  // Open the box for pickup
  if (order.device && order.boxNumber) {
    try {
      // Get device-specific credentials
      const credentials = await getCredentialsForDevice(order.device.id);
      
      if (!credentials.appId || !credentials.appSecret) {
        console.error('No credentials for device:', order.device.deviceId);
      } else {
        const result = await openBoxWithCredentials(order.device.deviceId, order.boxNumber, credentials);
        if (result.code !== 0) {
          console.error('Failed to open box after payment:', result);
        } else {
          console.log('Box opened successfully after payment');
        }
      }
    } catch (boxError) {
      console.error('Error opening box:', boxError);
    }
  }

  // Update order status
  await db.order.update({
    where: { id: order.id },
    data: {
      status: 'PICKED_UP',
      pickUpAt: new Date(),
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

  // Log activity
  await db.activity.create({
    data: {
      userId: order.customerId,
      action: 'PAYMENT_COMPLETED',
      description: `Payment of ${payment.currency} ${payment.amount / 100} completed via DimePay`,
      orderId: order.id,
    },
  });

  // Send confirmation SMS
  try {
    await sendPickupConfirmation(order.customerPhone, order.customerName);
  } catch (smsError) {
    console.error('Failed to send confirmation SMS:', smsError);
  }

  console.log('Payment completed and box opened for order:', order.orderNumber);
}

async function handleCourierTopup(payment: {
  id: string;
  reference?: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  const courierId = payment.metadata?.courierId as string;
  
  if (!courierId) {
    console.error('No courier ID in payment metadata:', payment.id);
    return;
  }

  const courier = await db.courier.findUnique({
    where: { id: courierId },
  });

  if (!courier) {
    console.error('Courier not found for top-up:', courierId);
    return;
  }

  // Get the original amount (without fee if fee was passed to courier)
  const originalAmount = (payment.metadata?.originalAmount as number) || payment.amount;
  const topupAmount = originalAmount / 100; // Convert from cents

  // Update courier balance
  await db.courier.update({
    where: { id: courierId },
    data: {
      balance: { increment: topupAmount },
      totalSpent: { increment: topupAmount },
      lastActivityAt: new Date(),
    },
  });

  // Log activity
  await db.activity.create({
    data: {
      action: 'COURIER_TOPUP',
      description: `Courier ${courier.name} topped up ${payment.currency} ${topupAmount} via DimePay`,
      metadata: JSON.stringify({
        courierId,
        paymentId: payment.id,
        amount: topupAmount,
        currency: payment.currency,
      }),
    },
  });

  console.log(`Courier ${courier.name} topped up ${payment.currency} ${topupAmount}`);
}

async function handlePaymentFailed(payment: {
  id: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}) {
  // Update payment status if exists
  await db.payment.updateMany({
    where: { gatewayRef: payment.id },
    data: { status: 'FAILED' },
  });

  console.log('Payment failed:', payment.id);
}

async function handlePaymentRefunded(payment: {
  id: string;
  amount: number;
}) {
  // Update payment status
  await db.payment.updateMany({
    where: { gatewayRef: payment.id },
    data: { 
      status: 'REFUNDED',
    },
  });

  console.log('Payment refunded:', payment.id);
}

// GET for webhook verification (some gateways require this)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  
  return NextResponse.json({ status: 'ok' });
}
