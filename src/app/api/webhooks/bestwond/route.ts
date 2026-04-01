import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/bestwond';
import { calculateStorageFee } from '@/lib/storage';

// POST /api/webhooks/bestwond - Handle Bestwond webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-bestwond-signature') || '';

    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(body);
    const { event, deviceId, boxNumber, orderId, timestamp, data } = payload;

    // Log the webhook event
    console.log(`[Webhook] ${event} - Device: ${deviceId}, Box: ${boxNumber}`);

    switch (event) {
      case 'door_opened':
        await handleDoorOpened(deviceId, boxNumber, timestamp);
        break;

      case 'door_closed':
        await handleDoorClosed(deviceId, boxNumber, timestamp);
        break;

      case 'order_stored':
        await handleOrderStored(deviceId, boxNumber, orderId, data);
        break;

      case 'order_picked_up':
        await handleOrderPickedUp(deviceId, boxNumber, orderId, timestamp);
        break;

      case 'device_online':
        await handleDeviceOnline(deviceId);
        break;

      case 'device_offline':
        await handleDeviceOffline(deviceId);
        break;

      default:
        console.log(`[Webhook] Unknown event: ${event}`);
    }

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleDoorOpened(deviceId: string, boxNumber: number, timestamp: string) {
  const device = await db.device.findFirst({ where: { deviceId } });
  if (!device) return;

  await db.activity.create({
    data: {
      action: 'DOOR_OPENED',
      description: `Box #${boxNumber} opened on device ${device.name}`,
      metadata: JSON.stringify({ deviceId, boxNumber, timestamp }),
    },
  });
}

async function handleDoorClosed(deviceId: string, boxNumber: number, timestamp: string) {
  const device = await db.device.findFirst({ where: { deviceId } });
  if (!device) return;

  await db.activity.create({
    data: {
      action: 'DOOR_CLOSED',
      description: `Box #${boxNumber} closed on device ${device.name}`,
      metadata: JSON.stringify({ deviceId, boxNumber, timestamp }),
    },
  });
}

async function handleOrderStored(deviceId: string, boxNumber: number, orderId: string, data: any) {
  const device = await db.device.findFirst({ where: { deviceId } });
  const box = await db.box.findFirst({
    where: { deviceId: device?.id, boxNumber },
  });

  if (!device || !box) return;

  // Update box status
  await db.box.update({
    where: { id: box.id },
    data: {
      status: 'OCCUPIED',
      lastUsedAt: new Date(),
    },
  });

  await db.activity.create({
    data: {
      action: 'ORDER_STORED',
      description: `Order stored in box #${boxNumber} on ${device.name}`,
      metadata: JSON.stringify({ orderId, deviceId, boxNumber, data }),
    },
  });
}

async function handleOrderPickedUp(deviceId: string, boxNumber: number, orderId: string, timestamp: string) {
  const device = await db.device.findFirst({ where: { deviceId } });
  const box = await db.box.findFirst({
    where: { deviceId: device?.id, boxNumber },
  });

  if (!device || !box) return;

  // Find order by orderId or by box assignment
  const order = await db.order.findFirst({
    where: {
      OR: [
        { id: orderId },
        { boxId: box.id, status: { in: ['PENDING', 'STORED', 'READY'] } }
      ]
    }
  });

  let storageFee = 0;
  let storageDays = 0;

  if (order?.storageStartAt) {
    const calculation = calculateStorageFee(new Date(order.storageStartAt), new Date(timestamp));
    storageFee = calculation.storageFee;
    storageDays = calculation.totalDays;
  }

  // Update order status
  if (order) {
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(timestamp),
        storageEndAt: new Date(timestamp),
        storageFee,
        storageDays,
      },
    });
  }

  // Update box status
  await db.box.update({
    where: { id: box.id },
    data: {
      status: 'AVAILABLE',
    },
  });

  // Update device available boxes count
  await db.device.update({
    where: { id: device.id },
    data: {
      availableBoxes: { increment: 1 },
    },
  });

  await db.activity.create({
    data: {
      action: 'ORDER_PICKED_UP',
      description: `Order picked up from box #${boxNumber}`,
      orderId: order?.id,
      metadata: JSON.stringify({ orderId, storageFee, storageDays }),
    },
  });
}

async function handleDeviceOnline(deviceId: string) {
  const device = await db.device.findFirst({ where: { deviceId } });
  if (!device) return;

  await db.device.update({
    where: { id: device.id },
    data: {
      status: 'ONLINE',
      lastHeartbeat: new Date(),
    },
  });

  await db.activity.create({
    data: {
      action: 'DEVICE_ONLINE',
      description: `Device ${device.name} came online`,
    },
  });
}

async function handleDeviceOffline(deviceId: string) {
  const device = await db.device.findFirst({ where: { deviceId } });
  if (!device) return;

  await db.device.update({
    where: { id: device.id },
    data: {
      status: 'OFFLINE',
    },
  });

  await db.activity.create({
    data: {
      action: 'DEVICE_OFFLINE',
      description: `Device ${device.name} went offline`,
    },
  });
}
