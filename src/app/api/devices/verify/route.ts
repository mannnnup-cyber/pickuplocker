import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatusWithCredentials, getBoxListWithCredentials, getDeviceListWithCredentials, type BestwondCredentials } from '@/lib/bestwond';
import { db } from '@/lib/db';

// Verify a device ID with Bestwond API
// Supports per-device credentials for multi-account support
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, bestwondAppId, bestwondAppSecret } = body;

    if (!deviceId) {
      return NextResponse.json({
        success: false,
        error: 'Device ID is required'
      }, { status: 400 });
    }

    // Check if device already exists in database
    const existing = await db.device.findFirst({
      where: { deviceId }
    });

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'Device already registered',
        existingDevice: {
          id: existing.id,
          name: existing.name,
          location: existing.location
        }
      }, { status: 400 });
    }

    // Build credentials - use provided credentials or fall back to global settings
    let credentials: BestwondCredentials;
    
    if (bestwondAppId && bestwondAppSecret) {
      // Use provided credentials for this specific device
      credentials = {
        appId: bestwondAppId,
        appSecret: bestwondAppSecret,
        baseUrl: 'https://api.bestwond.com',
      };
    } else {
      // Fallback to global settings from environment/database
      const { getConfigAsync } = await import('@/lib/bestwond');
      const globalConfig = await getConfigAsync();
      credentials = {
        appId: globalConfig.appId,
        appSecret: globalConfig.appSecret,
        baseUrl: globalConfig.baseUrl,
      };
    }

    // Check if credentials are available
    if (!credentials.appId || !credentials.appSecret) {
      return NextResponse.json({
        success: false,
        error: 'No Bestwond credentials provided. Please enter App ID and App Secret, or configure global settings.'
      }, { status: 400 });
    }

    // First, try to get device list to see if device is registered to account
    const deviceListResult = await getDeviceListWithCredentials(credentials);
    
    // Bestwond returns code 0 for success (not 200)
    // If device list succeeded, check if our device is in the list
    if (deviceListResult.code === 0 && deviceListResult.data) {
      const devices = Array.isArray(deviceListResult.data) ? deviceListResult.data : [];
      const deviceFound = devices.find((d: { device_number?: string; deviceNumber?: string; id?: string }) => 
        d.device_number === deviceId || d.deviceNumber === deviceId || d.id === deviceId
      );
      
      if (!deviceFound) {
        // Device not in account's device list
        return NextResponse.json({
          success: false,
          error: `Device ${deviceId} not found in the provided Bestwond account. Available devices: ${devices.map((d: { device_number?: string; deviceNumber?: string; id?: string; name?: string }) => d.device_number || d.deviceNumber || d.id || d.name).join(', ') || 'None'}`,
          availableDevices: devices
        });
      }
      
      // Store device name from Bestwond
      const deviceName = (deviceFound as { name?: string; device_name?: string }).name || 
                         (deviceFound as { name?: string; device_name?: string }).device_name || 
                         null;
      
      // Try to get device status and box list
      const [statusResult, boxListResult] = await Promise.all([
        getDeviceStatusWithCredentials(deviceId, credentials),
        getBoxListWithCredentials(deviceId, credentials)
      ]);

      // Log for debugging
      console.log('Device status result:', JSON.stringify(statusResult));
      console.log('Box list result:', JSON.stringify(boxListResult));

      // Bestwond returns code 0 for success (not 200)
      // If both failed with parameter error, device might not be linked
      if (statusResult.code !== 0 && boxListResult.code !== 0) {
        return NextResponse.json({
          success: false,
          error: statusResult.msg || boxListResult.msg || 'Device verification failed',
          details: {
            statusError: statusResult.msg,
            boxListError: boxListResult.msg
          }
        });
      }

      // Extract device info
      // Bestwond returns status: "on" or "off" (not boolean)
      const isOnline = statusResult.data?.status === 'on' || 
                       statusResult.data?.online === true || 
                       statusResult.data?.online === 1;
                       
      // Bestwond returns box_name (numeric string), count from data
      const boxCount = boxListResult.code === 0 && boxListResult.data 
        ? boxListResult.data.length 
        : statusResult.data?.box_count || 24;

      // Count available boxes from Bestwond
      // Box is available if order_no is null
      let availableBoxes = 0;
      if (boxListResult.code === 0 && boxListResult.data) {
        availableBoxes = (boxListResult.data as Array<{ order_no: string | null }>)
          .filter(b => b.order_no === null).length;
      }

      return NextResponse.json({
        success: true,
        device: {
          deviceId,
          deviceName, // Include device name from Bestwond
          online: isOnline,
          totalBoxes: boxCount,
          availableBoxes,
          boxes: boxListResult.data || []
        }
      });
    }

    // Try to get device status and box list
    const [statusResult, boxListResult] = await Promise.all([
      getDeviceStatusWithCredentials(deviceId, credentials),
      getBoxListWithCredentials(deviceId, credentials)
    ]);

    // Log for debugging
    console.log('Device status result:', JSON.stringify(statusResult));
    console.log('Box list result:', JSON.stringify(boxListResult));

    // Bestwond returns code 0 for success (not 200)
    // If both failed with parameter error, device might not be linked
    if (statusResult.code !== 0 && boxListResult.code !== 0) {
      return NextResponse.json({
        success: false,
        error: statusResult.msg || boxListResult.msg || 'Device verification failed',
        details: {
          statusError: statusResult.msg,
          boxListError: boxListResult.msg
        }
      });
    }

    // Extract device info
    // Bestwond returns status: "on" or "off" (not boolean)
    const isOnline = statusResult.data?.status === 'on' || 
                     statusResult.data?.online === true || 
                     statusResult.data?.online === 1;
                     
    // Bestwond returns box_name (numeric string), count from data
    const boxCount = boxListResult.code === 0 && boxListResult.data 
      ? boxListResult.data.length 
      : statusResult.data?.box_count || 24;

    // Count available boxes from Bestwond
    // Box is available if order_no is null
    let availableBoxes = 0;
    if (boxListResult.code === 0 && boxListResult.data) {
      availableBoxes = (boxListResult.data as Array<{ order_no: string | null }>)
        .filter(b => b.order_no === null).length;
    }

    return NextResponse.json({
      success: true,
      device: {
        deviceId,
        deviceName: null, // No name available from device list
        online: isOnline,
        totalBoxes: boxCount,
        availableBoxes,
        boxes: boxListResult.data || []
      }
    });

  } catch (error) {
    console.error('Device verification error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify device'
    }, { status: 500 });
  }
}
