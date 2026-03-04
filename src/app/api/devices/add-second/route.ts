import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/devices/add-second - Add the second locker device with its credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, name, bestwondAppId, bestwondAppSecret, totalBoxes } = body;

    if (!deviceId || !name || !bestwondAppId || !bestwondAppSecret) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: deviceId, name, bestwondAppId, bestwondAppSecret',
      }, { status: 400 });
    }

    // Check if device already exists
    const existing = await db.device.findFirst({
      where: { deviceId },
    });

    if (existing) {
      // Update existing device with new credentials
      const updated = await db.device.update({
        where: { id: existing.id },
        data: {
          name,
          bestwondAppId,
          bestwondAppSecret,
          status: 'ONLINE',
          totalBoxes: totalBoxes || existing.totalBoxes,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json({
        success: true,
        message: 'Device credentials updated',
        device: {
          id: updated.id,
          deviceId: updated.deviceId,
          name: updated.name,
          status: updated.status,
        },
      });
    }

    // Create new device
    const device = await db.device.create({
      data: {
        deviceId,
        name,
        status: 'ONLINE',
        totalBoxes: totalBoxes || 36,
        availableBoxes: totalBoxes || 36,
        bestwondAppId,
        bestwondAppSecret,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Device added successfully',
      device: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        status: device.status,
        totalBoxes: device.totalBoxes,
      },
    });

  } catch (error) {
    console.error('Add device error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
