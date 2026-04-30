import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Payment Status Polling Endpoint
 * 
 * Used by kiosk-lite AJAX polling to check if a payment has been completed.
 * Returns JSON instead of HTML so the QR code stays on screen.
 * 
 * GET /api/kiosk/payment-status?paymentId=xxx
 */
export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get('paymentId');

  if (!paymentId) {
    return NextResponse.json({ status: 'error', message: 'Missing paymentId' }, { status: 400 });
  }

  // Check SDK payment session
  const sdkSetting = await db.setting.findUnique({
    where: { key: `sdk_payment_${paymentId}` },
  });

  if (sdkSetting) {
    const paymentData = JSON.parse(sdkSetting.value);
    if (paymentData.status === 'COMPLETED') {
      const metadata = paymentData.metadata || {};
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pickuplocker.vercel.app';
      
      // Build redirect URL based on payment type
      let redirectUrl = `/kiosk-lite?action=payment-success&msg=Payment confirmed!`;
      
      if (metadata.type === 'dropoff_credit') {
        redirectUrl = `/kiosk-lite?action=payment-success&msg=Drop-off payment confirmed! Your save code: ${metadata.saveCode || ''}`;
      } else if (metadata.type === 'storage_fee') {
        redirectUrl = `/kiosk-lite?action=payment-success&msg=Storage fee paid! Opening locker...`;
      }

      return NextResponse.json({
        status: 'completed',
        message: paymentData.description || 'Payment confirmed',
        redirectUrl,
        metadata: {
          type: metadata.type,
          saveCode: metadata.saveCode,
          pickCode: metadata.pickCode,
          boxSize: metadata.boxSize,
        },
      });
    }

    if (paymentData.status === 'FAILED') {
      return NextResponse.json({
        status: 'failed',
        message: 'Payment failed. Please try again.',
      });
    }

    // Still pending
    return NextResponse.json({ status: 'pending' });
  }

  // Check demo payment session
  const demoSetting = await db.setting.findUnique({
    where: { key: `demo_payment_${paymentId}` },
  });

  if (demoSetting) {
    const demoData = JSON.parse(demoSetting.value);
    const elapsed = Date.now() - demoData.createdAt;

    // Auto-complete demo payments after 5 seconds
    if (elapsed > 5000) {
      // Update demo payment status
      await db.setting
        .update({
          where: { key: `demo_payment_${paymentId}` },
          data: { value: JSON.stringify({ ...demoData, status: 'COMPLETED' }) },
        })
        .catch(() => {});

      return NextResponse.json({
        status: 'completed',
        message: '[DEMO] Payment confirmed!',
        redirectUrl: `/kiosk-lite?action=payment-success&msg=[DEMO] Payment confirmed! Save code: ${demoData.saveCode}`,
        metadata: {
          type: 'dropoff_credit',
          saveCode: demoData.saveCode,
          pickCode: demoData.pickCode,
          boxSize: demoData.boxSize,
        },
      });
    }

    return NextResponse.json({ status: 'pending' });
  }

  // Payment not found
  return NextResponse.json({ status: 'not_found', message: 'Payment session not found' });
}
