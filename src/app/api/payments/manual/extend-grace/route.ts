import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/payments/manual/extend-grace - Extend the grace period for a manually paid order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, additionalHours, reason, staffName } = body;

    if (!orderId || !additionalHours || !staffName) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: orderId, additionalHours, staffName' 
      }, { status: 400 });
    }

    if (additionalHours < 1 || additionalHours > 168) { // Max 7 days
      return NextResponse.json({ 
        success: false, 
        error: 'Additional hours must be between 1 and 168 (7 days)' 
      }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: {
        OR: [
          { id: orderId },
          { orderNumber: orderId },
          { trackingCode: orderId },
        ],
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (!order.manuallyPaidAt || !order.manualPaymentGraceUntil) {
      return NextResponse.json({ 
        success: false, 
        error: 'This order has no manual payment grace period to extend' 
      }, { status: 400 });
    }

    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ 
        success: false, 
        error: 'This order has already been picked up' 
      }, { status: 400 });
    }

    // Extend the grace period
    const currentGraceUntil = new Date(order.manualPaymentGraceUntil);
    const newGraceUntil = new Date(currentGraceUntil.getTime() + additionalHours * 60 * 60 * 1000);

    await db.order.update({
      where: { id: order.id },
      data: {
        manualPaymentGraceUntil: newGraceUntil,
      },
    });

    // Update the ManualPayment record too
    const manualPayment = await db.manualPayment.findUnique({
      where: { orderId: order.id },
    });
    if (manualPayment) {
      await db.manualPayment.update({
        where: { id: manualPayment.id },
        data: { graceUntil: newGraceUntil },
      });
    }

    // Log activity
    await db.activity.create({
      data: {
        userId: order.customerId,
        orderId: order.id,
        action: 'GRACE_PERIOD_EXTENDED',
        description: `Grace period extended by ${additionalHours}h by ${staffName}. New deadline: ${newGraceUntil.toISOString()}. Reason: ${reason || 'N/A'}`,
        metadata: JSON.stringify({
          previousGraceUntil: currentGraceUntil.toISOString(),
          newGraceUntil: newGraceUntil.toISOString(),
          additionalHours,
          reason,
          staffName,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      previousGraceUntil: currentGraceUntil.toISOString(),
      newGraceUntil: newGraceUntil.toISOString(),
      additionalHours,
    });

  } catch (error) {
    console.error('[Extend Grace] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extend grace period',
    }, { status: 500 });
  }
}
