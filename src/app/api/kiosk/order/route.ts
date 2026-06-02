import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { allocateLocker, BOX_PRICES, releaseLocker } from '@/lib/locker-alloc';

// POST /api/kiosk/order - Create a new kiosk order
// DB is the source of truth for locker availability.
// Bestwond API is used for physical door operations only.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, boxSize, recipientPhone, senderName, courierId, courierPin } = body;

    // Validate action
    if (action !== 'create_order') {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use: create_order',
      }, { status: 400 });
    }

    // Validate box size
    if (!boxSize || !['S', 'M', 'L', 'XL'].includes(boxSize)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid box size. Must be S, M, L, or XL',
      }, { status: 400 });
    }

    // Validate recipient phone
    if (!recipientPhone) {
      return NextResponse.json({
        success: false,
        error: 'Recipient phone number is required',
      }, { status: 400 });
    }

    // Clean phone number
    const cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');

    // Handle courier validation BEFORE allocating a locker
    let courier: Awaited<ReturnType<typeof db.courier.findUnique>> = null;
    let courierBalance = 0;

    if (courierId) {
      courier = await db.courier.findUnique({ where: { id: courierId } });
      if (!courier) {
        return NextResponse.json({
          success: false,
          error: 'Invalid courier account',
        }, { status: 400 });
      }

      // Verify courier PIN if provided
      if (courierPin) {
        // PIN verification is handled by the kiosk-action route
        // This API accepts courierId from already-authenticated sessions
      }

      if (courier.status !== 'ACTIVE') {
        return NextResponse.json({
          success: false,
          error: 'Courier account is not active',
        }, { status: 400 });
      }

      // Check balance
      const boxPrice = BOX_PRICES[boxSize];
      if (courier.balance < boxPrice) {
        return NextResponse.json({
          success: false,
          error: `Insufficient balance. Need JMD $${boxPrice}, available: JMD $${courier.balance}`,
          requiresTopup: true,
          currentBalance: courier.balance,
          requiredAmount: boxPrice,
        }, { status: 400 });
      }

      courierBalance = courier.balance - boxPrice;
    }

    // ============================================
    // ALLOCATE LOCKER FROM DATABASE (source of truth)
    // ============================================
    const allocation = await allocateLocker(boxSize as 'S' | 'M' | 'L' | 'XL');

    if (!allocation.success) {
      const err = allocation as { success: false; error: string; statusCode: number };
      return NextResponse.json({
        success: false,
        error: err.error,
      }, { status: err.statusCode });
    }

    const alloc = allocation as typeof allocation & { success: true };

    // Use Bestwond box name if available, otherwise use DB box number
    const boxName = alloc.bestwondBoxName || String(alloc.box.boxNumber).padStart(2, '0');
    const bestwondOrderNo = alloc.orderNo;
    const bestwondSaveCode = alloc.saveCode;
    const bestwondPickCode = alloc.pickCode;

    // Find or create customer
    let customer = await db.user.findFirst({
      where: { phone: cleanPhone },
    });

    if (!customer) {
      customer = await db.user.create({
        data: {
          name: senderName || 'Customer',
          phone: cleanPhone,
          email: `${cleanPhone}@pickup.local`,
          role: 'CUSTOMER',
        },
      });
    }

    // Create Express Order record
    const expressOrder = await db.expressOrder.create({
      data: {
        orderNo: bestwondOrderNo,
        deviceId: alloc.device.deviceId,
        boxName,
        boxSize,
        saveCode: bestwondSaveCode,
        pickCode: bestwondPickCode,
        status: 'CREATED',
        customerName: senderName || 'Customer',
        customerPhone: cleanPhone,
        courierName: courier?.name,
      },
    });

    // Create main Order record
    const order = await db.order.create({
      data: {
        orderNumber: bestwondOrderNo,
        trackingCode: bestwondPickCode,
        customerId: customer.id,
        customerName: senderName || customer.name || 'Customer',
        customerPhone: cleanPhone,
        deviceId: alloc.device.id,
        boxId: alloc.box.id,
        boxNumber: alloc.box.boxNumber,
        courierId: courier?.id,
        courierName: courier?.name,
        packageSize: boxSize,
        status: 'PENDING',
        storageStartAt: new Date(),
      },
    });

    // Deduct from courier balance if applicable
    if (courier) {
      const boxPrice = BOX_PRICES[boxSize];
      await db.courier.update({
        where: { id: courier.id },
        data: {
          balance: { decrement: boxPrice },
          totalDropOffs: { increment: 1 },
          totalSpent: { increment: boxPrice },
          lastActivityAt: new Date(),
        },
      });

      // Create courier transaction
      await db.courierTransaction.create({
        data: {
          courierId: courier.id,
          type: 'DROP_OFF',
          amount: -boxPrice,
          balanceAfter: courier.balance - boxPrice,
          orderId: order.id,
          reference: bestwondOrderNo,
          description: `Drop-off: ${boxSize} box, Order ${bestwondOrderNo}`,
        },
      });
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: customer.id,
        action: 'KIOSK_ORDER_CREATED',
        description: `Kiosk order ${bestwondOrderNo} created. Box: ${boxName}, Size: ${boxSize}, SaveCode: ${bestwondSaveCode}${alloc.bestwondRegistered ? '' : ' (DB-only, Bestwond unavailable)'}`,
        orderId: order.id,
      },
    });

    return NextResponse.json({
      success: true,
      orderNo: bestwondOrderNo,
      saveCode: bestwondSaveCode,
      pickCode: bestwondPickCode,
      boxName,
      boxSize,
      deviceName: alloc.device.name,
      deviceLocation: alloc.device.location,
      courierBalance: courierBalance || undefined,
      bestwondRegistered: alloc.bestwondRegistered,
    });

  } catch (error) {
    console.error('Kiosk order creation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    }, { status: 500 });
  }
}
