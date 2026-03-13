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
    const paymentData = globalDemoPayments.get(paymentId);
    
    if (paymentData) {
      // Auto-complete after 5 seconds in demo mode
      const elapsed = Date.now() - paymentData.createdAt;
      console.log('[Kiosk Payment] Payment elapsed time:', elapsed, 'ms');
      
      if (elapsed > 5000) {
        console.log('[Kiosk Payment] Payment completed! saveCode:', paymentData.saveCode);
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

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check payment status',
    }, { status: 500 });
  }
}

// Create drop-off credit payment - ALWAYS USES DEMO MODE
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
  const paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  console.log('[Kiosk Payment] Creating demo payment:', { 
    boxSize, 
    amount, 
    phone: cleanPhone, 
    saveCode, 
    paymentId 
  });

  // Always use demo mode for now
  const demoPaymentUrl = `https://demo.dimepay.io/pay/${paymentId}`;
  
  // Generate QR code
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    console.log('[Kiosk Payment] QR code generated successfully');
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
    // Continue without QR code
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
  console.log('[Kiosk Payment] Returning success response');

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
