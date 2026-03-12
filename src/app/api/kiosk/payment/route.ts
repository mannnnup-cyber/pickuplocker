import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTrackingCode } from '@/lib/storage';
import { createPayment, generateQRCode, getPaymentStatus } from '@/lib/dimepay';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  'S': 150,
  'M': 200,
  'L': 300,
  'XL': 400,
};

// POST /api/kiosk/payment - Create payment for drop-off credit or check status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, boxSize, phone, paymentId } = body;

    // Create drop-off payment
    if (action === 'create_dropoff_payment') {
      return await createDropoffPayment(boxSize, phone);
    }

    // Create storage fee payment
    if (action === 'create_storage_fee_payment') {
      const { orderId, amount } = body;
      return await createStorageFeePayment(orderId, amount, phone);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: create_dropoff_payment, create_storage_fee_payment',
    }, { status: 400 });

  } catch (error) {
    console.error('Kiosk payment error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment',
    }, { status: 500 });
  }
}

// GET /api/kiosk/payment?paymentId=xxx - Check payment status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({
        success: false,
        error: 'Payment ID is required',
      }, { status: 400 });
    }

    // Check database for payment record
    const payment = await db.payment.findFirst({
      where: { gatewayRef: paymentId },
    });

    if (payment) {
      return NextResponse.json({
        success: true,
        status: payment.status.toLowerCase(),
        saveCode: payment.gatewayResponse ? JSON.parse(payment.gatewayResponse).saveCode : undefined,
      });
    }

    // Check DimePay for payment status
    const result = await getPaymentStatus(paymentId);

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        status: result.data.status,
        saveCode: undefined,
      });
    }

    return NextResponse.json({
      success: false,
      status: 'pending',
      error: result.error || 'Payment not found',
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check payment status',
    }, { status: 500 });
  }
}

// Create drop-off credit payment
async function createDropoffPayment(boxSize: string, phone: string) {
  // Validate box size
  if (!boxSize || !['S', 'M', 'L', 'XL'].includes(boxSize)) {
    return NextResponse.json({
      success: false,
      error: 'Invalid box size. Must be S, M, L, or XL',
    }, { status: 400 });
  }

  // Validate phone
  if (!phone) {
    return NextResponse.json({
      success: false,
      error: 'Phone number is required',
    }, { status: 400 });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const amount = BOX_PRICES[boxSize];

  // Generate save code upfront
  const saveCode = generateTrackingCode();

  // Create payment request
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  const paymentResult = await createPayment({
    amount: amount * 100, // Convert to cents
    currency: 'JMD',
    orderId: `DROP-${boxSize}-${Date.now()}`,
    description: `Drop-off Credit - ${boxSize} Box`,
    customerPhone: cleanPhone,
    redirectUrl: `${baseUrl}/?payment=success`,
    webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
    passFeeToCustomer: true,
    metadata: {
      type: 'dropoff_credit',
      boxSize,
      phone: cleanPhone,
      saveCode,
    },
  });

  if (!paymentResult.success || !paymentResult.data) {
    return NextResponse.json({
      success: false,
      error: paymentResult.error || 'Failed to create payment',
    }, { status: 500 });
  }

  // Generate QR code if not provided
  let qrCodeDataUrl = paymentResult.data.qrCodeDataUrl;
  if (!qrCodeDataUrl && paymentResult.data.paymentUrl) {
    try {
      qrCodeDataUrl = await generateQRCode(paymentResult.data.paymentUrl);
    } catch (qrError) {
      console.error('QR generation error:', qrError);
    }
  }

  // Store pending payment in database
  // Find or create customer
  let customer = await db.user.findFirst({
    where: { phone: cleanPhone },
  });

  if (!customer) {
    customer = await db.user.create({
      data: {
        name: 'Customer',
        phone: cleanPhone,
        email: `${cleanPhone}@pickup.local`,
        role: 'CUSTOMER',
      },
    });
  }

  // Create a pending order to track this payment
  const orderNumber = `DC-${Date.now()}`;
  
  // Store payment record
  await db.payment.create({
    data: {
      orderId: '', // Will be updated when order is created
      userId: customer.id,
      amount: paymentResult.data.amount,
      method: 'ONLINE',
      status: 'PENDING',
      gatewayRef: paymentResult.data.paymentId,
      gatewayResponse: JSON.stringify({
        paymentUrl: paymentResult.data.paymentUrl,
        qrCodeDataUrl,
        saveCode,
        boxSize,
        orderNumber,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    paymentId: paymentResult.data.paymentId,
    paymentUrl: paymentResult.data.paymentUrl,
    qrCodeDataUrl,
    amount: paymentResult.data.amount,
    boxSize,
    saveCode,
    message: `Scan QR code to pay JMD $${paymentResult.data.amount} for ${boxSize} box drop-off`,
  });
}

// Create storage fee payment
async function createStorageFeePayment(orderId: string, amount: number, phone?: string) {
  if (!orderId || !amount || amount <= 0) {
    return NextResponse.json({
      success: false,
      error: 'Order ID and valid amount are required',
    }, { status: 400 });
  }

  // Get order details
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { device: true },
  });

  if (!order) {
    return NextResponse.json({
      success: false,
      error: 'Order not found',
    }, { status: 404 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  const paymentResult = await createPayment({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'JMD',
    orderId: `SF-${order.orderNumber}-${Date.now()}`,
    description: `Storage Fee - Order ${order.orderNumber}`,
    customerPhone: phone || order.customerPhone,
    customerEmail: order.customerEmail || undefined,
    redirectUrl: `${baseUrl}/?payment=success`,
    webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
    passFeeToCustomer: true,
    metadata: {
      type: 'storage_fee',
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingCode: order.trackingCode,
    },
  });

  if (!paymentResult.success || !paymentResult.data) {
    return NextResponse.json({
      success: false,
      error: paymentResult.error || 'Failed to create payment',
    }, { status: 500 });
  }

  // Generate QR code if not provided
  let qrCodeDataUrl = paymentResult.data.qrCodeDataUrl;
  if (!qrCodeDataUrl && paymentResult.data.paymentUrl) {
    try {
      qrCodeDataUrl = await generateQRCode(paymentResult.data.paymentUrl);
    } catch (qrError) {
      console.error('QR generation error:', qrError);
    }
  }

  // Store payment record
  await db.payment.create({
    data: {
      orderId: order.id,
      userId: order.customerId,
      amount: paymentResult.data.amount,
      method: 'ONLINE',
      status: 'PENDING',
      gatewayRef: paymentResult.data.paymentId,
      gatewayResponse: JSON.stringify({
        paymentUrl: paymentResult.data.paymentUrl,
        qrCodeDataUrl,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    paymentId: paymentResult.data.paymentId,
    paymentUrl: paymentResult.data.paymentUrl,
    qrCodeDataUrl,
    amount: paymentResult.data.amount,
    orderNumber: order.orderNumber,
    boxNumber: order.boxNumber,
    message: `Scan QR code to pay JMD $${paymentResult.data.amount} storage fee`,
  });
}
