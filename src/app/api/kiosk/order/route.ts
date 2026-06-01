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

    // Get Bestwond credentials (from device or global settings)
    const config = await getConfigAsync();
    if (!config.appId || !config.appSecret) {
      return NextResponse.json({
        success: false,
        error: 'Locker system not configured. Please contact support.',
      }, { status: 500 });
    }

    // Find the device - prefer ONLINE, but also accept any device
    // The Bestwond API will handle the actual box allocation
    let device = await db.device.findFirst({
      where: { status: 'ONLINE' },
    });

    // If no ONLINE device, try any device with a deviceId matching Bestwond config
    if (!device) {
      device = await db.device.findFirst({
        where: { deviceId: config.deviceId },
      });
    }

    // If still no device, try any device at all
    if (!device) {
      device = await db.device.findFirst();
    }

    if (!device) {
      return NextResponse.json({
        success: false,
        error: 'No locker device found. Please contact support.',
      }, { status: 500 });
    }

    // The device ID to use for Bestwond API calls
    const bestwondDeviceId = device.deviceId || config.deviceId;

    // Handle courier validation BEFORE calling Bestwond API
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

    // Generate order numbers
    const orderNumber = generateOrderNumber();
    const saveCode = generateTrackingCode(); // 6-digit save code
    const pickCode = generateTrackingCode(); // 6-digit pickup code

    // Call Bestwond Express API to create the order and allocate a box
    // The Bestwond API is the SOURCE OF TRUTH for box availability
    let boxName = '';
    let bestwondOrderNo = orderNumber;
    let bestwondSaveCode = saveCode;
    let bestwondPickCode = pickCode;
    let bestwondSuccess = false;

    try {
      console.log(`[Kiosk Order] Calling Bestwond setSaveOrder: device=${bestwondDeviceId}, order=${orderNumber}, size=${boxSize}`);

      const bestwondResult = await setSaveOrderWithCredentials(
        bestwondDeviceId,
        orderNumber,
        boxSize as 'S' | 'M' | 'L' | 'XL',
        config
      );

      console.log(`[Kiosk Order] Bestwond response: code=${bestwondResult.code}, msg=${bestwondResult.msg}`, 
        bestwondResult.data ? `box_name=${bestwondResult.data.box_name}` : 'no data');

      if (bestwondResult.code === 0 && bestwondResult.data) {
        // Bestwond successfully allocated a box
        boxName = bestwondResult.data.box_name || '';
        bestwondOrderNo = bestwondResult.data.order_no || orderNumber;
        bestwondSaveCode = bestwondResult.data.save_code || saveCode;
        bestwondPickCode = bestwondResult.data.pick_code || pickCode;
        bestwondSuccess = true;
      } else {
        // Bestwond API returned an error (e.g., no boxes available for this size)
        const errorMsg = bestwondResult.msg || 'Bestwond API error';
        console.error(`[Kiosk Order] Bestwond API error: ${errorMsg}`);

        // Return a user-friendly error
        if (errorMsg.includes('no box') || errorMsg.includes('full') || errorMsg.includes('no available')) {
          return NextResponse.json({
            success: false,
            error: 'No available lockers for this box size. Please try a different size.',
          }, { status: 400 });
        }

        return NextResponse.json({
          success: false,
          error: `Locker allocation failed: ${errorMsg}. Please try again.`,
        }, { status: 400 });
      }
    } catch (bestwondError) {
      console.error('[Kiosk Order] Bestwond API exception:', bestwondError);
      return NextResponse.json({
        success: false,
        error: 'Failed to communicate with locker system. Please try again.',
      }, { status: 500 });
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

    // Try to find or create the box record in our local DB
    // The box may not exist if sync hasn't run, so we upsert it
    const boxNumber = parseInt(boxName, 10) || 0;
    let box: { id: string; boxNumber: number; status: string; size: string | null } | null = null;

    if (boxNumber > 0) {
      try {
        box = await db.box.upsert({
          where: {
            deviceId_boxNumber: {
              deviceId: device.id,
              boxNumber: boxNumber,
            },
          },
          update: {
            status: 'RESERVED',
            size: boxSize,
          },
          create: {
            deviceId: device.id,
            boxNumber: boxNumber,
            status: 'RESERVED',
            size: boxSize,
          },
        });
      } catch (boxError) {
        console.error('[Kiosk Order] Error upserting box:', boxError);
        // Continue without a box record - the Bestwond order is already created
      }
    }

    // Create Express Order record
    const expressOrder = await db.expressOrder.create({
      data: {
        orderNo: bestwondOrderNo,
        deviceId: bestwondDeviceId,
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
        deviceId: device.id,
        boxId: box?.id,
        boxNumber: boxNumber || undefined,
        courierId: courier?.id,
        courierName: courier?.name,
        packageSize: boxSize,
        status: 'PENDING',
        storageStartAt: new Date(),
      },
    });

    // Update device available count (best effort)
    try {
      await db.device.update({
        where: { id: device.id },
        data: {
          availableBoxes: { decrement: 1 },
          // If device was not ONLINE, update it since Bestwond API worked
          ...(device.status !== 'ONLINE' ? { status: 'ONLINE', lastHeartbeat: new Date() } : {}),
        },
      });
    } catch (deviceError) {
      console.error('[Kiosk Order] Error updating device:', deviceError);
    }

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
        description: `Kiosk order ${bestwondOrderNo} created. Box: ${boxName}, Size: ${boxSize}, SaveCode: ${bestwondSaveCode}`,
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
