import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';
import { sendSMS } from '@/lib/textbee';

// POST /api/payments/manual - Record a manual payment for an order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      orderId,           // Order ID or orderNumber or trackingCode
      amount,            // Amount collected
      discount = 0,      // Discount given
      discountReason,    // Why discount
      method,            // CASH, CARD, BANK_TRANSFER, OTHER
      staffName,         // Who accepted
      staffId,           // Staff user ID (optional)
      notes,             // Additional notes
      openBoxNow = false // Open box immediately?
    } = body;

    // Validate required fields
    if (!orderId || !amount || !method || !staffName) {
      return NextResponse.json({ success: false, error: 'Missing required fields: orderId, amount, method, staffName' }, { status: 400 });
    }

    if (!['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].includes(method)) {
      return NextResponse.json({ success: false, error: 'Invalid payment method. Must be CASH, CARD, BANK_TRANSFER, or OTHER' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ success: false, error: 'Amount must be greater than zero' }, { status: 400 });
    }

    // Find the order by ID, orderNumber, or trackingCode
    const order = await db.order.findFirst({
      where: {
        OR: [
          { id: orderId },
          { orderNumber: orderId },
          { trackingCode: orderId },
        ],
      },
      include: { device: true, box: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Can't pay for already picked up order
    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ success: false, error: 'This order has already been picked up' }, { status: 400 });
    }

    // Can't double-pay (check if already has a completed manual payment with active grace period)
    if (order.manuallyPaidAt && order.manualPaymentGraceUntil) {
      const graceExpired = new Date() > new Date(order.manualPaymentGraceUntil);
      if (!graceExpired) {
        return NextResponse.json({ 
          success: false, 
          error: 'This order already has a manual payment with an active grace period',
          graceUntil: order.manualPaymentGraceUntil,
        }, { status: 400 });
      }
    }

    // Calculate storage fee to get original amount
    const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
    const storageCalc = getStorageCalculation(new Date(storageStart || new Date()));
    const originalAmount = storageCalc.storageFee;

    // Generate receipt number: RCP-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `RCP-${dateStr}-${randomSuffix}`;

    // Calculate grace period: 24 hours from now
    const graceUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let boxOpened = false;
    let doorResult: DoorOperationResult | null = null;

    // If openBoxNow, try to open the box via DoorOperationService
    if (openBoxNow && order.device && order.boxNumber) {
      doorResult = await executeDoorOperation({
        orderId: order.id,
        orderNo: order.orderNumber,
        deviceId: order.device.id,
        deviceNumber: order.device.deviceId,
        boxId: order.boxId,
        boxNumber: order.boxNumber,
        action: 'pickup',
        actionCode: order.trackingCode,
        idempotencyKey: `manual-pay:${order.id}:${Date.now()}`,
        useExpressApi: true,
      });
      boxOpened = doorResult.success && doorResult.confirmed;
    }

    // Create the ManualPayment record
    const manualPayment = await db.manualPayment.create({
      data: {
        orderId: order.id,
        amount,
        originalAmount,
        discount,
        discountReason,
        method,
        staffName,
        staffId,
        notes,
        receiptNumber,
        graceUntil,
        openBoxNow: openBoxNow && boxOpened,
      },
    });

    // Update the order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderUpdateData: any = {
      manuallyPaidAt: now,
      manualPaymentGraceUntil: graceUntil,
      storageFee: originalAmount,
      storageDays: storageCalc.totalDays,
    };

    // If box was opened immediately, mark as picked up
    // If door was requested but failed, mark as PAID_PENDING_DOOR_OPEN (payment safe)
    if (openBoxNow && boxOpened) {
      orderUpdateData.status = 'PICKED_UP';
      orderUpdateData.pickUpAt = now;
      orderUpdateData.pickUpBy = staffName;
    } else if (openBoxNow && !boxOpened && doorResult) {
      // Door was requested but failed — payment is recorded but door not confirmed
      orderUpdateData.status = 'PAID_PENDING_DOOR_OPEN';
    }

    await db.order.update({
      where: { id: order.id },
      data: orderUpdateData,
    });

    // If box opened, mark box as available and update device count
    if (openBoxNow && boxOpened) {
      if (order.boxId) {
        await db.box.update({
          where: { id: order.boxId },
          data: { status: 'AVAILABLE' },
        });
      }
      if (order.deviceId) {
        await db.device.update({
          where: { id: order.deviceId },
          data: { availableBoxes: { increment: 1 } },
        });
      }
    }

    // Create a Payment record for the transaction ledger
    await db.payment.create({
      data: {
        orderId: order.id,
        userId: order.customerId,
        type: 'STORAGE_FEE',
        amount,
        method: method as 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'ONLINE',
        status: 'COMPLETED',
        description: `Manual payment recorded by ${staffName}. Receipt: ${receiptNumber}${discount > 0 ? `. Discount: JMD $${discount} (${discountReason || 'N/A'})` : ''}`,
        paidAt: now,
      },
    });

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        orderId: order.id,
        action: openBoxNow && boxOpened ? 'MANUAL_PAYMENT_BOX_OPENED' : 'MANUAL_PAYMENT_RECORDED',
        description: `Manual payment of JMD $${amount} (${method}) recorded by ${staffName}. Receipt: ${receiptNumber}${openBoxNow ? (boxOpened ? '. Box opened immediately.' : '. Box open FAILED.') : '. Customer will pick up later.'}`,
        metadata: JSON.stringify({
          manualPaymentId: manualPayment.id,
          receiptNumber,
          amount,
          method,
          discount,
          staffName,
          openBoxNow,
          boxOpened,
          graceUntil: graceUntil.toISOString(),
        }),
      },
    });

    // Send SMS to customer
    try {
      const graceDeadline = graceUntil.toLocaleString('en-JM', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      if (openBoxNow && boxOpened) {
        await sendSMS(
          order.customerPhone,
          `Pickup Jamaica: Your storage fee of JMD $${amount} has been paid. Your locker has been opened - please collect your package now. Receipt: ${receiptNumber}`
        );
      } else {
        await sendSMS(
          order.customerPhone,
          `Pickup Jamaica: Your storage fee of JMD $${amount} has been paid. Use pickup code ${order.trackingCode} at the locker to collect your package. Code valid until ${graceDeadline}. Receipt: ${receiptNumber}`
        );
      }
    } catch (smsError) {
      console.error('[Manual Payment] Failed to send SMS:', smsError);
    }

    return NextResponse.json({
      success: true,
      receipt: {
        receiptNumber,
        orderNumber: order.orderNumber,
        amount,
        originalAmount,
        discount,
        method,
        staffName,
        paidAt: now.toISOString(),
        graceUntil: graceUntil.toISOString(),
        boxOpened,
        pickupCode: order.trackingCode,
      },
    });

  } catch (error) {
    console.error('[Manual Payment] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record manual payment',
    }, { status: 500 });
  }
}
