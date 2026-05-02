import { NextRequest, NextResponse } from 'next/server';
import { 
  getBoxListWithCredentials,
  getBoxLogWithCredentials,
  getConfigAsync,
  type BestwondCredentials 
} from '@/lib/bestwond';
import { db } from '@/lib/db';

// GET /api/activity - Get occupied boxes and activity logs from Bestwond lockers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const includeLogs = searchParams.get('logs') === 'true';

    // Get devices from database
    let devices = deviceId 
      ? await db.device.findMany({ where: { deviceId } })
      : await db.device.findMany();

    // Get global config as fallback
    const globalConfig = await getConfigAsync();
    
    // If no devices in database, use global device ID from settings/env
    if (devices.length === 0 && globalConfig.deviceId) {
      console.log('No devices in database, using global device ID:', globalConfig.deviceId);
      devices = [{
        id: 'global',
        deviceId: globalConfig.deviceId,
        name: 'Default Locker',
        status: 'ONLINE',
        location: null,
        totalBoxes: 24,
        availableBoxes: 24,
        bestwondAppId: globalConfig.appId,
        bestwondAppSecret: globalConfig.appSecret,
        createdAt: new Date(),
        updatedAt: new Date(),
      }] as typeof devices;
    }
    
    // Also check if specific deviceId was requested that's not in DB
    if (deviceId && !devices.find(d => d.deviceId === deviceId) && globalConfig.deviceId === deviceId) {
      devices.push({
        id: 'global',
        deviceId: globalConfig.deviceId,
        name: 'Default Locker',
        status: 'ONLINE',
        location: null,
        totalBoxes: 24,
        availableBoxes: 24,
        bestwondAppId: globalConfig.appId,
        bestwondAppSecret: globalConfig.appSecret,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof devices[0]);
    }

    // Collect occupied boxes from Bestwond
    const occupiedBoxes: Array<{
      deviceId: string;
      deviceName: string;
      boxName: string;
      boxSize: string;
      orderNo: string;
      saveTime: string | null;
      pickCode?: string;
    }> = [];

    // Collect activity logs
    const activityLogs: Array<{
      taskId: number;
      deviceId: string;
      deviceName: string;
      boxName: string;
      action: string;
      actionTime: string;
      remark: string;
    }> = [];

    for (const device of devices) {
      // Build credentials - device-specific or global fallback
      const credentials: BestwondCredentials = {
        appId: device.bestwondAppId || globalConfig.appId,
        appSecret: device.bestwondAppSecret || globalConfig.appSecret,
        baseUrl: globalConfig.baseUrl || 'https://api.bestwond.com',
      };

      if (!credentials.appId || !credentials.appSecret) {
        continue;
      }

      try {
        // Get box list from Bestwond
        const boxListResult = await getBoxListWithCredentials(device.deviceId, credentials);

        if (boxListResult.code === 0 && boxListResult.data) {
          const boxes = Array.isArray(boxListResult.data) ? boxListResult.data : [];
          
          for (const box of boxes) {
            const boxData = box as {
              box_name: string;
              box_size?: string;
              order_no?: string | null;
              save_time?: string | null;
              pick_code?: string;
            };
            
            // Only include boxes that have orders (occupied)
            if (boxData.order_no) {
              occupiedBoxes.push({
                deviceId: device.deviceId,
                deviceName: device.name || device.deviceId,
                boxName: boxData.box_name,
                boxSize: boxData.box_size || 'Unknown',
                orderNo: boxData.order_no,
                saveTime: boxData.save_time || null,
                pickCode: boxData.pick_code,
              });
            }
          }
        }

        // Get activity logs if requested
        if (includeLogs) {
          const logResult = await getBoxLogWithCredentials(device.deviceId, credentials, {
            pageNum: 1,
            pageSize: 100,
          });

          if (logResult.code === 0 && logResult.data) {
            const logData = logResult.data as {
              list?: Array<{
                task_id: number;
                box_name: string;
                action: string;
                action_time: string;
                remark: string;
              }>;
            };

            if (logData.list) {
              for (const log of logData.list) {
                activityLogs.push({
                  taskId: log.task_id,
                  deviceId: device.deviceId,
                  deviceName: device.name || device.deviceId,
                  boxName: log.box_name,
                  action: log.action,
                  actionTime: log.action_time,
                  remark: log.remark,
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to get data for device ${device.deviceId}:`, error);
      }
    }

    // Sort logs by action time descending
    activityLogs.sort((a, b) => new Date(b.actionTime).getTime() - new Date(a.actionTime).getTime());

    return NextResponse.json({
      success: true,
      occupiedBoxes,
      activityLogs: includeLogs ? activityLogs : undefined,
      totalOccupied: occupiedBoxes.length,
      totalLogs: activityLogs.length,
      devicesQueried: devices.length,
    });

  } catch (error) {
    console.error('Activity API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
