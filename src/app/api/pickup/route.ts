import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateStorageFee, getStorageCalculation } from '@/lib/storage';
import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';
import { sendPickupConfirmation } from '@/lib/textbee';

// GET /api/pickup?code=123456 - Verify pickup code and get order details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code || code.length !== 6) {
      return NextResponse.json({ 
        success: false, 
        error: 'Please enter a valid 6-digit pickup code' 
      }, { status: 400 });
    }

    // Find order by tracking code
    const order = await db.order.findUnique({
      where: { trackingCode: code },
      include: { 
        device: true, 
        box: true,
        payments: { 
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid pickup code. Please check and try again.' 
      }, { status: 404 });
    }

    // Check order status
    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ 
        success: false, 
        error: 'This package has already been picked up.',
        alreadyPickedUp: true,
      }, { status: 400 });
    }

    if (order.status === 'ABANDONED') {
      return NextResponse.json({ 
        success: false, 
        error: 'This package has been marked as abandoned. Please contact support.',
      }, { status: 400 });
    }

    if (order.status === 'CANCELLED') {
      return NextResponse.json({ 
        success: false, 
        error: 'This order has been cancelled.',
      }, { status: 400 });
    }

    if (order.status === 'PENDING') {
      return NextResponse.json({ 
        success: false, 
        error: 'Package not yet stored. Please wait for drop-off confirmation.',
      }, { status: 400 });
    }

    // Calculate storage fee
    const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
    const storageCalc = getStorageCalculation(new Date(storageStart));
    
    // Check for existing payment
    const existingPayment = order.payments[0];
    const amountPaid = existingPayment?.amount || 0;
    const remainingFee = Math.max(0, storageCalc.storageFee - amountPaid);

    // Return order details
    return NextResponse.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        trackingCode: order.trackingCode,
        customerName: order.customerName,
        deviceName: order.device?.name,
        deviceLocation: order.device?.location,
        boxNumber: order.boxNumber,
        storageDays: storageCalc.totalDays,
        storageFee: storageCalc.storageFee,
        remainingFee,
        feeBreakdown: storageCalc.tierBreakdown,
        requiresPayment: remainingFee > 0,
        freePickup: storageCalc.storageFee === 0,
        isAbandoned: storageCalc.isAbandoned,
        daysUntilAbandoned: storageCalc.daysUntilAbandoned,
        dropOffDate: order.dropOffAt || order.createdAt,
      },
    });

  } catch (error) {
    console.error('Pickup verification error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to verify pickup code. Please try again.' 
    }, { status: 500 });
  }
}

// POST /api/pickup - Process pickup (with payment if required)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      code, 
      paymentMethod, 
      paymentReference,
      staffOverride, // Staff ID if cash payment override
    } = body;

    if (!code) {
      return NextResponse.json({ 
        success: false, 
        error: 'Pickup code is required' 
      }, { status: 400 });
    }

    // Find order
    const order = await db.order.findUnique({
      where: { trackingCode: code },
      include: { device: true, box: true },
    });

    if (!order) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid pickup code' 
      }, { status: 404 });
    }

    if (!['STORED', 'READY'].includes(order.status)) {
      return NextResponse.json({ 
        success: false, 
        error: `Cannot pickup. Order status: ${order.status}` 
      }, { status: 400 });
    }

    // Calculate fee
    const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
    const storageCalc = getStorageCalculation(new Date(storageStart));
    const storageFee = storageCalc.storageFee;

    // Check if payment required
    if (storageFee > 0 && !paymentMethod) {
      return NextResponse.json({ 
        success: false, 
        error: 'Payment required before pickup',
        requiresPayment: true,
        storageFee,
        storageDays: storageCalc.totalDays,
      }, { status: 402 });
    }

    // Create payment record if fee > 0
    if (storageFee > 0 && paymentMethod) {
      await db.payment.create({
        data: {
          orderId: order.id,
          userId: order.customerId,
          amount: storageFee,
          method: paymentMethod,
          status: paymentMethod === 'CASH' && staffOverride ? 'COMPLETED' : 'COMPLETED',
          gatewayRef: paymentReference,
          paidAt: new Date(),
        },
      });
    }

    // Open the box via DoorOperationService (safe: retry, fallback, verification)
    let doorResult: DoorOperationResult | null = null;
    if (order.device && order.boxNumber) {
      doorResult = await executeDoorOperation({
        orderId: order.id,
        orderNo: order.orderNumber,
        deviceId: order.device.id,
        deviceNumber: order.device.deviceId,
        boxId: order.boxId,
        boxNumber: order.boxNumber,
        action: 'pickup',
        actionCode: order.trackingCode,
        idempotencyKey: `pickup:${order.id}:${Date.now()}`,
        useExpressApi: true,
      });
    }

    // SAFETY: Only update business state after confirmed door opening
    const doorConfirmed = doorResult ? (doorResult.success && doorResult.confirmed) : false;

    if (!doorConfirmed && doorResult) {
      // Door failed — do NOT mark as picked up
      if (storageFee > 0 && paymentMethod) {
        await db.order.update({
          where: { id: order.id },
          data: { status: 'PAID_PENDING_DOOR_OPEN' },
        });
      }
      return NextResponse.json({
        success: false,
        error: doorResult.message || 'Could not open locker door. Please try again or contact staff.',
        retryable: doorResult.retryable,
        orderNumber: order.orderNumber,
        boxNumber: order.boxNumber,
      }, { status: 503 });
    }

    // Door confirmed open — update business state
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(),
        pickUpBy: staffOverride || order.customerId,
        storageDays: storageCalc.totalDays,
        storageFee,
      },
    });

    // Mark box as available
    if (order.boxId) {
      await db.box.update({
        where: { id: order.boxId },
        data: { status: 'AVAILABLE' },
      });
    }

    // Update device available count
    if (order.deviceId) {
      await db.device.update({
        where: { id: order.deviceId },
        data: { availableBoxes: { increment: 1 } },
      });
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: staffOverride || order.customerId,
        action: 'PACKAGE_PICKED_UP',
        description: `Package picked up via ${paymentMethod || 'free pickup'}. Days: ${storageCalc.totalDays}, Fee: JMD $${storageFee}`,
        orderId: order.id,
      },
    });

    // Send confirmation SMS
    try {
      await sendPickupConfirmation(order.customerPhone, order.customerName);
    } catch (smsError) {
      console.error('Failed to send pickup confirmation SMS:', smsError);
    }

    return NextResponse.json({
      success: true,
      message: 'Pickup successful! Box is now open.',
      data: {
        orderNumber: order.orderNumber,
        boxNumber: order.boxNumber,
        storageDays: storageCalc.totalDays,
        storageFee,
        paymentMethod,
      },
    });

  } catch (error) {
    console.error('Pickup processing error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to process pickup' 
    }, { status: 500 });
  }
}
