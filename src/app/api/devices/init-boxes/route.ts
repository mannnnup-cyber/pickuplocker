import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/devices/init-boxes - Initialize box records for a device
// This creates boxes in the database so the DB-first allocation works
// even when Bestwond API is unavailable
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, totalBoxes = 36, sizeLayout } = body;

    if (!deviceId) {
      return NextResponse.json({
        success: false,
        error: 'deviceId is required (Bestwond device number, e.g., "2100018247")',
      }, { status: 400 });
    }

    // Find the device
    const device = await db.device.findFirst({
      where: { deviceId },
    });

    if (!device) {
      return NextResponse.json({
        success: false,
        error: `Device ${deviceId} not found in database. Please configure the device first.`,
      }, { status: 404 });
    }

    // Check if boxes already exist
    const existingBoxes = await db.box.count({
      where: { deviceId: device.id },
    });

    if (existingBoxes > 0) {
      return NextResponse.json({
        success: true,
        message: `Device already has ${existingBoxes} boxes. Use force=true to recreate.`,
        existingBoxes,
        device: {
          id: device.id,
          deviceId: device.deviceId,
          name: device.name,
        },
      });
    }

    // Create boxes with size layout
    // Default layout: first 1/3 S, middle 1/3 M, next 1/4 L, rest XL
    const layout = sizeLayout || {
      S: Math.ceil(totalBoxes * 0.28),   // ~28% Small
      M: Math.ceil(totalBoxes * 0.28),   // ~28% Medium
      L: Math.ceil(totalBoxes * 0.25),   // ~25% Large
      XL: 0,                             // Rest is XL
    };
    layout.XL = totalBoxes - layout.S - layout.M - layout.L;

    let boxNumber = 1;
    const sizes: { size: string; count: number }[] = [
      { size: 'S', count: layout.S },
      { size: 'M', count: layout.M },
      { size: 'L', count: layout.L },
      { size: 'XL', count: layout.XL },
    ];

    let created = 0;
    for (const { size, count } of sizes) {
      for (let i = 0; i < count; i++) {
        await db.box.create({
          data: {
            deviceId: device.id,
            boxNumber: boxNumber,
            status: 'AVAILABLE',
            size: size,
          },
        });
        boxNumber++;
        created++;
      }
    }

    // Update device totals
    await db.device.update({
      where: { id: device.id },
      data: {
        totalBoxes: created,
        availableBoxes: created,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Created ${created} boxes for device ${device.name}`,
      boxes: sizes.map(s => ({ size: s.size, count: s.count })),
      device: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        totalBoxes: created,
        availableBoxes: created,
      },
    });

  } catch (error) {
    console.error('Init boxes error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
