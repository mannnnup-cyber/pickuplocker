// Bestwond Locker API Integration
// Documentation: https://bestwond.apifox.cn/
// Access password: VdR72BxK

import crypto from 'crypto';

// Credentials for API calls
export interface BestwondCredentials {
  appId: string;
  appSecret: string;
  baseUrl?: string;
}

interface BestwondConfig {
  appId: string;
  appSecret: string;
  deviceId: string;
  baseUrl: string;
}

// Generate Unix timestamp in seconds (as required by Bestwond API)
export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Generate SHA512 signature for Bestwond API
// Signature = SHA512(sorted_url_encoded_params + app_secret)
export async function generateSignature(params: Record<string, string | number>, appSecret: string): Promise<string> {
  // Sort parameters alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  
  // Build URL-encoded string
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  // Append app secret
  const stringToSign = `${encodedParams}${appSecret}`;
  
  // SHA512 hash
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get configuration from environment (sync version for backward compatibility)
export function getConfig(): BestwondConfig {
  return {
    appId: process.env.BESTWOND_APP_ID || '',
    appSecret: process.env.BESTWOND_APP_SECRET || '',
    deviceId: process.env.BESTWOND_DEVICE_ID || '',
    baseUrl: process.env.BESTWOND_BASE_URL || 'https://api.bestwond.com',
  };
}

// Get configuration from database with env fallback (async version)
export async function getConfigAsync(): Promise<BestwondConfig> {
  try {
    const { getSetting } = await import('./settings');
    const [appId, appSecret, deviceId, baseUrl] = await Promise.all([
      getSetting('bestwond_appId', 'BESTWOND_APP_ID'),
      getSetting('bestwond_appSecret', 'BESTWOND_APP_SECRET'),
      getSetting('bestwond_deviceId', 'BESTWOND_DEVICE_ID'),
      getSetting('bestwond_baseUrl', 'BESTWOND_BASE_URL'),
    ]);
    
    return {
      appId,
      appSecret,
      deviceId,
      baseUrl: baseUrl || 'https://api.bestwond.com',
    };
  } catch (error) {
    console.error('Failed to load config from database, using env:', error);
    return getConfig();
  }
}

// Get credentials for a specific device (with fallback to global settings)
export async function getCredentialsForDevice(deviceId: string): Promise<BestwondCredentials> {
  try {
    const { db } = await import('./db');
    
    // Get device-specific credentials
    const device = await db.device.findUnique({
      where: { id: deviceId },
      select: { bestwondAppId: true, bestwondAppSecret: true }
    });
    
    // If device has its own credentials, use them
    if (device?.bestwondAppId && device?.bestwondAppSecret) {
      return {
        appId: device.bestwondAppId,
        appSecret: device.bestwondAppSecret,
        baseUrl: 'https://api.bestwond.com',
      };
    }
    
    // Fallback to global settings
    const globalConfig = await getConfigAsync();
    return {
      appId: globalConfig.appId,
      appSecret: globalConfig.appSecret,
      baseUrl: globalConfig.baseUrl,
    };
  } catch (error) {
    console.error('Failed to get device credentials:', error);
    // Fallback to global settings
    const globalConfig = await getConfigAsync();
    return {
      appId: globalConfig.appId,
      appSecret: globalConfig.appSecret,
      baseUrl: globalConfig.baseUrl,
    };
  }
}

// Verify webhook signature from Bestwond
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const config = getConfig();
  
  if (!config.appSecret) {
    console.warn('Bestwond app secret not configured, skipping webhook signature verification');
    return true; // Allow in development
  }
  
  // Bestwond signs webhooks with SHA512(payload + appSecret)
  const expectedSignature = crypto
    .createHmac('sha512', config.appSecret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
}

// API Response types
interface BestwondResponse<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

interface DeviceStatus {
  device_number: string;
  status: 'on' | 'off';  // Bestwond returns "on" or "off", not boolean
  online?: boolean;  // Some APIs might still use this
  box_count?: number;
  available_box_count?: number;
}

interface BoxInfo {
  box_name: string;  // e.g., "01", "02"
  box_status: number;
  enable_status: number;
  order_no: string | null;  // null = available, has value = occupied
  box_size: string;  // S, M, L, XL
  lock_address: string;
}

// ============================================
// NEW: Functions that accept credentials as parameter
// ============================================

// Open a specific box on a device (with explicit credentials)
export async function openBoxWithCredentials(
  deviceNumber: string, 
  boxNo: number, 
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  // Default lock_address format: "01" + box number in lowercase HEX (2 chars)
  // Based on Bestwond API docs: box 1 → "0101", box 10 → "010a", box 12 → "010c"
  const boxHex = boxNo.toString(16).toLowerCase().padStart(2, '0');
  const defaultLockAddress = `01${boxHex}`; // e.g., "0101", "010a", "010c"
  
  // First, try to get box list to find the correct lock_address
  console.log('=== OPEN BOX DEBUG ===');
  console.log('Device Number:', deviceNumber);
  console.log('Box Number:', boxNo);
  console.log('Default lock_address (HEX format):', defaultLockAddress);
  
  const boxListResult = await getBoxListWithCredentials(deviceNumber, credentials);
  console.log('Box List Result:', JSON.stringify(boxListResult, null, 2));
  
  let lockAddress = defaultLockAddress; // use correct HEX format as default
  
  if (boxListResult.code === 0 && boxListResult.data) {
    const boxes = boxListResult.data as Array<{ 
      box_name: string; 
      lock_address?: string;
    }>;
    console.log('Total boxes found:', boxes.length);
    console.log('Looking for box:', boxNo);
    
    const box = boxes.find(b => parseInt(b.box_name, 10) === boxNo);
    if (box && box.lock_address) {
      lockAddress = box.lock_address;
      console.log(`Found lock_address "${lockAddress}" for box ${boxNo} from box list`);
    } else {
      console.log(`Box ${boxNo} not found in box list, using HEX format: ${lockAddress}`);
    }
  } else {
    console.log('Could not fetch box list, using default lock_address:', lockAddress, 'Error:', boxListResult.msg);
  }
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    lock_address: lockAddress,
    use_type: 'S', // S = Single open
  };
  
  console.log('Request params:', { 
    ...params, 
    app_id: credentials.appId.substring(0, 8) + '...' 
  });
  
  const signature = await generateSignature(params, credentials.appSecret);
  console.log('Signature:', signature.substring(0, 20) + '...');
  console.log('=== END OPEN BOX DEBUG ===');
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/open/box/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Open box API response:', data);
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond openBox error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to open box' };
  }
}

