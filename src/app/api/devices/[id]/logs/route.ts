import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBoxLog, getCredentialsForDevice, type BestwondCredentials } from '@/lib/bestwond';

// GET box usage logs for a device
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const boxNumber = searchParams.get('boxNumber');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const source = searchParams.get('source') || 'local'; // 'local' or 'api'
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Get device from database
    const device = await db.device.findUnique({
      where: { id },
      select: { 
        id: true, 
        deviceId: true, 
        name: true, 
        bestwondAppId: true, 
        bestwondAppSecret: true 
      }
    });

    if (!device) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    // If requesting from API, fetch from Bestwond
    if (source === 'api' && device.deviceId) {
      try {
        let credentials: BestwondCredentials;
        
        if (device.bestwondAppId && device.bestwondAppSecret) {
          credentials = {
            appId: device.bestwondAppId,
            appSecret: device.bestwondAppSecret,
          };
        } else {
          credentials = await getCredentialsForDevice(id);
        }

        const options: { boxNo?: number; startTime?: string; endTime?: string } = {};
        if (boxNumber) options.boxNo = parseInt(boxNumber, 10);
        if (startDate) options.startTime = startDate;
        if (endDate) options.endTime = endDate;

        const result = await getBoxLog(device.deviceId, options);

        if (result.code === 0 && result.data) {
          return NextResponse.json({
            success: true,
            source: 'api',
            device: {
              id: device.id,
              name: device.name,
            },
            logs: result.data,
          });
        } else {
          return NextResponse.json({
            success: false,
            error: result.msg || 'Failed to fetch logs from API',
            code: result.code
          }, { status: 400 });
        }
      } catch (apiError) {
        console.error('Failed to fetch from Bestwond API:', apiError);
        return NextResponse.json({
          success: false,
          error: apiError instanceof Error ? apiError.message : 'API request failed'
        }, { status: 500 });
      }
    }

    // Fetch from local database
    const whereClause: Record<string, unknown> = { deviceId: id };
    
    // If filtering by specific box
    if (boxNumber) {
      const box = await db.box.findFirst({
        where: { deviceId: id, boxNumber: parseInt(boxNumber, 10) }
      });
      if (box) {
        whereClause.boxId = box.id;
      }
    }

    // Date filter
    if (startDate || endDate) {
      whereClause.occurredAt = {};
      if (startDate) whereClause.occurredAt.gte = new Date(startDate);
      if (endDate) whereClause.occurredAt.lte = new Date(endDate);
    }

    const logs = await db.boxLog.findMany({
      where: whereClause,
      include: {
        box: {
          select: { boxNumber: true, size: true }
        }
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      source: 'local',
      device: {
        id: device.id,
        name: device.name,
      },
      logs: logs.map(log => ({
        id: log.id,
        boxNumber: log.box.boxNumber,
        boxSize: log.box.size,
        action: log.action,
        orderNo: log.orderNo,
        occurredAt: log.occurredAt,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      })),
      total: logs.length,
    });
  } catch (error) {
    console.error('Failed to fetch box logs:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch box logs'
    }, { status: 500 });
  }
}

// POST - Create a new log entry (for webhook or manual logging)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { boxNumber, action, orderNo, occurredAt, metadata } = body;

    if (!boxNumber || !action) {
      return NextResponse.json({
        success: false,
        error: 'boxNumber and action are required'
      }, { status: 400 });
    }

    // Find the box
    const box = await db.box.findFirst({
      where: { deviceId: id, boxNumber: parseInt(boxNumber, 10) }
    });

    if (!box) {
      return NextResponse.json({
        success: false,
        error: 'Box not found'
      }, { status: 404 });
    }

    // Create log entry
    const log = await db.boxLog.create({
      data: {
        boxId: box.id,
        deviceId: id,
        action,
        orderNo: orderNo || null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      }
    });

    // Update box's lastUsedAt
    await db.box.update({
      where: { id: box.id },
      data: { lastUsedAt: new Date() }
    });

    return NextResponse.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Failed to create box log:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create box log'
    }, { status: 500 });
  }
}
