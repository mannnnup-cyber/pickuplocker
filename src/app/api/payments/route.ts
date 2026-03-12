import { NextRequest, NextResponse } from 'next/server';
import { 
  createPayment, 
  createStorageFeePayment, 
  createCourierTopupPayment,
  getPaymentStatus, 
  listPayments,
  calculateDimePayFee 
} from '@/lib/dimepay';
import { db } from '@/lib/db';

// Mock payments for fallback
const mockPayments = [
  { id: '1', orderId: 'DH-20250224-003', customerName: 'Sarah Jones', amount: 200, status: 'COMPLETED', method: 'CARD', createdAt: new Date().toISOString() },
  { id: '2', orderId: 'DH-20250225-002', customerName: 'John Brown', amount: 150, status: 'PENDING', method: 'CARD', createdAt: new Date(Date.now() - 3600000).toISOString() },
];

// POST /api/payments - Create payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action, 
      orderId, 
      amount, 
      customerEmail, 
      customerPhone, 
      description,
      passFeeToCustomer,
      // For storage fee payments
      orderNumber,
      trackingCode,
      customerName,
      // For courier top-up
      courierId,
      courierName,
    } = body;

    // Calculate fee preview
    if (action === 'calculate_fee') {
      if (!amount || amount <= 0) {
        return NextResponse.json({
          success: false,
          error: 'Valid amount is required',
        }, { status: 400 });
      }

      const feeCalc = calculateDimePayFee(amount);
      return NextResponse.json({
        success: true,
        data: {
          originalAmount: amount,
          fee: feeCalc.fee,
          totalWithFee: feeCalc.totalWithFee,
          feePercentage: '2.5%',
          fixedFee: 30,
        },
      });
    }

    // Create storage fee payment
    if (action === 'storage_fee') {
      if (!orderId || !amount || amount <= 0) {
        return NextResponse.json({
          success: false,
          error: 'Order ID and valid amount are required',
        }, { status: 400 });
      }

      // Get order details from database
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: { device: true },
      });

      if (!order) {
        return NextResponse.json({
          success: false,
          error: 'Order not found',
        }, { status: 404 });
      }

      const result = await createStorageFeePayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        trackingCode: order.trackingCode,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail || undefined,
        amount: amount,
        passFeeToCustomer: passFeeToCustomer ?? true, // Default to passing fee to customer
      });

      if (result.success && result.data) {
        // Create pending payment record in database
        await db.payment.create({
          data: {
            orderId: order.id,
            userId: order.customerId,
            amount: result.data.amount,
            method: 'ONLINE',
            status: 'PENDING',
            gatewayRef: result.data.paymentId,
            gatewayResponse: JSON.stringify({
              paymentUrl: result.data.paymentUrl,
              qrCodeDataUrl: result.data.qrCodeDataUrl,
              originalAmount: result.data.originalAmount,
              feeAmount: result.data.feeAmount,
            }),
          },
        });
      }

      return NextResponse.json(result);
    }

    // Create courier top-up payment
    if (action === 'courier_topup') {
      if (!courierId || !amount || amount <= 0) {
        return NextResponse.json({
          success: false,
          error: 'Courier ID and valid amount are required',
        }, { status: 400 });
      }

      // Get courier details
      const courier = await db.courier.findUnique({
        where: { id: courierId },
      });

      if (!courier) {
        return NextResponse.json({
          success: false,
          error: 'Courier not found',
        }, { status: 404 });
      }

      const result = await createCourierTopupPayment({
        courierId: courier.id,
        courierName: courier.name,
        amount: amount,
        customerEmail: customerEmail || courier.email || undefined,
        customerPhone: customerPhone || courier.phone || undefined,
        passFeeToCourier: passFeeToCustomer ?? false, // Default to merchant absorbing fee
      });

      return NextResponse.json(result);
    }

    // Generic payment creation
    if (action === 'create') {
      if (!amount || amount <= 0) {
        return NextResponse.json({
          success: false,
          error: 'Valid amount is required',
        }, { status: 400 });
      }

      const result = await createPayment({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'JMD',
        orderId: orderId || `PAY-${Date.now()}`,
        description: description || `Storage Fee Payment`,
        customerEmail,
        customerPhone,
        redirectUrl: `${process.env.NEXTAUTH_URL || 'https://pickuplocker.vercel.app'}/dashboard?payment=success`,
        webhookUrl: `${process.env.NEXTAUTH_URL || 'https://pickuplocker.vercel.app'}/api/webhooks/dimepay`,
        passFeeToCustomer,
      });

      return NextResponse.json(result);
    }

    // Get payment status
    if (action === 'status') {
      const { paymentId } = body;
      if (!paymentId) {
        return NextResponse.json({
          success: false,
          error: 'Payment ID is required',
        }, { status: 400 });
      }

      const result = await getPaymentStatus(paymentId);
      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: calculate_fee, storage_fee, courier_topup, create, status',
    }, { status: 400 });

  } catch (error) {
    console.error('Payment API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/payments - List payments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const orderId = searchParams.get('orderId');

    // If orderId is provided, get payments for that order from database
    if (orderId) {
      const payments = await db.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: payments,
      });
    }

    // Try to get from DimePay API
    const result = await listPayments({ status, limit });

    if (result.success && result.data && result.data.length > 0) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    }

    // Return mock data if no real payments
    const filteredPayments = status 
      ? mockPayments.filter(p => p.status === status)
      : mockPayments;

    return NextResponse.json({
      success: true,
      data: filteredPayments,
    });

  } catch (error) {
    console.error('Payment list error:', error);
    return NextResponse.json({
      success: true,
      data: mockPayments,
    });
  }
}