// Get door status (open/closed) for a specific box
export async function getDoorStatusWithCredentials(
  deviceNumber: string,
  lockAddress: string,
  credentials: BestwondCredentials
): Promise<BestwondResponse<{ status: string; door_open?: boolean }>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    lock_address: lockAddress,
  };
  
  console.log('=== DOOR STATUS CHECK ===');
  console.log('Device:', deviceNumber, 'Lock Address:', lockAddress);
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/device/box/status/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Door status API response:', data);
    console.log('=== END DOOR STATUS CHECK ===');
    return data as BestwondResponse<{ status: string; door_open?: boolean }>;
  } catch (error) {
    console.error('Bestwond getDoorStatus error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get door status' };
  }
}

// Open box and verify door actually opened
export async function openBoxAndVerify(
  deviceNumber: string,
  boxNo: number,
  credentials: BestwondCredentials,
  maxRetries: number = 3
): Promise<{ success: boolean; message: string; doorStatus?: string; apiResponse?: BestwondResponse }> {
  // First, check if device is online
  const statusResult = await getDeviceStatusWithCredentials(deviceNumber, credentials);
  if (statusResult.code !== 0) {
    return { 
      success: false, 
      message: `Cannot reach device. API error: ${statusResult.msg || 'Unknown error'}` 
    };
  }
  
  const deviceData = statusResult.data;
  const isOnline = deviceData?.status === 'on' || deviceData?.online === true;
  
  if (!isOnline) {
    return { 
      success: false, 
      message: `Device ${deviceNumber} is OFFLINE. Please check power and network connection.` 
    };
  }
  
  // Get the lock_address for this box
  const boxListResult = await getBoxListWithCredentials(deviceNumber, credentials);
  let lockAddress = `01${boxNo.toString(16).toLowerCase().padStart(2, '0')}`; // HEX format
  
  if (boxListResult.code === 0 && boxListResult.data) {
    const box = boxListResult.data.find(b => parseInt(b.box_name, 10) === boxNo);
    if (box?.lock_address) {
      lockAddress = box.lock_address;
    }
  }
  
  // Try to open the box
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Open box attempt ${attempt}/${maxRetries}`);
    
    const openResult = await openBoxWithCredentials(deviceNumber, boxNo, credentials);
    
    // Check both API response code AND device status
    const resultData = openResult.data as { status?: string; msg?: string } | undefined;
    const deviceStatus = resultData?.status;
    const deviceMsg = resultData?.msg;
    
    if (openResult.code === 0 && deviceStatus === 'success') {
      // API and device both say success - wait and check door
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const doorStatus = await getDoorStatusWithCredentials(deviceNumber, lockAddress, credentials);
      
      return {
        success: true,
        message: `Box #${boxNo} opened successfully.`,
        doorStatus: doorStatus.data?.status,
        apiResponse: openResult
      };
    }
    
    // Check for specific device errors
    if (deviceStatus === 'fail') {
      // Device rejected the command - no point retrying
      if (deviceMsg?.includes('uqkey') || deviceMsg?.includes('key')) {
        return {
          success: false,
          message: `❌ DEVICE NOT LINKED: This device is not registered to your app account. Contact Bestwond support to link device ${deviceNumber} to app ${credentials.appId}. Error: ${deviceMsg}`,
          apiResponse: openResult
        };
      }
      
      if (deviceMsg?.includes('offline') || deviceMsg?.includes('not online')) {
        return {
          success: false,
          message: `❌ DEVICE OFFLINE: Device ${deviceNumber} is not connected. Check power and network.`,
          apiResponse: openResult
        };
      }
      
      // Other device error
      lastError = deviceMsg || 'Device rejected command';
    } else {
      lastError = openResult.msg || `Error code: ${openResult.code}`;
    }
    
    console.log(`Attempt ${attempt} failed:`, lastError);
    
    // Wait before retry
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    success: false,
    message: `Failed to open box after ${maxRetries} attempts. Last error: ${lastError}`
  };
}

