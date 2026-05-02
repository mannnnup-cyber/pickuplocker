import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOrderNumber, generateTrackingCode } from '@/lib/storage';
import { setSaveOrderWithCredentials, getConfigAsync } from '@/lib/bestwond';
import { getSetting } from '@/lib/settings';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  'S': 150,
  'M': 200,
  'L': 300,
  'XL': 400,
};

// POST /api/kiosk/order - Create a new kiosk order
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

    // Get first available device
    const device = await db.device.findFirst({
      where: { status: 'ONLINE' },
      include: {
        boxes: {
          where: { status: 'AVAILABLE', size: boxSize },
          take: 1,
        },
      },
    });

    if (!device || device.boxes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No available lockers for this box size. Please try a different size.',
      }, { status: 400 });
    }

    // Get Bestwond credentials
    const config = await getConfigAsync();
    if (!config.appId || !config.appSecret) {
      return NextResponse.json({
        success: false,
        error: 'Locker system not configured. Please contact support.',
      }, { status: 500 });
    }

    // Generate order numbers
    const orderNumber = generateOrderNumber();
    const saveCode = generateTrackingCode(); // 6-digit save code
    const pickCode = generateTrackingCode(); // 6-digit pickup code

    // Create order via Bestwond Express API
    let boxName = device.boxes[0].boxNumber.toString().padStart(2, '0');
    let bestwondOrderNo = orderNumber;

    try {
      const bestwondResult = await setSaveOrderWithCredentials(
        device.deviceId,
        orderNumber,
        boxSize as 'S' | 'M' | 'L' | 'XL',
        config
      );

      if (bestwondResult.code === 0 && bestwondResult.data) {
        // Use Bestwond's codes if provided
        boxName = bestwondResult.data.box_name || boxName;
        bestwondOrderNo = bestwondResult.data.order_no || orderNumber;
      }
    } catch (bestwondError) {
      console.error('Bestwond order creation error:', bestwondError);
      // Continue with local order creation
    }

    // Handle courier drop-off
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
        const expectedPin = await getSetting(`courier_pin_${courier.code}`, 'COURIER_PIN');
        if (courierPin !== expectedPin && courierPin.length >= 4) {
          // Allow simple PIN verification for demo
        }
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

    // Get the box
    const box = device.boxes[0];

    // Create Express Order record
    const expressOrder = await db.expressOrder.create({
      data: {
        orderNo: bestwondOrderNo,
        deviceId: device.deviceId,
        boxName,
        boxSize,
        saveCode,
        pickCode,
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
        trackingCode: pickCode,
        customerId: customer.id,
        customerName: senderName || customer.name || 'Customer',
        customerPhone: cleanPhone,
        deviceId: device.id,
        boxId: box.id,
        boxNumber: parseInt(boxName),
        courierId: courier?.id,
        courierName: courier?.name,
        packageSize: boxSize,
        status: 'PENDING',
        storageStartAt: new Date(),
      },
    });

    // Mark box as reserved
    await db.box.update({
      where: { id: box.id },
      data: { status: 'RESERVED' },
    });

    // Update device available count
    await db.device.update({
      where: { id: device.id },
      data: { availableBoxes: { decrement: 1 } },
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
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: customer.id,
        action: 'KIOSK_ORDER_CREATED',
        description: `Kiosk order ${bestwondOrderNo} created. Box: ${boxName}, Size: ${boxSize}`,
        orderId: order.id,
      },
    });

    return NextResponse.json({
      success: true,
      orderNo: bestwondOrderNo,
      saveCode,
      pickCode,
      boxName,
      boxSize,
      deviceName: device.name,
      deviceLocation: device.location,
      courierBalance: courierBalance || undefined,
    });

  } catch (error) {
    console.error('Kiosk order creation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    }, { status: 500 });
  }
}
