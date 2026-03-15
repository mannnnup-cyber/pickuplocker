import { NextRequest, NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';
import { db } from '@/lib/db';

// GET - Retrieve payment data by reference from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.json({
        success: false,
        error: 'Reference is required'
      }, { status: 400 });
    }

    // Get payment session from database
    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (!sessionSetting) {
      return NextResponse.json({
        success: false,
        error: 'Payment not found or expired'
      }, { status: 404 });
    }

    const paymentData = JSON.parse(sessionSetting.value);

    // Check if payment is expired (1 hour)
    if (Date.now() - paymentData.createdAt > 3600000) {
      // Delete expired session
      await db.setting.delete({
        where: { key: `sdk_payment_${reference}` }
      }).catch(() => {});
      
      return NextResponse.json({
        success: false,
        error: 'Payment session expired'
      }, { status: 410 });
    }

    // Check if already completed
    if (paymentData.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        data: paymentData,
        message: 'Payment already completed'
      });
    }

    return NextResponse.json({
      success: true,
      data: paymentData
    });
  } catch (error) {
    console.error('SDK payment get error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Initialize SDK payment and store in database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, orderId, description, customerEmail, customerPhone, metadata, redirectUrl } = body;

    const config = await getDimepayConfig();

    // Check if credentials are set
    if (!config.clientId || !config.secretKey) {
      return NextResponse.json({
        success: false,
        error: 'DimePay not configured',
        message: 'Please set Client ID and Secret Key in Settings'
      }, { status: 400 });
    }

    // Create SDK config
    const sdkConfig: DimePaySDKConfig = {
      clientId: config.clientId,
      secretKey: config.secretKey,
      sandboxMode: config.sandboxMode,
      passFeeToCustomer: config.passFeeToCustomer,
      passFeeToCourier: config.passFeeToCourier,
      feePercentage: config.feePercentage,
      fixedFee: config.fixedFee,
    };

    const result = await createSDKPayment(
      {
        amount: amount,
        currency: currency || 'JMD',
        orderId: orderId,
        description: description,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
        redirectUrl: redirectUrl,
        metadata: metadata,
        passFeeToCustomer: config.passFeeToCustomer,
      },
      sdkConfig
    );

    if (!result.success || !result.data) {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 400 });
    }

    // Store payment data in database for retrieval by the payment page
    const paymentReference = result.data.paymentId;
    
    const paymentSessionData = {
      amount: result.data.amount,
      originalAmount: result.data.originalAmount,
      feeAmount: result.data.feeAmount,
      currency: result.data.currency,
      description: description || 'Payment',
      reference: paymentReference,
      sdkConfig: result.data.sdkConfig,
      metadata: metadata,
      status: 'PENDING',
      createdAt: Date.now(),
    };

    // Save to database using Setting model
    await db.setting.upsert({
      where: { key: `sdk_payment_${paymentReference}` },
      create: {
        key: `sdk_payment_${paymentReference}`,
        value: JSON.stringify(paymentSessionData),
        description: `SDK Payment Session: ${paymentReference}`,
      },
      update: {
        value: JSON.stringify(paymentSessionData),
      }
    });

    console.log('[SDK Payment] Payment session stored in database:', paymentReference);

    // Always use production URL for payment links
    const paymentUrl = `https://pickuplocker.vercel.app/pay/${paymentReference}`;

    return NextResponse.json({
      success: true,
      data: {
        ...result.data,
        paymentUrl,
        paymentReference,
      }
    });
  } catch (error) {
    console.error('SDK payment init error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT - Update payment status (for webhook completion)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, status } = body;

    if (!reference) {
      return NextResponse.json({
        success: false,
        error: 'Reference is required'
      }, { status: 400 });
    }

    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (!sessionSetting) {
      return NextResponse.json({
        success: false,
        error: 'Payment session not found'
      }, { status: 404 });
    }

    const paymentData = JSON.parse(sessionSetting.value);
    paymentData.status = status || 'COMPLETED';
    paymentData.completedAt = Date.now();

    await db.setting.update({
      where: { key: `sdk_payment_${reference}` },
      data: {
        value: JSON.stringify(paymentData)
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Payment status updated'
    });
  } catch (error) {
    console.error('SDK payment update error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