// Get device online status (with explicit credentials)
export async function getDeviceStatusWithCredentials(
  deviceNumber: string, 
  credentials: BestwondCredentials
): Promise<BestwondResponse<DeviceStatus>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/device/line/status/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse<DeviceStatus>;
  } catch (error) {
    console.error('Bestwond getDeviceStatus error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get device status' };
  }
}

// Get list of boxes for a device (with explicit credentials)
export async function getBoxListWithCredentials(
  deviceNumber: string, 
  credentials: BestwondCredentials
): Promise<BestwondResponse<BoxInfo[]>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/device/box/list/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse<BoxInfo[]>;
  } catch (error) {
    console.error('Bestwond getBoxList error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get box list' };
  }
}

// Get list of all devices (with explicit credentials)
export async function getDeviceListWithCredentials(
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/device/list/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond getDeviceList error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get device list' };
  }
}

// Get box log with explicit credentials
export async function getBoxLogWithCredentials(
  deviceNumber: string,
  credentials: BestwondCredentials,
  options?: { boxNo?: number; pageNum?: number; pageSize?: number }
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    page_num: options?.pageNum || 1,
    page_size: options?.pageSize || 20,
  };
  
  if (options?.boxNo) {
    params.box_name = String(options.boxNo).padStart(2, '0');
  }
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  console.log('=== BOX LOG DEBUG ===');
  console.log('Device:', deviceNumber);
  console.log('Box:', options?.boxNo || 'all');
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/device/box/log/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Box log response:', JSON.stringify(data, null, 2));
    console.log('=== END BOX LOG DEBUG ===');
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond getBoxLog error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get box log' };
  }
}

