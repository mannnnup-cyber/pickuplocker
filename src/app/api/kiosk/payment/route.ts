import { NextRequest, NextResponse } from 'next/server';
import { generateTrackingCode } from '@/lib/storage';
import { createPayment, calculateDimePayFee, DimePayConfig } from '@/lib/dimepay';
import { getDimepayConfig } from '@/lib/settings';
import { sendSMS } from '@/lib/textbee';
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

// Store for demo payments (in-memory, resets on server restart)
const globalDemoPayments = new Map<string, { 
  saveCode: string; 
  boxSize: string;
  phone: string;
  amount: number;
  createdAt: number;
}>();

// Store for real payments pending
const globalPendingPayments = new Map<string, {
  saveCode: string;
  boxSize: string;
  phone: string;
  amount: number;
  createdAt: number;
  paymentId: string;
  paymentUrl?: string;
}>();

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

    // Check demo payments
    const demoPayment = globalDemoPayments.get(paymentId);
    
    if (demoPayment) {
      // Auto-complete after 5 seconds in demo mode
      const elapsed = Date.now() - demoPayment.createdAt;
      console.log('[Kiosk Payment] Demo payment elapsed time:', elapsed, 'ms');
      
      if (elapsed > 5000) {
        console.log('[Kiosk Payment] Demo payment completed! saveCode:', demoPayment.saveCode);
        
        // Send SMS notification for demo payment completion
        try {
          await sendSMS(demoPayment.phone, 
            `Pickup Jamaica: Your drop-off payment of JMD $${demoPayment.amount} is confirmed. Your save code is ${demoPayment.saveCode}. Use this code at the locker to store your package.`
          );
          console.log('[Kiosk Payment] SMS sent to:', demoPayment.phone);
        } catch (smsError) {
          console.error('[Kiosk Payment] Failed to send SMS:', smsError);
        }
        
        return NextResponse.json({
          success: true,
          status: 'completed',
          saveCode: demoPayment.saveCode,
        });
      }
      
      return NextResponse.json({
        success: true,
        status: 'pending',
      });
    }
    
    // Check real payments
    const realPayment = globalPendingPayments.get(paymentId);
    if (realPayment) {
      // Check with DimePay for actual status
      try {
        const config = await getDimepayConfig();
        const dimepayConfig: DimePayConfig = {
          apiKey: config.apiKey,
          merchantId: config.merchantId,
          baseUrl: config.baseUrl,
        };
        
        const { getPaymentStatus } = await import('@/lib/dimepay');
        const statusResult = await getPaymentStatus(paymentId, dimepayConfig);
        
        if (statusResult.success && statusResult.data?.status === 'completed') {
          // Send SMS notification
          try {
            await sendSMS(realPayment.phone,
              `Pickup Jamaica: Your drop-off payment of JMD $${realPayment.amount} is confirmed. Your save code is ${realPayment.saveCode}. Use this code at the locker to store your package.`
            );
            console.log('[Kiosk Payment] SMS sent to:', realPayment.phone);
          } catch (smsError) {
            console.error('[Kiosk Payment] Failed to send SMS:', smsError);
          }
          
          // Remove from pending
          globalPendingPayments.delete(paymentId);
          
          return NextResponse.json({
            success: true,
            status: 'completed',
            saveCode: realPayment.saveCode,
          });
        }
        
        return NextResponse.json({
          success: true,
          status: statusResult.data?.status || 'pending',
        });
      } catch (statusError) {
        console.error('[Kiosk Payment] Failed to check payment status:', statusError);
        return NextResponse.json({
          success: true,
          status: 'pending',
        });
      }
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
  let dimepayConfig: DimePayConfig;
  try {
    const config = await getDimepayConfig();
    dimepayConfig = {
      apiKey: config.apiKey,
      merchantId: config.merchantId,
      baseUrl: config.baseUrl,
      passFeeToCustomer: config.passFeeToCustomer,
      feePercentage: config.feePercentage,
      fixedFee: config.fixedFee,
    };
  } catch (configError) {
    console.error('[Kiosk Payment] Failed to load DimePay config:', configError);
    dimepayConfig = { apiKey: '', merchantId: '', baseUrl: 'https://api.dimepay.io' };
  }

  // Use real DimePay if configured
  if (dimepayConfig.apiKey && dimepayConfig.merchantId) {
    console.log('[Kiosk Payment] Using real DimePay');
    
    try {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'https://pickuplocker.vercel.app';
      
      const result = await createPayment({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'JMD',
        orderId: `DROPOFF-${Date.now()}`,
        description: `Drop-off Credit - ${boxSize} Box`,
        customerPhone: cleanPhone,
        redirectUrl: `${baseUrl}/kiosk?payment=success`,
        webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
        passFeeToCustomer: dimepayConfig.passFeeToCustomer,
        metadata: {
          type: 'dropoff_credit',
          boxSize,
          saveCode,
          customerPhone: cleanPhone,
        },
      }, dimepayConfig);

      if (result.success && result.data) {
        // Store pending payment
        globalPendingPayments.set(result.data.paymentId, {
          saveCode,
          boxSize,
          phone: cleanPhone,
          amount: result.data.amount,
          createdAt: Date.now(),
          paymentId: result.data.paymentId,
          paymentUrl: result.data.paymentUrl,
        });

        console.log('[Kiosk Payment] Real payment created:', result.data.paymentId);

        return NextResponse.json({
          success: true,
          paymentId: result.data.paymentId,
          paymentUrl: result.data.paymentUrl,
          qrCodeDataUrl: result.data.qrCodeDataUrl,
          amount: result.data.amount,
          originalAmount: result.data.originalAmount,
          feeAmount: result.data.feeAmount,
          boxSize,
          saveCode,
          message: `Scan QR to pay JMD $${result.data.amount} for ${boxSize} box drop-off`,
          isDemoMode: false,
        });
      } else {
        console.error('[Kiosk Payment] DimePay payment failed:', result.error);
        // Fall through to demo mode
      }
    } catch (dimepayError) {
      console.error('[Kiosk Payment] DimePay error:', dimepayError);
      // Fall through to demo mode
    }
  }

  // Demo mode fallback
  console.log('[Kiosk Payment] Using demo mode');
  const paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const demoPaymentUrl = `https://demo.dimepay.io/pay/${paymentId}`;
  
  // Generate QR code
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    console.log('[Kiosk Payment] QR code generated successfully');
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store for status checking
  globalDemoPayments.set(paymentId, {
    saveCode,
    boxSize,
    phone: cleanPhone,
    amount,
    createdAt: Date.now(),
  });

  console.log('[Kiosk Payment] Demo payment stored. Total payments:', globalDemoPayments.size);

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

  // Always use demo mode
  const demoPaymentUrl = `https://demo.dimepay.io/pay/${paymentId}`;
  
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store for status checking
  globalDemoPayments.set(paymentId, {
    saveCode: '',
    boxSize: '',
    phone: phone || '',
    amount,
    createdAt: Date.now(),
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
