import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const devices = await db.device.findMany({
      include: {
        _count: { select: { boxes: true } },
        boxes: { where: { status: 'AVAILABLE' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const devicesWithStats = devices.map(device => ({
      id: device.id,
      deviceId: device.deviceId,
      name: device.name,
      location: device.location,
      status: device.status,
      totalBoxes: device._count.boxes,
      availableBoxes: device.boxes.length,
      hasCredentials: !!(device.bestwondAppId && device.bestwondAppSecret),
    }));

    return NextResponse.json({ success: true, data: devicesWithStats });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch devices' }, { status: 500 });
  }
}

// POST - Add new device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, name, location, totalBoxes, bestwondAppId, bestwondAppSecret } = body;

    console.log('Creating device with data:', { deviceId, name, location, totalBoxes, hasCredentials: !!(bestwondAppId && bestwondAppSecret) });

    if (!deviceId) {
      return NextResponse.json({
        success: false,
        error: 'Device ID is required'
      }, { status: 400 });
    }

    // Check if device already exists
    const existing = await db.device.findUnique({
      where: { deviceId }
    });

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'Device with this ID already exists'
      }, { status: 400 });
    }

    // Parse totalBoxes as integer
    const boxCount = parseInt(String(totalBoxes), 10) || 24;
    
    // Auto-generate name if not provided
    const deviceName = name || `Locker ${deviceId}`;

    // Create device with optional Bestwond credentials
    const device = await db.device.create({
      data: {
        deviceId: String(deviceId),
        name: deviceName,
        location: location || null,
        totalBoxes: boxCount,
        availableBoxes: boxCount,
        status: 'ONLINE',
        bestwondAppId: bestwondAppId || null,
        bestwondAppSecret: bestwondAppSecret || null,
      }
    });

    // Create boxes for the device
    const boxesData = Array.from({ length: boxCount }, (_, i) => ({
      boxNumber: i + 1,
      deviceId: device.id,
      status: 'AVAILABLE' as const,
    }));

    await db.box.createMany({
      data: boxesData,
      skipDuplicates: true,
    });

    console.log('Device created successfully:', device.id);

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        location: device.location,
        status: device.status,
        totalBoxes: boxCount,
        availableBoxes: boxCount,
        hasCredentials: !!(device.bestwondAppId && device.bestwondAppSecret),
      }
    });
  } catch (error) {
    console.error('Failed to create device:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create device'
    }, { status: 500 });
  }
}

// PUT - Update device
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, location, status, bestwondAppId, bestwondAppSecret } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Device ID is required'
      }, { status: 400 });
    }

    // Build update data - only update credentials if provided
    const updateData: Record<string, unknown> = {
      name,
      location: location || null,
      status: status || undefined,
    };
    
    // Only update credentials if they are non-empty strings (don't overwrite with empty)
    if (bestwondAppId && bestwondAppId.trim() !== '') {
      updateData.bestwondAppId = bestwondAppId.trim();
    }
    if (bestwondAppSecret && bestwondAppSecret.trim() !== '') {
      updateData.bestwondAppSecret = bestwondAppSecret.trim();
    }

    const device = await db.device.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        location: device.location,
        status: device.status,
        hasCredentials: !!(device.bestwondAppId && device.bestwondAppSecret),
      }
    });
  } catch (error) {
    console.error('Failed to update device:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update device'
    }, { status: 500 });
  }
}

// DELETE - Remove device
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Device ID is required'
      }, { status: 400 });
    }

    // Check if device has orders
    const ordersCount = await db.order.count({
      where: { deviceId: id, status: { in: ['PENDING', 'STORED', 'READY'] } }
    });

    if (ordersCount > 0) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete device with ${ordersCount} active orders. Complete or cancel orders first.`
      }, { status: 400 });
    }

    // Delete boxes first
    await db.box.deleteMany({
      where: { deviceId: id }
    });

    // Delete device
    await db.device.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete device:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete device'
    }, { status: 500 });
  }
}