// Comprehensive debug function for troubleshooting
export async function debugDeviceAndBox(
  deviceNumber: string,
  boxNo: number,
  credentials: BestwondCredentials
): Promise<{
  deviceStatus: BestwondResponse;
  boxList: BestwondResponse;
  deviceList: BestwondResponse;
  boxLog: BestwondResponse;
  openResult: BestwondResponse;
  doorStatus: BestwondResponse;
}> {
  console.log('====== COMPREHENSIVE DEBUG ======');
  console.log('Device:', deviceNumber, 'Box:', boxNo);
  console.log('Credentials:', credentials.appId?.substring(0, 10) + '...');
  
  // Run all checks in parallel where possible
  const [deviceStatus, boxList, deviceList] = await Promise.all([
    getDeviceStatusWithCredentials(deviceNumber, credentials),
    getBoxListWithCredentials(deviceNumber, credentials),
    getDeviceListWithCredentials(credentials),
  ]);
  
  // Get box log
  const boxLog = await getBoxLogWithCredentials(deviceNumber, credentials, { boxNo, pageSize: 5 });
  
  // Try to open the box
  const openResult = await openBoxWithCredentials(deviceNumber, boxNo, credentials);
  
  // Wait a moment then check door status
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get lock address from box list
  let lockAddress = `01${boxNo.toString(16).toLowerCase().padStart(2, '0')}`;
  if (boxList.code === 0 && boxList.data) {
    const box = (boxList.data as BoxInfo[]).find(b => parseInt(b.box_name, 10) === boxNo);
    if (box?.lock_address) {
      lockAddress = box.lock_address;
    }
  }
  
  const doorStatus = await getDoorStatusWithCredentials(deviceNumber, lockAddress, credentials);
  
  // Get updated box log after open attempt
  const updatedBoxLog = await getBoxLogWithCredentials(deviceNumber, credentials, { boxNo, pageSize: 5 });
  
  console.log('====== END DEBUG ======');
  
  return {
    deviceStatus,
    boxList,
    deviceList,
    boxLog: updatedBoxLog,
    openResult,
    doorStatus,
  };
}

// ============================================
// LEGACY: Functions that use global settings (for backward compatibility)
// ============================================

// Open a specific box on a device
export async function openBox(deviceNumber: string, boxNo: number): Promise<BestwondResponse> {
  const config = await getConfigAsync();
  return openBoxWithCredentials(deviceNumber, boxNo, config);
}

// Get device online status
export async function getDeviceStatus(deviceNumber: string): Promise<BestwondResponse<DeviceStatus>> {
  const config = await getConfigAsync();
  return getDeviceStatusWithCredentials(deviceNumber, config);
}

// Get list of boxes for a device
export async function getBoxList(deviceNumber: string): Promise<BestwondResponse<BoxInfo[]>> {
  const config = await getConfigAsync();
  return getBoxListWithCredentials(deviceNumber, config);
}

// Get list of all devices
export async function getDeviceList(): Promise<BestwondResponse> {
  const config = await getConfigAsync();
  return getDeviceListWithCredentials(config);
}

