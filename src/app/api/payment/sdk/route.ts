import { NextRequest, NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';

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

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('SDK payment init error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
