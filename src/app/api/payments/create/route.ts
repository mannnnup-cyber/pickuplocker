import { NextRequest, NextResponse } from 'next/server';
import { createPayment, calculateDimePayFee } from '@/lib/dimepay';
import { db } from '@/lib/db';
import { getSetting, getDimepayConfig } from '@/lib/settings';

/**
 * POST /api/payments/create
 * 
 * Create a payment request for:
 * - Storage fees (customer pickup payment)
 * - Courier top-up (courier account funding)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // Check if DimePay is configured
    const config = await getDimepayConfig();
    if (!config.clientId || !config.secretKey) {
      return NextResponse.json({
        success: false,
        error: 'DimePay is not configured. Please add Client ID and Secret Key in Settings.'
      }, { status: 400 });
    }

    // Get pass fee setting
    const passFeeSetting = await getSetting('dimepay_passFeeToCustomer', '');
    const passFeeToCustomer = passFeeSetting === 'true';

    if (type === 'storage_fee') {
      return await handleStorageFeePayment(data, passFeeToCustomer, config);
    } else if (type === 'courier_topup') {
      return await handleCourierTopUp(data, passFeeToCustomer, config);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid payment type. Use: storage_fee or courier_topup'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create payment'
    }, { status: 500 });
  }
}

async function handleStorageFeePayment(data: {
  orderId?: string;
  trackingCode?: string;
}, passFeeToCustomer: boolean, config: any) {
  // Find the order
  let order;
  if (data.orderId) {
    order = await db.order.findUnique({
      where: { id: data.orderId },
    });
  } else if (data.trackingCode) {
    order = await db.order.findUnique({
      where: { trackingCode: data.trackingCode },
    });
  }

  if (!order) {
    return NextResponse.json({
      success: false,
      error: 'Order not found'
    }, { status: 404 });
  }

  // Check if already paid
  const existingPayment = await db.payment.findFirst({
    where: {
      orderId: order.id,
      status: 'COMPLETED'
    }
  });

  if (existingPayment) {
    return NextResponse.json({
      success: false,
      error: 'Order already paid'
    }, { status: 400 });
  }

  // Get current storage fee
  const storageSettings = await getStorageSettings();
  const currentFee = await calculateCurrentFee(order, storageSettings);

  if (currentFee <= 0) {
    return NextResponse.json({
      success: false,
      error: 'No storage fee required. This order is within the free storage period.'
    }, { status: 400 });
  }

  // Get webhook URL
  const webhookUrl = await getSetting('dimepay_webhookUrl', '') || 
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/webhooks/dimepay`;
  const returnUrl = await getSetting('dimepay_return_url', '') ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/pickup/success`;

  // Create payment
  const result = await createPayment({
    amount: currentFee,
    currency: 'JMD',
    orderId: `${order.orderNumber}-${Date.now()}`,
    description: `Storage Fee - ${order.orderNumber}`,
    customerPhone: order.customerPhone,
    redirectUrl: `${returnUrl}?order=${order.orderNumber}&code=${order.trackingCode}`,
    webhookUrl: webhookUrl,
    passFeeToCustomer,
    metadata: {
      type: 'storage_fee',
      orderNumber: order.orderNumber,
      trackingCode: order.trackingCode,
      orderId: order.id,
      customerName: order.customerName,
    },
  }, config);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  // Store pending payment record
  await db.payment.create({
    data: {
      orderId: order.id,
      userId: order.customerId,
      amount: result.data!.totalAmount || currentFee,
      method: 'ONLINE',
      status: 'PENDING',
      gatewayRef: result.data!.paymentId,
      gatewayResponse: JSON.stringify(result.data),
    }
  });

  return NextResponse.json({
    success: true,
    data: {
      paymentId: result.data!.paymentId,
      paymentUrl: result.data!.paymentUrl,
      qrCodeUrl: result.data!.qrCodeUrl,
      amount: currentFee,
      feeAmount: result.data!.feeAmount,
      totalAmount: result.data!.totalAmount,
      passFeeToCustomer,
      orderNumber: order.orderNumber,
    }
  });
}

async function handleCourierTopUp(data: {
  courierId: string;
  amount: number;
}, passFeeToCustomer: boolean, config: any) {
  // Find courier
  const courier = await db.courier.findUnique({
    where: { id: data.courierId }
  });

  if (!courier) {
    return NextResponse.json({
      success: false,
      error: 'Courier not found'
    }, { status: 404 });
  }

  if (!data.amount || data.amount <= 0) {
    return NextResponse.json({
      success: false,
      error: 'Invalid amount. Amount must be greater than 0.'
    }, { status: 400 });
  }

  // Get webhook URL
  const webhookUrl = await getSetting('dimepay_webhookUrl', '') || 
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/webhooks/dimepay`;
  const returnUrl = await getSetting('dimepay_return_url', '') ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/dashboard?tab=couriers`;

  // Create payment
  const result = await createPayment({
    amount: data.amount,
    currency: 'JMD',
    orderId: `TOPUP-${courier.id}-${Date.now()}`,
    description: `Account Top-Up - ${courier.name}`,
    redirectUrl: `${returnUrl}&topup=success`,
    webhookUrl: webhookUrl,
    passFeeToCustomer,
    metadata: {
      type: 'courier_topup',
      courierId: courier.id,
      courierName: courier.name,
    },
  }, config);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    data: {
      paymentId: result.data!.paymentId,
      paymentUrl: result.data!.paymentUrl,
      qrCodeUrl: result.data!.qrCodeUrl,
      amount: data.amount,
      feeAmount: result.data!.feeAmount,
      totalAmount: result.data!.totalAmount,
      passFeeToCustomer,
      courierName: courier.name,
    }
  });
}

async function getStorageSettings() {
  const [freeDays, tier1Fee, tier2Fee, tier3Fee] = await Promise.all([
    getSetting('storage_freeDays', ''),
    getSetting('storage_tier1Fee', ''),
    getSetting('storage_tier2Fee', ''),
    getSetting('storage_tier3Fee', ''),
  ]);

  return {
    freeDays: parseInt(freeDays) || 3,
    tier1Fee: parseInt(tier1Fee) || 100,
    tier2Fee: parseInt(tier2Fee) || 150,
    tier3Fee: parseInt(tier3Fee) || 200,
  };
}

async function calculateCurrentFee(order: {
  storageStartAt: Date | null;
  createdAt: Date;
  storageFee: number;
}, settings: {
  freeDays: number;
  tier1Fee: number;
  tier2Fee: number;
  tier3Fee: number;
}) {
  const storageStart = order.storageStartAt || order.createdAt;
  const now = new Date();
  const daysStored = Math.floor((now.getTime() - new Date(storageStart).getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysStored <= settings.freeDays) {
    return 0;
  }

  const chargeableDays = daysStored - settings.freeDays;
  
  if (chargeableDays <= 7) {
    return chargeableDays * settings.tier1Fee;
  } else if (chargeableDays <= 14) {
    return (7 * settings.tier1Fee) + ((chargeableDays - 7) * settings.tier2Fee);
  } else {
    return (7 * settings.tier1Fee) + (7 * settings.tier2Fee) + ((chargeableDays - 14) * settings.tier3Fee);
  }
}

// GET - Get fee calculation preview
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get('amount') || '0');
    
    if (amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Amount is required'
      }, { status: 400 });
    }

    const feeCalc = calculateDimePayFee(amount);
    const passFeeSetting = await getSetting('dimepay_passFeeToCustomer', '');
    const passFeeToCustomer = passFeeSetting === 'true';

    return NextResponse.json({
      success: true,
      data: {
        amount,
        feeAmount: feeCalc.fee,
        totalAmount: passFeeToCustomer ? feeCalc.totalWithFee : amount,
        passFeeToCustomer,
        feePercent: 2.5,
        fixedFee: 30,
      }
    });
  } catch (error) {
    console.error('Fee calculation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate fee'
    }, { status: 500 });
  }
}
