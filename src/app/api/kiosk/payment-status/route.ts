import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Payment Status Polling Endpoint
 *
 * Used by kiosk-lite AJAX polling to check if a payment has been completed.
 * Returns JSON instead of HTML so the QR code stays on screen.
 *
 * GET /api/kiosk/payment-status?paymentId=xxx
 *
 * Payment types and their redirect URLs:
 * - dropoff_credit → /kiosk-lite?action=dropoff-confirmed&saveCode=xxx&boxSize=xxx&phone=xxx&pickCode=xxx
 * - storage_fee   → /kiosk-lite?action=storage-confirmed&pickCode=xxx
 * - card_tokenization → /kiosk-lite?action=payment-success&msg=Card saved successfully
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

      // Build redirect URL based on payment type
      let redirectUrl: string;
      let responseMetadata: Record<string, unknown>;

      switch (metadata.type) {
        case 'dropoff_credit': {
          const saveCode = metadata.saveCode || '';
          const pickCode = metadata.pickCode || '';
          const boxSize = metadata.boxSize || '';
          const phone = metadata.customerPhone || '';
          redirectUrl = `/kiosk-lite?action=dropoff-confirmed&saveCode=${encodeURIComponent(saveCode)}&boxSize=${encodeURIComponent(boxSize)}&phone=${encodeURIComponent(phone)}&pickCode=${encodeURIComponent(pickCode)}`;
          responseMetadata = {
            type: 'dropoff_credit',
            saveCode,
            pickCode,
            boxSize,
            phone,
          };
          break;
        }

        case 'storage_fee': {
          const pickCode = metadata.pickCode || '';
          redirectUrl = `/kiosk-lite?action=storage-confirmed&pickCode=${encodeURIComponent(pickCode)}`;
          responseMetadata = {
            type: 'storage_fee',
            pickCode,
          };
          break;
        }

        case 'card_tokenization': {
          redirectUrl = `/kiosk-lite?action=payment-success&msg=${encodeURIComponent('Card saved successfully')}`;
          responseMetadata = {
            type: 'card_tokenization',
          };
          break;
        }

        default: {
          redirectUrl = `/kiosk-lite?action=payment-success&msg=${encodeURIComponent('Payment confirmed!')}`;
          responseMetadata = {
            type: metadata.type,
          };
          break;
        }
      }

      return NextResponse.json({
        status: 'completed',
        message: paymentData.description || 'Payment confirmed',
        redirectUrl,
        metadata: responseMetadata,
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

      const demoType = demoData.type || 'dropoff_credit';

      // Build redirect URL based on demo payment type
      let redirectUrl: string;
      let responseMetadata: Record<string, unknown>;

      switch (demoType) {
        case 'dropoff_credit': {
          const saveCode = demoData.saveCode || '';
          const pickCode = demoData.pickCode || '';
          const boxSize = demoData.boxSize || '';
          const phone = demoData.phone || '';
          redirectUrl = `/kiosk-lite?action=dropoff-confirmed&saveCode=${encodeURIComponent(saveCode)}&boxSize=${encodeURIComponent(boxSize)}&phone=${encodeURIComponent(phone)}&pickCode=${encodeURIComponent(pickCode)}`;
          responseMetadata = {
            type: 'dropoff_credit',
            saveCode,
            pickCode,
            boxSize,
            phone,
          };
          break;
        }

        case 'storage_fee': {
          const pickCode = demoData.pickCode || '';
          redirectUrl = `/kiosk-lite?action=storage-confirmed&pickCode=${encodeURIComponent(pickCode)}`;
          responseMetadata = {
            type: 'storage_fee',
            pickCode,
          };
          break;
        }

        case 'card_tokenization': {
          redirectUrl = `/kiosk-lite?action=payment-success&msg=${encodeURIComponent('Card saved successfully')}`;
          responseMetadata = {
            type: 'card_tokenization',
          };
          break;
        }

        default: {
          redirectUrl = `/kiosk-lite?action=payment-success&msg=${encodeURIComponent('[DEMO] Payment confirmed!')}`;
          responseMetadata = {
            type: demoType,
            saveCode: demoData.saveCode,
            pickCode: demoData.pickCode,
            boxSize: demoData.boxSize,
          };
          break;
        }
      }

      return NextResponse.json({
        status: 'completed',
        message: `[DEMO] Payment confirmed!`,
        redirectUrl,
        metadata: responseMetadata,
      });
    }

    return NextResponse.json({ status: 'pending' });
  }

  // Payment not found
  return NextResponse.json({ status: 'not_found', message: 'Payment session not found' });
}
