import { NextRequest, NextResponse } from 'next/server';
import { 
  getDeviceStatusWithCredentials, 
  getBoxListWithCredentials, 
  type BestwondCredentials 
} from '@/lib/bestwond';
import { db } from '@/lib/db';

// Cache sync status for 60 seconds (GET only, POST must be immediate)
export const revalidate = 60;

// Get credentials for a device
async function getCredentials(deviceId: string): Promise<BestwondCredentials> {
  const device = await db.device.findFirst({
    where: { deviceId: deviceId },
    select: { bestwondAppId: true, bestwondAppSecret: true }
  });
  
  if (device?.bestwondAppId && device?.bestwondAppSecret) {
    return {
      appId: device.bestwondAppId,
      appSecret: device.bestwondAppSecret,
      baseUrl: 'https://api.bestwond.com',
    };
  }
  
  // Fallback to global settings
  const { getConfigAsync } = await import('@/lib/bestwond');
  const globalConfig = await getConfigAsync();
  return {
    appId: globalConfig.appId,
    appSecret: globalConfig.appSecret,
    baseUrl: globalConfig.baseUrl,
  };
}

// POST /api/sync - Sync all locker data from Bestwond
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json().catch(() => ({}));
    const { deviceId } = body;
    
    // Get all devices or specific device
    const devices = deviceId 
      ? await db.device.findMany({ where: { deviceId } })
      : await db.device.findMany();
    
    if (devices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No devices found to sync',
      }, { status: 404 });
    }
    
    const results = [];
    
    for (const device of devices) {
      try {
        const credentials = await getCredentials(device.deviceId);
        
        if (!credentials.appId || !credentials.appSecret) {
          results.push({
            deviceId: device.deviceId,
            success: false,
            error: 'No credentials configured',
          });
          continue;
        }
        
        // Fetch data from Bestwond in parallel
        const [statusResult, boxListResult] = await Promise.all([
          getDeviceStatusWithCredentials(device.deviceId, credentials),
          getBoxListWithCredentials(device.deviceId, credentials),
        ]);
        
        // Process device status
        const isOnline = statusResult.code === 0 && 
          (statusResult.data?.status === 'on' || statusResult.data?.online === true);
        
        // Process box list
        let boxesUpdated = 0;
        let availableCount = 0;
        let usedCount = 0;
        
        if (boxListResult.code === 0 && boxListResult.data) {
          const boxes = Array.isArray(boxListResult.data) ? boxListResult.data : [];
          
          for (const box of boxes) {
            const boxData = box as {
              box_name: string;
              box_status?: number;
              box_size?: string;
              lock_address?: string;
              order_no?: string | null;
              enable_status?: number;
            };
            const boxNumber = parseInt(boxData.box_name, 10);
            // A box is occupied ONLY if it has an active order
            // box_status is NOT a reliable indicator of occupancy (it may indicate door status, enabled status, etc.)
            const isOccupied = !!(boxData.order_no && boxData.order_no.trim() !== '');
            
            // Upsert box in database
            try {
              await db.box.upsert({
                where: {
                  deviceId_boxNumber: {
                    deviceId: device.id,
                    boxNumber: boxNumber,
                  }
                },
                update: {
                  status: isOccupied ? 'OCCUPIED' : 'AVAILABLE',
                  size: boxData.box_size || null,
                  lockAddress: boxData.lock_address || null,
                  updatedAt: new Date(),
                },
                create: {
                  deviceId: device.id,
                  boxNumber: boxNumber,
                  status: isOccupied ? 'OCCUPIED' : 'AVAILABLE',
                  size: boxData.box_size || null,
                  lockAddress: boxData.lock_address || null,
                }
              });
              boxesUpdated++;
            } catch (boxError) {
              console.error(`Error upserting box ${boxNumber}:`, boxError);
            }
            
            if (isOccupied) {
              usedCount++;
            } else {
              availableCount++;
            }
          }
        }
        
        // Update device status
        await db.device.update({
          where: { id: device.id },
          data: {
            status: isOnline ? 'ONLINE' : 'OFFLINE',
            totalBoxes: availableCount + usedCount,
            availableBoxes: availableCount,
            lastHeartbeat: new Date(),
          }
        });
        
        // Update or create sync record
        try {
          await db.lockerSync.upsert({
            where: { deviceId: device.deviceId },
            update: {
              lastSyncAt: new Date(),
              syncStatus: 'SUCCESS',
              syncError: null,
              deviceOnline: isOnline,
              totalBoxes: availableCount + usedCount,
              availableBoxes: availableCount,
              usedBoxes: usedCount,
              boxesUpdated: boxesUpdated,
            },
            create: {
              deviceId: device.deviceId,
              lastSyncAt: new Date(),
              syncStatus: 'SUCCESS',
              deviceOnline: isOnline,
              totalBoxes: availableCount + usedCount,
              availableBoxes: availableCount,
              usedBoxes: usedCount,
              boxesUpdated: boxesUpdated,
            }
          });
        } catch (syncError) {
          console.error('Error updating sync record:', syncError);
        }
        
        results.push({
          deviceId: device.deviceId,
          success: true,
          online: isOnline,
          totalBoxes: availableCount + usedCount,
          availableBoxes: availableCount,
          usedBoxes: usedCount,
          boxesUpdated,
        });
        
      } catch (deviceError) {
        console.error(`Error syncing device ${device.deviceId}:`, deviceError);
        
        // Update sync record with error
        try {
          await db.lockerSync.upsert({
            where: { deviceId: device.deviceId },
            update: {
              lastSyncAt: new Date(),
              syncStatus: 'FAILED',
              syncError: deviceError instanceof Error ? deviceError.message : 'Unknown error',
            },
            create: {
              deviceId: device.deviceId,
              lastSyncAt: new Date(),
              syncStatus: 'FAILED',
              syncError: deviceError instanceof Error ? deviceError.message : 'Unknown error',
            }
          });
        } catch (syncError) {
          console.error('Error updating sync record:', syncError);
        }
        
        results.push({
          deviceId: device.deviceId,
          success: false,
          error: deviceError instanceof Error ? deviceError.message : 'Unknown error',
        });
      }
    }
    
    const latency = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    return NextResponse.json({
      success: true,
      synced: successCount,
      total: devices.length,
      latency,
      results,
    });
    
  } catch (error) {
    console.error('Sync API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/sync - Get sync status for all devices
export async function GET(request: NextRequest) {
  try {
    const syncStatuses = await db.lockerSync.findMany({
      orderBy: { lastSyncAt: 'desc' }
    }).catch(() => []);
    
    const devices = await db.device.findMany({
      select: {
        id: true,
        deviceId: true,
        name: true,
        status: true,
        totalBoxes: true,
        availableBoxes: true,
        location: true,
      }
    });
    
    // Combine device info with sync status
    const devicesWithSync = devices.map(device => {
      const syncStatus = syncStatuses.find(s => s.deviceId === device.deviceId);
      return {
        ...device,
        sync: syncStatus ? {
          lastSyncAt: syncStatus.lastSyncAt,
          syncStatus: syncStatus.syncStatus,
          syncError: syncStatus.syncError,
          deviceOnline: syncStatus.deviceOnline,
          usedBoxes: syncStatus.usedBoxes,
          boxesUpdated: syncStatus.boxesUpdated,
        } : null
      };
    });
    
    return NextResponse.json({
      success: true,
      devices: devicesWithSync,
      lastSync: syncStatuses[0]?.lastSyncAt || null,
    });
    
  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
