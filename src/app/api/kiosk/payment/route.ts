import { NextRequest, NextResponse } from 'next/server';
import { generateTrackingCode } from '@/lib/storage';
import QRCode from 'qrcode';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  'S': 150,
  'M': 200,
  'L': 300,
  'XL': 400,
};

// DimePay configuration
const DIMEPAY_API_KEY = process.env.DIMEPAY_API_KEY || '';
const DIMEPAY_MERCHANT_ID = process.env.DIMEPAY_MERCHANT_ID || '';
const DIMEPAY_BASE_URL = process.env.DIMEPAY_BASE_URL || 'https://api.dimepay.io';
const IS_DEMO_MODE = !DIMEPAY_API_KEY || DIMEPAY_API_KEY === '';

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
    const { action, boxSize, phone, paymentId } = body;

    console.log('[Kiosk Payment] Request:', { action, boxSize, phone });

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

    // In demo mode, simulate payment completion after a delay
    if (IS_DEMO_MODE) {
      // Simulate payment being completed (for demo purposes)
      const paymentData = globalDemoPayments.get(paymentId);
      
      if (paymentData) {
        // Auto-complete after 5 seconds in demo mode
        const elapsed = Date.now() - paymentData.createdAt;
        if (elapsed > 5000) {
          return NextResponse.json({
            success: true,
            status: 'completed',
            saveCode: paymentData.saveCode,
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
    }

    // Real DimePay integration would go here
    return NextResponse.json({
      success: false,
      status: 'pending',
      error: 'Payment gateway not configured',
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check payment status',
    }, { status: 500 });
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
  if (!phone || phone.length < 7) {
    return NextResponse.json({
      success: false,
      error: 'Valid phone number is required',
    }, { status: 400 });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const amount = BOX_PRICES[boxSize];
  const saveCode = generateTrackingCode();
  const paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  console.log('[Kiosk Payment] Creating payment:', { boxSize, amount, phone: cleanPhone, saveCode, paymentId });

  // Demo mode - create mock payment with QR code
  if (IS_DEMO_MODE) {
    console.log('[Kiosk Payment] Running in DEMO mode');
    
    // Generate a demo payment URL (would normally be DimePay checkout URL)
    const demoPaymentUrl = `https://demo.dimepay.io/pay/${paymentId}`;
    
    // Generate QR code
    let qrCodeDataUrl: string | undefined;
    try {
      qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    } catch (qrError) {
      console.error('QR generation error:', qrError);
    }

    // Store for status checking
    globalDemoPayments.set(paymentId, {
      saveCode,
      boxSize,
      phone: cleanPhone,
      amount,
      createdAt: Date.now(),
    });

    console.log('[Kiosk Payment] Demo payment created:', { paymentId, saveCode });

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

  // Real DimePay integration
  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';

    const response = await fetch(`${DIMEPAY_BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DIMEPAY_API_KEY}`,
        'X-Merchant-ID': DIMEPAY_MERCHANT_ID,
      },
      body: JSON.stringify({
        amount: amount * 100, // Convert to cents
        currency: 'JMD',
        reference: `DROP-${boxSize}-${Date.now()}`,
        description: `Drop-off Credit - ${boxSize} Box`,
        customer: {
          phone: cleanPhone,
        },
        redirect_url: `${baseUrl}/?payment=success`,
        webhook_url: `${baseUrl}/api/webhooks/dimepay`,
        metadata: {
          type: 'dropoff_credit',
          boxSize,
          phone: cleanPhone,
          saveCode,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Kiosk Payment] DimePay error:', result);
      return NextResponse.json({
        success: false,
        error: result.message || 'Failed to create payment with provider',
      }, { status: 500 });
    }

    // Generate QR code if URL provided
    const paymentUrl = result.data?.payment_url || result.data?.checkoutUrl;
    let qrCodeDataUrl: string | undefined;
    
    if (paymentUrl) {
      try {
        qrCodeDataUrl = await generateQRCodeDataUrl(paymentUrl);
      } catch (qrError) {
        console.error('QR generation error:', qrError);
      }
    }

    return NextResponse.json({
      success: true,
      paymentId: result.data?.id || result.data?.paymentId,
      paymentUrl,
      qrCodeDataUrl,
      amount,
      boxSize,
      saveCode,
      message: `Scan QR code to pay JMD $${amount} for ${boxSize} box drop-off`,
    });

  } catch (fetchError) {
    console.error('[Kiosk Payment] Fetch error:', fetchError);
    return NextResponse.json({
      success: false,
      error: 'Failed to connect to payment provider. Please try again.',
    }, { status: 500 });
  }
}

// Create storage fee payment
async function createStorageFeePayment(orderId: string, amount: number, phone?: string) {
  if (!orderId || !amount || amount <= 0) {
    return NextResponse.json({
      success: false,
      error: 'Order ID and valid amount are required',
    }, { status: 400 });
  }

  const paymentId = `SF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Demo mode
  if (IS_DEMO_MODE) {
    const demoPaymentUrl = `https://demo.dimepay.io/pay/${paymentId}`;
    
    let qrCodeDataUrl: string | undefined;
    try {
      qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    } catch (qrError) {
      console.error('QR generation error:', qrError);
    }

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

  // Real implementation would go here
  return NextResponse.json({
    success: false,
    error: 'Payment gateway not configured',
  }, { status: 500 });
}
