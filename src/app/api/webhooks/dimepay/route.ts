import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/dimepay';
import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';
import { sendPickupConfirmation } from '@/lib/textbee';
import { sendEmail, isEmailEnabled } from '@/lib/email';
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

    // Verify webhook signature (pass only the secret key string)
    if (dimepayConfig.secretKey && !verifyWebhookSignature(payload, signature, dimepayConfig.secretKey)) {
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
  
  console.log('[Webhook] Payment completed, type:', paymentType, 'reference:', payment.reference);
  
  // Handle drop-off credit payment
  if (paymentType === 'dropoff_credit') {
    await handleDropoffCreditPayment(payment);
    return;
  }
  
  // Handle courier top-up
  if (paymentType === 'courier_topup') {
    await handleCourierTopup(payment);
    return;
  }
  
  // Handle storage fee payment
  await handleStorageFeePayment(payment);
}

async function handleDropoffCreditPayment(payment: {
  id: string;
  reference?: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  console.log('[Webhook] Processing dropoff credit payment:', payment.reference);
  
  // Find the SDK payment session
  const paymentReference = payment.reference || '';
  const sessionSetting = await db.setting.findUnique({
    where: { key: `sdk_payment_${paymentReference}` }
  });
  
  if (!sessionSetting) {
    console.error('[Webhook] SDK payment session not found:', paymentReference);
    return;
  }
  
  const paymentData = JSON.parse(sessionSetting.value);
  
  // Update payment status to completed
  await db.setting.update({
    where: { key: `sdk_payment_${paymentReference}` },
    data: { 
      value: JSON.stringify({
        ...paymentData,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        gatewayPaymentId: payment.id,
      })
    }
  });
  
  console.log('[Webhook] Dropoff credit payment marked as completed:', paymentReference);
  
  // Send email confirmation if email provided
  const customerEmail = paymentData.metadata?.customerEmail || payment.metadata?.customerEmail;
  const customerPhone = paymentData.metadata?.customerPhone || payment.metadata?.customerPhone;
  
  if (customerEmail) {
    try {
      const emailEnabled = await isEmailEnabled();
      if (emailEnabled) {
        const saveCode = paymentData.metadata?.saveCode;
        const boxSize = paymentData.metadata?.boxSize;
        const amount = paymentData.amount || payment.amount / 100;
        
        await sendEmail(
          customerEmail as string,
          'Your Pickup Jamaica Drop-off Code',
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #111111; padding: 20px; text-align: center;">
              <h1 style="color: #FFD439; margin: 0;">PICK<span style="color: white;">UP</span></h1>
              <p style="color: #999; margin: 5px 0 0 0;">Smart Locker System</p>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #111;">Payment Confirmed!</h2>
              <p style="font-size: 16px; color: #333;">Your drop-off payment of <strong>JMD $${amount}</strong> has been received.</p>
              
              <div style="background: #FFD439; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Save Code</p>
                <p style="font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${saveCode}</p>
              </div>
              
              <p style="font-size: 14px; color: #666;">
                <strong>How to use:</strong><br>
                1. Go to any Pickup locker<br>
                2. Select "DROP-OFF"<br>
                3. Enter your 6-digit save code<br>
                4. Place your package in the opened locker<br>
                5. Close the door
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              
              <p style="font-size: 12px; color: #999;">
                Box Size: ${boxSize}<br>
                Payment ID: ${paymentReference}
              </p>
            </div>
          </div>
          `,
          `Pickup Jamaica: Your drop-off payment is confirmed. Your save code is ${saveCode}. Use this code at the locker to store your package.`
        );
        console.log('[Webhook] Email sent to:', customerEmail);
      }
    } catch (emailError) {
      console.error('[Webhook] Failed to send email:', emailError);
    }
  }
  
  // Create or update customer record
  if (customerPhone) {
    try {
      const existingCustomer = await db.user.findFirst({
        where: { phone: customerPhone as string }
      });

      if (existingCustomer) {
        // Update email if it was placeholder and now we have real email
        if (customerEmail && existingCustomer.email.includes('@pickup.local')) {
          await db.user.update({
            where: { id: existingCustomer.id },
            data: { email: customerEmail as string }
          });
          console.log('[Webhook] Updated customer email:', customerEmail);
        }
      } else if (customerEmail) {
        // Create new customer with real email
        await db.user.create({
          data: {
            phone: customerPhone as string,
            email: customerEmail as string,
            name: 'Customer',
            role: 'CUSTOMER',
          }
        });
        console.log('[Webhook] Created new customer with email:', customerEmail);
      }
    } catch (customerError) {
      console.error('[Webhook] Failed to update customer:', customerError);
    }
  }
  
  // Log activity
  await db.activity.create({
    data: {
      action: 'DROPOFF_CREDIT_PAYMENT',
      description: `Drop-off credit payment of ${payment.currency} ${payment.amount / 100} completed via DimePay`,
      metadata: JSON.stringify({
        paymentReference,
        saveCode: paymentData.metadata?.saveCode,
        boxSize: paymentData.metadata?.boxSize,
        customerPhone: paymentData.metadata?.customerPhone,
        customerEmail: customerEmail,
      }),
    },
  });
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
