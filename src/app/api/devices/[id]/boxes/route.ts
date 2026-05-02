import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBoxListWithCredentials, getDeviceStatusWithCredentials, getCredentialsForDevice, type BestwondCredentials } from '@/lib/bestwond';

// GET boxes for a device
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get('sync') === 'true';

    // Get device from database
    const device = await db.device.findUnique({
      where: { id },
      include: {
        boxes: {
          orderBy: { boxNumber: 'asc' }
        }
      }
    });

    if (!device) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    // Get orders for boxes in this device
    const orders = await db.order.findMany({
      where: {
        deviceId: id,
        status: { in: ['PENDING', 'STORED', 'READY'] }
      },
      select: {
        id: true,
        orderNumber: true,
        trackingCode: true,
        customerName: true,
        customerPhone: true,
        boxNumber: true,
        status: true,
        createdAt: true,
        dropOffAt: true,
      }
    });

    // Create a map of boxNumber to order
    const orderMap = new Map();
    orders.forEach(order => {
      if (order.boxNumber) {
        orderMap.set(order.boxNumber, order);
      }
    });

    let boxesWithOrders = device.boxes.map(box => ({
      boxNumber: box.boxNumber,
      status: box.status,
      size: box.size,
      lastUsedAt: box.lastUsedAt,
      order: orderMap.get(box.boxNumber) || null,
    }));

    let syncResult = { synced: false, boxesUpdated: 0, deviceOnline: null as boolean | null, error: null as string | null };

    // Sync with Bestwond API if requested
    if (sync && device.deviceId) {
      try {
        // Get credentials for this device (from device or global fallback)
        let credentials: BestwondCredentials;
        
        if (device.bestwondAppId && device.bestwondAppSecret) {
          // Use device-specific credentials
          credentials = {
            appId: device.bestwondAppId,
            appSecret: device.bestwondAppSecret,
          };
        } else {
          // Fallback to global credentials
          credentials = await getCredentialsForDevice(id);
        }
        
        console.log('Sync credentials for device', device.deviceId, ':', { 
          hasAppId: !!credentials.appId, 
          hasAppSecret: !!credentials.appSecret 
        });
        
        if (!credentials.appId || !credentials.appSecret) {
          syncResult.error = 'No API credentials configured for this device';
          syncResult.synced = false;
        } else {
          const [boxListResult, statusResult] = await Promise.all([
            getBoxListWithCredentials(device.deviceId, credentials),
            getDeviceStatusWithCredentials(device.deviceId, credentials)
          ]);

          console.log('Bestwond boxList result:', boxListResult);
          console.log('Bestwond status result:', statusResult);

          // Check for API errors
          if (boxListResult.code !== 0) {
            syncResult.error = `Bestwond error: ${boxListResult.msg || `Code ${boxListResult.code}`}`;
            syncResult.synced = false;
          } else if (statusResult.code !== 0) {
            syncResult.error = `Device status error: ${statusResult.msg || `Code ${statusResult.code}`}`;
            syncResult.synced = false;
          }

          // Bestwond returns code 0 for success (not 200)
          if (boxListResult.code === 0 && boxListResult.data) {
          // Update local box status based on Bestwond data
          // Bestwond uses: box_name (numeric string), box_status (1=enabled), order_no (null=available)
          const bestwondBoxes = boxListResult.data as Array<{ 
            box_name: string; 
            box_status: number;
            enable_status: number;
            order_no: string | null;
            box_size?: string;
            lock_address?: string;
          }>;
          let boxesUpdated = 0;

          for (const bwBox of bestwondBoxes) {
            // Parse box number from box_name (e.g., "01", "02")
            const boxNumber = parseInt(bwBox.box_name, 10);
            if (isNaN(boxNumber)) continue;
            
            // Map Bestwond status to our status
            // box is available if order_no is null, occupied otherwise
            const newStatus = bwBox.order_no ? 'OCCUPIED' : 'AVAILABLE';
            
            // Map box size
            const sizeMap: Record<string, string> = {
              'S': 'SMALL',
              'M': 'MEDIUM', 
              'L': 'LARGE',
              'XL': 'EXTRA_LARGE'
            };
            const newSize = bwBox.box_size ? (sizeMap[bwBox.box_size] || 'MEDIUM') : 'MEDIUM';

            // Update database
            const result = await db.box.updateMany({
              where: { deviceId: id, boxNumber: boxNumber },
              data: { 
                status: newStatus, 
                size: newSize,
                lockAddress: bwBox.lock_address || null
              }
            });

            if (result.count > 0) boxesUpdated++;

            // Update local state with order_no (access code)
            const localBox = boxesWithOrders.find(b => b.boxNumber === boxNumber);
            if (localBox) {
              localBox.status = newStatus;
              localBox.size = newSize;
              // If there's an order_no from hardware but no local order, show it as unknown package
              if (bwBox.order_no && !localBox.order) {
                localBox.order = {
                  id: 'unknown',
                  orderNumber: bwBox.order_no,
                  trackingCode: bwBox.order_no,
                  customerName: 'Unknown',
                  customerPhone: '-',
                  status: 'UNKNOWN',
                  createdAt: new Date().toISOString(),
                };
              }
            }
          }

          syncResult.boxesUpdated = boxesUpdated;
          syncResult.synced = true;
          
          // Update device online status
          // Bestwond returns code 0 for success (not 200)
          // Status field is "on" or "off" (not boolean)
          // NOTE: Bestwond's online status can be unreliable - also check if box list API succeeded
          if (statusResult.code === 0) {
            const statusData = statusResult.data as { status?: string; online?: boolean } | null;
            
            // Device is considered online if:
            // 1. Status API explicitly says "on", OR
            // 2. Box list API succeeded (which means device is reachable)
            const isOnline = statusData?.status === 'on' || 
                            statusData?.online === true || 
                            statusData?.online === 1 ||
                            boxListResult.code === 0; // If box list succeeded, device is reachable
                            
            console.log('Device online check:', {
              statusField: statusData?.status,
              onlineField: statusData?.online,
              boxListSuccess: boxListResult.code === 0,
              determinedOnline: isOnline
            });
            
            await db.device.update({
              where: { id },
              data: {
                status: isOnline ? 'ONLINE' : 'OFFLINE',
                lastHeartbeat: new Date()
              }
            });
            syncResult.deviceOnline = isOnline;
          }

          // Update available boxes count
          const availableCount = boxesWithOrders.filter(b => b.status === 'AVAILABLE').length;
          await db.device.update({
            where: { id },
            data: { availableBoxes: availableCount }
          });
          }
        }

      } catch (syncError) {
        console.error('Failed to sync with Bestwond:', syncError);
        syncResult.error = syncError instanceof Error ? syncError.message : 'Sync failed';
      }
    }

    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        location: device.location,
        status: device.status,
        hasCredentials: !!(device.bestwondAppId && device.bestwondAppSecret),
      },
      boxes: boxesWithOrders,
      syncResult,
    });
  } catch (error) {
    console.error('Failed to fetch boxes:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch boxes'
    }, { status: 500 });
  }
}
