import { NextRequest, NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';

// In-memory store for pending SDK payments
// In production, this should be stored in a database or Redis
const globalSdkPayments = new Map<string, {
  amount: number;
  currency: string;
  description: string;
  reference: string;
  sdkConfig: {
    clientId: string;
    data: string;
    test: boolean;
    onSuccess: string;
    onClose: string;
  };
  createdAt: number;
}>();

// Export for use in other modules
export { globalSdkPayments };

// GET - Retrieve payment data by reference
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

    const paymentData = globalSdkPayments.get(reference);

    if (!paymentData) {
      return NextResponse.json({
        success: false,
        error: 'Payment not found or expired'
      }, { status: 404 });
    }

    // Check if payment is expired (1 hour)
    if (Date.now() - paymentData.createdAt > 3600000) {
      globalSdkPayments.delete(reference);
      return NextResponse.json({
        success: false,
        error: 'Payment session expired'
      }, { status: 410 });
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

// POST - Initialize SDK payment
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

    // Store payment data for retrieval by the payment page
    const paymentReference = result.data.paymentId;
    globalSdkPayments.set(paymentReference, {
      amount: result.data.amount,
      currency: result.data.currency,
      description: description || 'Payment',
      reference: paymentReference,
      sdkConfig: result.data.sdkConfig,
      createdAt: Date.now(),
    });

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
