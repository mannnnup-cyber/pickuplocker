import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import { expressSaveOrTakeWithCredentials, openBoxWithCredentials, getConfigAsync, getCredentialsForDevice, type BestwondCredentials } from '@/lib/bestwond';
import { sendPickupNotification, sendPickupConfirmation } from '@/lib/textbee';

// POST /api/kiosk/use-code - Use a save_code or pick_code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, codeType, recipientPhone, paymentMethod } = body;

    // Validate code
    if (!code || code.length !== 6) {
      return NextResponse.json({
        success: false,
        error: 'Please enter a valid 6-digit code',
      }, { status: 400 });
    }

    // Validate code type
    if (!codeType || !['save', 'pick'].includes(codeType)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid code type. Must be "save" or "pick"',
      }, { status: 400 });
    }

    // Handle save_code (drop-off)
    if (codeType === 'save') {
      return await handleSaveCode(code, recipientPhone);
    }

    // Handle pick_code (pickup)
    if (codeType === 'pick') {
      return await handlePickCode(code, paymentMethod);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid request',
    }, { status: 400 });

  } catch (error) {
    console.error('Use code error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process code',
    }, { status: 500 });
  }
}

// Handle save_code for drop-off
async function handleSaveCode(saveCode: string, recipientPhone?: string) {
  // Find express order by save_code
  const expressOrder = await db.expressOrder.findFirst({
    where: { saveCode, status: 'CREATED' },
  });

  if (!expressOrder) {
    return NextResponse.json({
      success: false,
      error: 'Invalid or expired drop-off code',
    }, { status: 404 });
  }

  // Check if recipient phone is provided
  if (!recipientPhone) {
    return NextResponse.json({
      success: true,
      requiresPhone: true,
      message: 'Please enter recipient phone number',
      orderNo: expressOrder.orderNo,
      boxSize: expressOrder.boxSize,
    });
  }

  // Clean phone number
  const cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId: expressOrder.deviceId },
  });

  if (!device) {
    return NextResponse.json({
      success: false,
      error: 'Locker device not found',
    }, { status: 404 });
  }

  // Get Bestwond credentials
  const credentials = await getCredentialsForDevice(device.id);
  
  // Open the box via Bestwond Express API
  let boxOpened = false;
  let boxName = expressOrder.boxName;

  try {
    const result = await expressSaveOrTakeWithCredentials(
      expressOrder.deviceId,
      expressOrder.boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );

    if (result.code === 0 && result.data) {
      boxOpened = true;
      boxName = result.data.box_name || boxName;
    }
  } catch (bestwondError) {
    console.error('Bestwond express save error:', bestwondError);
    // Try direct box open as fallback
    try {
      const boxNumber = parseInt(boxName || '1');
      const openResult = await openBoxWithCredentials(device.deviceId, boxNumber, credentials);
      boxOpened = openResult.code === 0;
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Update express order
  await db.expressOrder.update({
    where: { id: expressOrder.id },
    data: {
      status: 'STORED',
      saveTime: new Date(),
      customerPhone: cleanPhone,
    },
  });

  // Find and update main order
  const order = await db.order.findFirst({
    where: { orderNumber: expressOrder.orderNo },
  });

  if (order) {
    // Update order status
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'STORED',
        dropOffAt: new Date(),
        customerPhone: cleanPhone,
        storageStartAt: new Date(),
      },
    });

    // Mark box as occupied
    if (order.boxId) {
      await db.box.update({
        where: { id: order.boxId },
        data: { status: 'OCCUPIED', lastUsedAt: new Date() },
      });
    }

    // Send pickup notification SMS
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 3); // 3 days free storage

      await sendPickupNotification(
        cleanPhone,
        expressOrder.customerName || 'Customer',
        expressOrder.pickCode,
        device.location || 'Pickup Locker',
        expiryDate.toLocaleDateString()
      );
    } catch (smsError) {
      console.error('Failed to send pickup SMS:', smsError);
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        action: 'KIOSK_DROP_OFF',
        description: `Package stored via kiosk. Box: ${boxName}, Code: ${saveCode}`,
        orderId: order.id,
      },
    });
  }

  return NextResponse.json({
    success: true,
    orderNo: expressOrder.orderNo,
    boxName,
    boxOpened,
    pickCode: expressOrder.pickCode,
    message: 'Locker opened! Please place your package inside and close the door.',
  });
}