// Get box usage log
export async function getBoxLog(deviceNumber: string, options?: { boxNo?: number; startTime?: string; endTime?: string }): Promise<BestwondResponse> {
  const config = await getConfigAsync();
  
  if (!config.appId || !config.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const params: Record<string, string | number> = {
    app_id: config.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
  };
  
  if (options?.boxNo) params.box_no = options.boxNo;
  if (options?.startTime) params.start_time = options.startTime;
  if (options?.endTime) params.end_time = options.endTime;
  
  const signature = await generateSignature(params, config.appSecret);
  
  try {
    const response = await fetch(`${config.baseUrl}/api/iot/device/box/log/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond getBoxLog error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get box log' };
  }
}

// ============================================
// EXPRESS STORAGE AND RETRIEVAL API
// ============================================

export interface ExpressOrderResult {
  id?: number;
  device_number: string;
  order_no: string;
  box_name?: string;
  box_size: string;
  save_code: string;      // 6-digit code for courier to store
  pick_code: string;      // 6-digit code for recipient to pick up
  status: string;
  msg?: string;
  save_time?: string;
  pick_time?: string;
}

export interface WebhookSettings {
  save_notify_url?: string;
  take_notify_url?: string;
}

// Set webhook URLs for save/take notifications
export async function setWebhookWithCredentials(
  webhookSettings: WebhookSettings,
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
  };
  
  if (webhookSettings.save_notify_url) {
    params.save_notify_url = webhookSettings.save_notify_url;
  }
  if (webhookSettings.take_notify_url) {
    params.take_notify_url = webhookSettings.take_notify_url;
  }
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  console.log('=== SET WEBHOOK ===');
  console.log('Save URL:', webhookSettings.save_notify_url);
  console.log('Take URL:', webhookSettings.take_notify_url);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/set/app/webhook/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Set webhook response:', data);
    console.log('=== END SET WEBHOOK ===');
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond setWebhook error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to set webhook' };
  }
}

// Create an order for storage (courier will use save_code to store)
export async function setSaveOrderWithCredentials(
  deviceNumber: string,
  orderNo: string,
  boxSize: 'S' | 'M' | 'L' | 'XL',
  credentials: BestwondCredentials
): Promise<BestwondResponse<ExpressOrderResult>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    order_no: orderNo,
    box_size: boxSize,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  console.log('=== SET SAVE ORDER ===');
  console.log('Device:', deviceNumber, 'Order:', orderNo, 'Size:', boxSize);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/set/save/order/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Set save order response:', JSON.stringify(data, null, 2));
    console.log('=== END SET SAVE ORDER ===');
    return data as BestwondResponse<ExpressOrderResult>;
  } catch (error) {
    console.error('Bestwond setSaveOrder error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to set save order' };
  }
}

// Express storage or retrieval - open box using action code
// action_type: "save" = courier storing, "take" = recipient picking up
// action_code: save_code or pick_code from setSaveOrder
export async function expressSaveOrTakeWithCredentials(
  deviceNumber: string,
  boxSize: 'S' | 'M' | 'L' | 'XL',
  actionCode: string,
  actionType: 'save' | 'take',
  credentials: BestwondCredentials
): Promise<BestwondResponse<ExpressOrderResult>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    box_size: boxSize,
    action_code: actionCode,
    action_type: actionType,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  console.log('=== EXPRESS SAVE/TAKE ===');
  console.log('Device:', deviceNumber);
  console.log('Action:', actionType);
  console.log('Code:', actionCode);
  console.log('Box Size:', boxSize);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/order/save/or/take/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Express save/take response:', JSON.stringify(data, null, 2));
    console.log('=== END EXPRESS SAVE/TAKE ===');
    return data as BestwondResponse<ExpressOrderResult>;
  } catch (error) {
    console.error('Bestwond expressSaveOrTake error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to save/take' };
  }
}

// Get device box doors that can be stored (available boxes by size)
export async function getStorableBoxDoorsWithCredentials(
  deviceNumber: string,
  boxSize: 'S' | 'M' | 'L' | 'XL',
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    box_size: boxSize,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/device/box/doors/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond getStorableBoxDoors error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get storable boxes' };
  }
}

// Get device box used info (boxes currently in use)
export async function getBoxUsedInfoWithCredentials(
  deviceNumber: string,
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/device/box/used/info/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond getBoxUsedInfo error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get box used info' };
  }
}

// Get device box save order info
export async function getBoxSaveOrderInfoWithCredentials(
  deviceNumber: string,
  orderNo: string,
  credentials: BestwondCredentials
): Promise<BestwondResponse<ExpressOrderResult>> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    order_no: orderNo,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/get/order/info/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse<ExpressOrderResult>;
  } catch (error) {
    console.error('Bestwond getBoxSaveOrderInfo error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to get order info' };
  }
}

// Delete order by order number
export async function deleteOrderByOrderNoWithCredentials(
  deviceNumber: string,
  orderNo: string,
  credentials: BestwondCredentials
): Promise<BestwondResponse> {
  if (!credentials.appId || !credentials.appSecret) {
    return { code: 401, msg: 'Bestwond API credentials not configured' };
  }
  
  const baseUrl = credentials.baseUrl || 'https://api.bestwond.com';
  
  const params: Record<string, string | number> = {
    app_id: credentials.appId,
    timestamps: getTimestamp(),
    device_number: deviceNumber,
    order_no: orderNo,
  };
  
  const signature = await generateSignature(params, credentials.appSecret);
  
  try {
    const response = await fetch(`${baseUrl}/api/iot/kd/delete/order/no/?sign=${signature}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    return data as BestwondResponse;
  } catch (error) {
    console.error('Bestwond deleteOrder error:', error);
    return { code: 500, msg: error instanceof Error ? error.message : 'Failed to delete order' };
  }
}

// Legacy wrappers for backward compatibility
export async function setWebhook(webhookSettings: WebhookSettings): Promise<BestwondResponse> {
  const config = await getConfigAsync();
  return setWebhookWithCredentials(webhookSettings, config);
}

export async function setSaveOrder(
  deviceNumber: string,
  orderNo: string,
  boxSize: 'S' | 'M' | 'L' | 'XL'
): Promise<BestwondResponse<ExpressOrderResult>> {
  const config = await getConfigAsync();
  return setSaveOrderWithCredentials(deviceNumber, orderNo, boxSize, config);
}

export async function expressSaveOrTake(
  deviceNumber: string,
  boxSize: 'S' | 'M' | 'L' | 'XL',
  actionCode: string,
  actionType: 'save' | 'take'
): Promise<BestwondResponse<ExpressOrderResult>> {
  const config = await getConfigAsync();
  return expressSaveOrTakeWithCredentials(deviceNumber, boxSize, actionCode, actionType, config);
}
