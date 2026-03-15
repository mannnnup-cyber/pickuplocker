import { NextRequest, NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';
import { createSDKPayment } from '@/lib/dimepay';
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

    console.log('[SDK Payment API] Looking for payment:', reference);

    // First, check for SDK payment
    const sdkSession = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (sdkSession) {
      console.log('[SDK Payment API] Found SDK payment session');
      const paymentData = JSON.parse(sdkSession.value);

      // Check if payment is expired (1 hour)
      if (Date.now() - paymentData.createdAt > 3600000) {
        await db.setting.delete({
          where: { key: `sdk_payment_${reference}` }
        }).catch(() => {});

        return NextResponse.json({
          success: false,
          error: 'Payment session expired'
        }, { status: 410 });
      }

      return NextResponse.json({
        success: true,
        data: paymentData
      });
    }

    // Check for demo payment
    const demoSession = await db.setting.findUnique({
      where: { key: `demo_payment_${reference}` }
    });

    if (demoSession) {
      console.log('[SDK Payment API] Found demo payment session');
      const paymentData = JSON.parse(demoSession.value);

      return NextResponse.json({
        success: true,
        data: {
          amount: paymentData.amount,
          currency: 'JMD',
          description: `Drop-off Credit - ${paymentData.boxSize} Box (Demo)`,
          reference: reference,
          sdkConfig: null,
          metadata: paymentData,
          isDemo: true,
        }
      });
    }

    console.log('[SDK Payment API] Payment not found');
    return NextResponse.json({
      success: false,
      error: 'Payment not found or expired'
    }, { status: 404 });

  } catch (error) {
    console.error('SDK payment get error:', error);
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