// Handle pick_code for pickup
async function handlePickCode(pickCode: string, paymentMethod?: string) {
  // Find express order by pick_code
  const expressOrder = await db.expressOrder.findFirst({
    where: { pickCode, status: 'STORED' },
  });

  // Also check main orders table
  const order = await db.order.findUnique({
    where: { trackingCode: pickCode },
    include: { device: true, box: true },
  });

  if (!expressOrder && !order) {
    return NextResponse.json({
      success: false,
      error: 'Invalid pickup code',
    }, { status: 404 });
  }

  // Check if already picked up
  if (expressOrder?.status === 'PICKED_UP' || order?.status === 'PICKED_UP') {
    return NextResponse.json({
      success: false,
      error: 'This package has already been picked up',
    }, { status: 400 });
  }

  // Get order details
  let deviceId = expressOrder?.deviceId || order?.device?.deviceId || '';
  let boxName = expressOrder?.boxName || (order?.boxNumber?.toString().padStart(2, '0')) || '01';
  let boxSize = expressOrder?.boxSize || order?.packageSize || 'M';

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId },
  });

  if (!device) {
    return NextResponse.json({
      success: false,
      error: 'Locker device not found',
    }, { status: 404 });
  }

  // Calculate storage fee
  const storageStart = order?.storageStartAt || order?.dropOffAt || order?.createdAt || expressOrder?.createdAt;
  const storageCalc = getStorageCalculation(new Date(storageStart || new Date()));
  const storageFee = storageCalc.storageFee;

  // Check if payment is required
  if (storageFee > 0 && !paymentMethod) {
    return NextResponse.json({
      success: true,
      requiresPayment: true,
      orderNo: expressOrder?.orderNo || order?.orderNumber,
      boxName,
      storageFee,
      storageDays: storageCalc.totalDays,
      message: `Storage fee of JMD $${storageFee} is required`,
    });
  }

  // Get Bestwond credentials
  const credentials = await getCredentialsForDevice(device.id);

  // Open the box via Bestwond Express API
  let boxOpened = false;

  try {
    const result = await expressSaveOrTakeWithCredentials(
      device.deviceId,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      pickCode,
      'take',
      credentials
    );

    if (result.code === 0) {
      boxOpened = true;
    }
  } catch (bestwondError) {
    console.error('Bestwond express take error:', bestwondError);
    // Try direct box open as fallback
    try {
      const boxNumber = parseInt(boxName);
      const openResult = await openBoxWithCredentials(device.deviceId, boxNumber, credentials);
      boxOpened = openResult.code === 0;
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Record payment if applicable
  if (storageFee > 0 && paymentMethod && order) {
    await db.payment.create({
      data: {
        orderId: order.id,
        userId: order.customerId,
        amount: storageFee,
        method: paymentMethod as 'CASH' | 'CARD' | 'ONLINE',
        status: 'COMPLETED',
        paidAt: new Date(),
      },
    });
  }

  // Update express order
  if (expressOrder) {
    await db.expressOrder.update({
      where: { id: expressOrder.id },
      data: {
        status: 'PICKED_UP',
        pickTime: new Date(),
      },
    });
  }

  // Update main order
  if (order) {
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(),
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

    // Send confirmation SMS
    try {
      await sendPickupConfirmation(order.customerPhone, order.customerName);
    } catch (smsError) {
      console.error('Failed to send pickup confirmation SMS:', smsError);
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        action: 'KIOSK_PICKUP',
        description: `Package picked up via kiosk. Box: ${boxName}, Days: ${storageCalc.totalDays}, Fee: JMD $${storageFee}`,
        orderId: order.id,
      },
    });
  }

  return NextResponse.json({
    success: true,
    orderNo: expressOrder?.orderNo || order?.orderNumber,
    boxName,
    boxOpened,
    storageFee,
    message: 'Locker opened! Please collect your package and close the door.',
  });
}
