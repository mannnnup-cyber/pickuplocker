import { NextRequest, NextResponse } from 'next/server';
import { 
  getBoxListWithCredentials, 
  getDeviceStatusWithCredentials, 
  getDoorStatusWithCredentials, 
  getBoxLogWithCredentials, 
  getDeviceListWithCredentials, 
  debugDeviceAndBox,
  setWebhookWithCredentials,
  setSaveOrderWithCredentials,
  getStorableBoxDoorsWithCredentials,
  getBoxUsedInfoWithCredentials,
  getBoxSaveOrderInfoWithCredentials,
  deleteOrderByOrderNoWithCredentials,
  type BestwondCredentials,
  type WebhookSettings,
} from '@/lib/bestwond';
import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';
import { db } from '@/lib/db';

// Get device ID (cuid) from Bestwond device number
async function getDeviceByBestwondId(bestwondDeviceId: string) {
  return await db.device.findFirst({
    where: { deviceId: bestwondDeviceId },
    select: { id: true, deviceId: true, bestwondAppId: true, bestwondAppSecret: true }
  });
}

// Get credentials for a device
async function getCredentials(bestwondDeviceId: string): Promise<BestwondCredentials> {
  const device = await getDeviceByBestwondId(bestwondDeviceId);
  
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

// POST /api/lockers/open-box - Open a specific box
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, deviceId, boxNo } = body;

    console.log('Locker API request:', { action, deviceId, boxNo });

    // Handle different actions
    if (action === 'open') {
      if (!deviceId || !boxNo) {
        return NextResponse.json({
          success: false,
          error: 'Device ID and box number are required',
        }, { status: 400 });
      }

      // Get device-specific credentials (for validation only — DoorOperationService handles the actual call)
      const credentials = await getCredentials(deviceId);
      
      if (!credentials.appId || !credentials.appSecret) {
        return NextResponse.json({
          success: false,
          error: 'API credentials not configured for this device. Please add Bestwond credentials in device settings.',
        }, { status: 401 });
      }
      
      // Use DoorOperationService for all physical door operations
      const requestId = `lockers-open-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const doorResult = await executeDoorOperation({
        orderId: `admin-locker-${deviceId}`,
        orderNo: `ADMIN-LOCKER-OPEN`,
        deviceId: deviceId,
        deviceNumber: deviceId,
        boxNumber: Number(boxNo),
        action: 'admin-open',
        requestId,
      });
      
      console.log('Open box result:', doorResult);
      
      if (doorResult.success && doorResult.confirmed) {
        return NextResponse.json({
          success: true,
          message: doorResult.message,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: doorResult.message,
        }, { status: 400 });
      }
    }
    
    if (action === 'door-status') {
      if (!deviceId) {
        return NextResponse.json({
          success: false,
          error: 'Device ID is required',
        }, { status: 400 });
      }

      const { lockAddress } = body;
      if (!lockAddress) {
        return NextResponse.json({
          success: false,
          error: 'Lock address is required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getDoorStatusWithCredentials(deviceId, lockAddress, credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          data: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get door status',
          code: result.code,
        }, { status: 400 });
      }
    }

    if (action === 'status') {
      if (!deviceId) {
        return NextResponse.json({
          success: false,
          error: 'Device ID is required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getDeviceStatusWithCredentials(deviceId, credentials);
      
      // Bestwond returns code 0 for success (not 200)
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          data: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get device status',
          code: result.code,
        }, { status: 400 });
      }
    }

    if (action === 'boxes') {
      if (!deviceId) {
        return NextResponse.json({
          success: false,
          error: 'Device ID is required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getBoxListWithCredentials(deviceId, credentials);
      
      // Bestwond returns code 0 for success (not 200)
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          boxes: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get box list',
          code: result.code,
        }, { status: 400 });
      }
    }
    
    if (action === 'box-log') {
      if (!deviceId) {
        return NextResponse.json({
          success: false,
          error: 'Device ID is required',
        }, { status: 400 });
      }

      const { boxNo, pageNum, pageSize } = body;
      const credentials = await getCredentials(deviceId);
      const result = await getBoxLogWithCredentials(deviceId, credentials, { 
        boxNo, 
        pageNum: pageNum || 1, 
        pageSize: pageSize || 10 
      });
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          data: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get box log',
          code: result.code,
        }, { status: 400 });
      }
    }
    
    if (action === 'device-list') {
      const credentials = await getCredentials(deviceId || '');
      
      // Use provided credentials if device not found
      const { app_id, app_secret } = body;
      if (app_id && app_secret) {
        credentials.appId = app_id;
        credentials.appSecret = app_secret;
      }
      
      const result = await getDeviceListWithCredentials(credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          devices: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get device list',
          code: result.code,
        }, { status: 400 });
      }
    }
    
    if (action === 'debug') {
      if (!deviceId || !boxNo) {
        return NextResponse.json({
          success: false,
          error: 'Device ID and box number are required for debug',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      
      // Use provided credentials if available
      const { app_id, app_secret } = body;
      if (app_id && app_secret) {
        credentials.appId = app_id;
        credentials.appSecret = app_secret;
      }
      
      const result = await debugDeviceAndBox(deviceId, Number(boxNo), credentials);
      
      return NextResponse.json({
        success: true,
        debug: result,
      });
    }

    // ============================================
    // EXPRESS STORAGE AND RETRIEVAL API ACTIONS
    // ============================================

    if (action === 'set-webhook') {
      const { save_notify_url, take_notify_url, app_id, app_secret } = body;
      
      const credentials = await getCredentials(deviceId || '');
      
      // Use provided credentials if available
      if (app_id && app_secret) {
        credentials.appId = app_id;
        credentials.appSecret = app_secret;
      }
      
      if (!credentials.appId || !credentials.appSecret) {
        return NextResponse.json({
          success: false,
          error: 'API credentials are required for setting webhook',
        }, { status: 401 });
      }
      
      const webhookSettings: WebhookSettings = {};
      if (save_notify_url) webhookSettings.save_notify_url = save_notify_url;
      if (take_notify_url) webhookSettings.take_notify_url = take_notify_url;
      
      const result = await setWebhookWithCredentials(webhookSettings, credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          message: 'Webhook URLs configured successfully',
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to set webhook',
        }, { status: 400 });
      }
    }

    if (action === 'set-save-order') {
      const { order_no, box_size } = body;
      
      if (!deviceId || !order_no || !box_size) {
        return NextResponse.json({
          success: false,
          error: 'Device ID, order number, and box size are required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      
      if (!credentials.appId || !credentials.appSecret) {
        return NextResponse.json({
          success: false,
          error: 'API credentials not configured for this device',
        }, { status: 401 });
      }
      
      const result = await setSaveOrderWithCredentials(
        deviceId, 
        order_no, 
        box_size as 'S' | 'M' | 'L' | 'XL',
        credentials
      );
      
      if (result.code === 0 && result.data) {
        return NextResponse.json({
          success: true,
          order: result.data,
          message: `Order created. Save code: ${result.data.save_code}, Pick code: ${result.data.pick_code}`,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to create save order',
        }, { status: 400 });
      }
    }

    if (action === 'express-save-take') {
      const { box_size, action_code, action_type } = body;
      
      if (!deviceId || !box_size || !action_code || !action_type) {
        return NextResponse.json({
          success: false,
          error: 'Device ID, box size, action code, and action type are required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      
      if (!credentials.appId || !credentials.appSecret) {
        return NextResponse.json({
          success: false,
          error: 'API credentials not configured for this device',
        }, { status: 401 });
      }
      
      // Use DoorOperationService for express save/take
      const requestId = `lockers-express-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const doorResult = await executeDoorOperation({
        orderId: `admin-express-${deviceId}`,
        orderNo: `ADMIN-EXPRESS-SAVE-TAKE`,
        deviceId: deviceId,
        deviceNumber: deviceId,
        boxSize: box_size as 'S' | 'M' | 'L' | 'XL',
        action: action_type === 'save' ? 'courier-dropoff' : 'pickup',
        actionCode: action_code,
        useExpressApi: true,
        requestId,
      });
      
      console.log('[Express Save/Take] DoorOperation result:', doorResult);
      
      if (doorResult.success && doorResult.confirmed) {
        return NextResponse.json({
          success: true,
          message: doorResult.message,
          doorVerified: true,
        });
      } else if (doorResult.success && !doorResult.confirmed) {
        return NextResponse.json({
          success: true,
          message: doorResult.message,
          doorVerified: false,
          warning: 'WARNING: Door may not have opened. Please verify physically.',
        });
      } else {
        return NextResponse.json({
          success: false,
          error: doorResult.message,
        }, { status: 400 });
      }
    }

    if (action === 'get-storable-boxes') {
      const { box_size } = body;
      
      if (!deviceId || !box_size) {
        return NextResponse.json({
          success: false,
          error: 'Device ID and box size are required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getStorableBoxDoorsWithCredentials(
        deviceId,
        box_size as 'S' | 'M' | 'L' | 'XL',
        credentials
      );
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          boxes: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get storable boxes',
        }, { status: 400 });
      }
    }

    if (action === 'get-used-boxes') {
      if (!deviceId) {
        return NextResponse.json({
          success: false,
          error: 'Device ID is required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getBoxUsedInfoWithCredentials(deviceId, credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          boxes: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get used boxes',
        }, { status: 400 });
      }
    }

    if (action === 'get-order-info') {
      const { order_no } = body;
      
      if (!deviceId || !order_no) {
        return NextResponse.json({
          success: false,
          error: 'Device ID and order number are required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await getBoxSaveOrderInfoWithCredentials(deviceId, order_no, credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          order: result.data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to get order info',
        }, { status: 400 });
      }
    }

    if (action === 'delete-order') {
      const { order_no } = body;
      
      if (!deviceId || !order_no) {
        return NextResponse.json({
          success: false,
          error: 'Device ID and order number are required',
        }, { status: 400 });
      }

      const credentials = await getCredentials(deviceId);
      const result = await deleteOrderByOrderNoWithCredentials(deviceId, order_no, credentials);
      
      if (result.code === 0) {
        return NextResponse.json({
          success: true,
          message: `Order ${order_no} deleted successfully`,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.msg || 'Failed to delete order',
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use "open", "door-status", "status", "boxes", "box-log", "device-list", "debug", "set-webhook", "set-save-order", "express-save-take", "get-storable-boxes", "get-used-boxes", "get-order-info", or "delete-order"',
    }, { status: 400 });

  } catch (error) {
    console.error('Locker API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/lockers - Get box list or device status with full metadata
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const requestedDeviceId = searchParams.get('deviceId');
    const action = searchParams.get('action') || 'boxes';
    
    // Use environment device ID as fallback
    const deviceId = requestedDeviceId || process.env.BESTWOND_DEVICE_ID;
    
    if (!deviceId) {
      return NextResponse.json({
        success: false,
        error: 'Device ID is required (set BESTWOND_DEVICE_ID in env or pass deviceId param)',
      }, { status: 400 });
    }

    // Get device-specific credentials
    const credentials = await getCredentials(deviceId);

    if (action === 'status') {
      // Get both device status and box list for full metadata
      const [statusResult, boxListResult] = await Promise.all([
        getDeviceStatusWithCredentials(deviceId, credentials),
        getBoxListWithCredentials(deviceId, credentials)
      ]);
      
      const latency = Date.now() - startTime;
      
      // Bestwond returns code 0 for success (not 200)
      if (statusResult.code === 0) {
        const deviceData = statusResult.data || {};
        const boxes = boxListResult.code === 0 ? (boxListResult.data || []) : [];
        
        // Bestwond uses order_no to determine if box is occupied
        const emptyBoxes = boxes.filter((b: { order_no: string | null }) => b.order_no === null).length;
        const usedBoxes = boxes.filter((b: { order_no: string | null }) => b.order_no !== null).length;
        
        // Bestwond returns status: "on" or "off" (not boolean)
        const isOnline = deviceData.status === 'on' || deviceData.online === true || deviceData.online === 1;
        
        return NextResponse.json({
          success: true,
          data: {
            deviceId: deviceId,
            online: isOnline,
            totalBoxes: boxes.length || deviceData.box_count || 0,
            emptyBoxes,
            usedBoxes,
            boxes: boxes.map((b: { 
              box_name: string; 
              order_no: string | null; 
              box_size?: string;
            }) => ({
              boxNo: parseInt(b.box_name, 10),
              status: b.order_no ? 'USED' : 'EMPTY',
              size: b.box_size,
            })),
          },
          latency,
        });
      } else {
        return NextResponse.json({
          success: false,
          data: null,
          error: statusResult.msg || 'Failed to get device status',
          latency,
        });
      }
    }

    if (action === 'boxes') {
      const result = await getBoxListWithCredentials(deviceId, credentials);
      const latency = Date.now() - startTime;
      
      // Bestwond returns code 0 for success (not 200)
      return NextResponse.json({
        success: result.code === 0,
        boxes: result.data,
        error: result.msg,
        latency,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use "status" or "boxes"',
    }, { status: 400 });

  } catch (error) {
    console.error('Locker API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
