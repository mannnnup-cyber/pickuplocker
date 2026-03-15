import { NextRequest, NextResponse } from 'next/server';
import { generateTrackingCode } from '@/lib/storage';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';
import { getDimepayConfig } from '@/lib/settings';
import { sendSMS } from '@/lib/textbee';
import { db } from '@/lib/db';
import QRCode from 'qrcode';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  'S': 150,
  'M': 200,
  'L': 300,
  'XL': 400,
};

// Generate QR code as data URL
async function generateQRCodeDataUrl(data: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
}

// POST /api/kiosk/payment - Create payment for drop-off credit or check status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, boxSize, phone } = body;

    console.log('[Kiosk Payment] POST Request:', { action, boxSize, phone });

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

    console.log('[Kiosk Payment] GET Request for paymentId:', paymentId);

    if (!paymentId) {
      return NextResponse.json({
        success: false,
        error: 'Payment ID is required',
      }, { status: 400 });
    }

    // Get payment session from database
    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${paymentId}` }
    });

    if (sessionSetting) {
      const paymentData = JSON.parse(sessionSetting.value);
      console.log('[Kiosk Payment] Found SDK payment in database:', paymentId, 'status:', paymentData.status);

      if (paymentData.status === 'COMPLETED') {
        return NextResponse.json({
          success: true,
          status: 'completed',
          saveCode: paymentData.metadata?.saveCode,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
        message: 'Payment pending. Please complete payment on your device.',
      });
    }

    // Check for demo payments (also stored in database now)
    const demoSetting = await db.setting.findUnique({
      where: { key: `demo_payment_${paymentId}` }
    });

    if (demoSetting) {
      const demoData = JSON.parse(demoSetting.value);
      const elapsed = Date.now() - demoData.createdAt;
      console.log('[Kiosk Payment] Demo payment elapsed time:', elapsed, 'ms');

      // Auto-complete after 5 seconds in demo mode
      if (elapsed > 5000) {
        console.log('[Kiosk Payment] Demo payment completed! saveCode:', demoData.saveCode);

        // Send SMS notification
        try {
          await sendSMS(demoData.phone,
            `Pickup Jamaica: Your drop-off payment of JMD $${demoData.amount} is confirmed. Your save code is ${demoData.saveCode}. Use this code at the locker to store your package.`
          );
          console.log('[Kiosk Payment] SMS sent to:', demoData.phone);
        } catch (smsError) {
          console.error('[Kiosk Payment] Failed to send SMS:', smsError);
        }

        // Update status in database
        await db.setting.update({
          where: { key: `demo_payment_${paymentId}` },
          data: { value: JSON.stringify({ ...demoData, status: 'COMPLETED' }) }
        }).catch(() => {});

        return NextResponse.json({
          success: true,
          status: 'completed',
          saveCode: demoData.saveCode,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
      });
    }

    return NextResponse.json({
      success: false,
      status: 'pending',
      error: 'Payment not found',
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check payment status',
    }, { status: 500 });
  }
}

// Create drop-off credit payment - Uses real DimePay if configured, otherwise demo mode
async function createDropoffPayment(boxSize: string, phone: string) {
  console.log('[Kiosk Payment] createDropoffPayment called with:', { boxSize, phone });

  // Validate box size
  if (!boxSize || !['S', 'M', 'L', 'XL'].includes(boxSize)) {
    console.log('[Kiosk Payment] Invalid box size:', boxSize);
    return NextResponse.json({
      success: false,
      error: 'Invalid box size. Must be S, M, L, or XL',
    }, { status: 400 });
  }

  // Validate phone
  if (!phone || phone.length < 7) {
    console.log('[Kiosk Payment] Invalid phone:', phone);
    return NextResponse.json({
      success: false,
      error: 'Valid phone number is required (at least 7 digits)',
    }, { status: 400 });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const amount = BOX_PRICES[boxSize];
  const saveCode = generateTrackingCode();

  // Check if DimePay is configured
  const config = await getDimepayConfig();

  console.log('[Kiosk Payment] DimePay config loaded:', {
    hasClientId: !!config.clientId,
    hasSecretKey: !!config.secretKey,
    sandboxMode: config.sandboxMode,
  });

  // Use real DimePay SDK if credentials are configured
  if (config.clientId && config.secretKey) {
    console.log('[Kiosk Payment] Using real DimePay SDK');

    try {
      // Always use production URL for QR codes (users scan with their phones)
      const baseUrl = 'https://pickuplocker.vercel.app';
      const orderId = `DROPOFF-${Date.now()}`;

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

      const result = await createSDKPayment({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'JMD',
        orderId: orderId,
        description: `Drop-off Credit - ${boxSize} Box`,
        customerPhone: cleanPhone,
        redirectUrl: `${baseUrl}/kiosk?payment=success`,
        passFeeToCustomer: config.passFeeToCustomer,
        metadata: {
          type: 'dropoff_credit',
          boxSize,
          saveCode,
          customerPhone: cleanPhone,
        },
      }, sdkConfig);

      if (result.success && result.data && result.data.sdkConfig) {
        // Generate payment URL for the payment page
        const paymentUrl = `${baseUrl}/pay/${orderId}`;

        // Generate QR code from payment URL
        let qrCodeDataUrl: string | undefined;
        try {
          qrCodeDataUrl = await generateQRCodeDataUrl(paymentUrl);
          console.log('[Kiosk Payment] QR code generated for payment URL');
        } catch (qrError) {
          console.error('[Kiosk Payment] QR generation error:', qrError);
        }

        // Store payment data in DATABASE for retrieval by payment page
        const paymentSessionData = {
          amount: result.data.amount,
          originalAmount: result.data.originalAmount,
          feeAmount: result.data.feeAmount,
          currency: result.data.currency,
          description: `Drop-off Credit - ${boxSize} Box`,
          reference: orderId,
          sdkConfig: result.data.sdkConfig,
          metadata: {
            type: 'dropoff_credit',
            boxSize,
            saveCode,
            customerPhone: cleanPhone,
          },
          status: 'PENDING',
          createdAt: Date.now(),
        };

        await db.setting.upsert({
          where: { key: `sdk_payment_${orderId}` },
          create: {
            key: `sdk_payment_${orderId}`,
            value: JSON.stringify(paymentSessionData),
            description: `SDK Payment: ${orderId}`,
          },
          update: {
            value: JSON.stringify(paymentSessionData),
          }
        });

        console.log('[Kiosk Payment] SDK payment stored in database:', orderId);

        return NextResponse.json({
          success: true,
          paymentId: orderId,
          paymentUrl,
          qrCodeDataUrl,
          amount: result.data.amount,
          originalAmount: result.data.originalAmount,
          feeAmount: result.data.feeAmount,
          boxSize,
          saveCode,
          message: `Scan QR to pay JMD $${result.data.amount} for ${boxSize} box drop-off`,
          isDemoMode: false,
        });
      } else {
        console.error('[Kiosk Payment] DimePay SDK payment failed:', result.error);
        // Fall through to demo mode
      }
    } catch (dimepayError) {
      console.error('[Kiosk Payment] DimePay SDK error:', dimepayError);
      // Fall through to demo mode
    }
  }

  // Demo mode fallback
  console.log('[Kiosk Payment] Using demo mode - no valid DimePay credentials');
  const paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const demoPaymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;

  // Generate QR code
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    console.log('[Kiosk Payment] Demo QR code generated successfully');
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store demo payment in DATABASE
  await db.setting.upsert({
    where: { key: `demo_payment_${paymentId}` },
    create: {
      key: `demo_payment_${paymentId}`,
      value: JSON.stringify({
        saveCode,
        boxSize,
        phone: cleanPhone,
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
      description: `Demo Payment: ${paymentId}`,
    },
    update: {
      value: JSON.stringify({
        saveCode,
        boxSize,
        phone: cleanPhone,
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
    }
  });

  console.log('[Kiosk Payment] Demo payment stored in database:', paymentId);

  return NextResponse.json({
    success: true,
    paymentId,
    paymentUrl: demoPaymentUrl,
    qrCodeDataUrl,
    amount,
    boxSize,
    saveCode,
    message: `[DEMO MODE] Scan QR to simulate payment of JMD $${amount} for ${boxSize} box`,
    isDemoMode: true,
  });
}

// Create storage fee payment - ALWAYS USES DEMO MODE
async function createStorageFeePayment(orderId: string, amount: number, phone?: string) {
  console.log('[Kiosk Payment] createStorageFeePayment called:', { orderId, amount, phone });

  if (!orderId || !amount || amount <= 0) {
    return NextResponse.json({
      success: false,
      error: 'Order ID and valid amount are required',
    }, { status: 400 });
  }

  const paymentId = `SF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const demoPaymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;

  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store in database
  await db.setting.upsert({
    where: { key: `demo_payment_${paymentId}` },
    create: {
      key: `demo_payment_${paymentId}`,
      value: JSON.stringify({
        saveCode: '',
        boxSize: '',
        phone: phone || '',
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
      description: `Storage Fee Payment: ${paymentId}`,
    },
    update: {
      value: JSON.stringify({
        saveCode: '',
        boxSize: '',
        phone: phone || '',
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
    }
  });

  return NextResponse.json({
    success: true,
    paymentId,
    paymentUrl: demoPaymentUrl,
    qrCodeDataUrl,
    amount,
    message: `[DEMO MODE] Scan QR to simulate payment of JMD $${amount} storage fee`,
    isDemoMode: true,
  });
}
