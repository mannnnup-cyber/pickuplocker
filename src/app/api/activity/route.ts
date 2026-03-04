import { NextRequest, NextResponse } from 'next/server';
import { 
  getBoxListWithCredentials,
  getBoxLogWithCredentials,
  getConfigAsync,
  type BestwondCredentials 
} from '@/lib/bestwond';
import { db } from '@/lib/db';
import { getConfiguredDevices } from '@/lib/settings';

// GET /api/activity - Get occupied boxes and activity logs from Bestwond lockers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const includeLogs = searchParams.get('logs') === 'true';

    // Get global config as fallback
    const globalConfig = await getConfigAsync();
    
    // Get all configured devices from settings
    const configuredDevices = await getConfiguredDevices();
    
    // Also get devices from database
    let dbDevices = deviceId 
      ? await db.device.findMany({ where: { deviceId } })
      : await db.device.findMany();

    // Build devices list with credentials
    const devices: Array<{
      deviceId: string;
      name: string;
      appId: string;
      appSecret: string;
    }> = [];

    // Add configured devices from settings
    for (const dev of configuredDevices) {
      // Filter by specific deviceId if requested
      if (deviceId && dev.deviceId !== deviceId) continue;
      
      devices.push({
        deviceId: dev.deviceId,
        name: dev.name,
        appId: dev.appId,
        appSecret: dev.appSecret,
      });
    }

    // Add database devices that aren't already in the list
    for (const dev of dbDevices) {
      if (!devices.find(d => d.deviceId === dev.deviceId)) {
        const creds = {
          deviceId: dev.deviceId,
          name: dev.name || dev.deviceId,
          appId: dev.bestwondAppId || globalConfig.appId,
          appSecret: dev.bestwondAppSecret || globalConfig.appSecret,
        };
        
        // Filter by specific deviceId if requested
        if (deviceId && creds.deviceId !== deviceId) continue;
        
        if (creds.appId && creds.appSecret) {
          devices.push(creds);
        }
      }
    }

    // If no devices configured, use global config as fallback
    if (devices.length === 0 && globalConfig.deviceId && globalConfig.appId && globalConfig.appSecret) {
      if (!deviceId || globalConfig.deviceId === deviceId) {
        devices.push({
          deviceId: globalConfig.deviceId,
          name: 'Default Locker',
          appId: globalConfig.appId,
          appSecret: globalConfig.appSecret,
        });
      }
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
      // Build credentials
      const credentials: BestwondCredentials = {
        appId: device.appId,
        appSecret: device.appSecret,
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
