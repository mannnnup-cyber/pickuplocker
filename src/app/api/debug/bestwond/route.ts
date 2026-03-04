import { NextResponse } from 'next/server';
import { getDeviceList, getDeviceStatus, getBoxList, getTimestamp, generateSignature, getConfigAsync } from '@/lib/bestwond';

// Debug endpoint to see all Bestwond devices and API responses
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    // 0. Check configuration
    const config = await getConfigAsync();
    results.config = {
      hasAppId: !!config.appId,
      appIdLength: config.appId?.length || 0,
      appIdValue: config.appId || null,
      hasAppSecret: !!config.appSecret,
      appSecretLength: config.appSecret?.length || 0,
      baseUrl: config.baseUrl,
      deviceId: config.deviceId,
    };

    // Test timestamp format (should be Unix seconds)
    const testTimestamp = getTimestamp();
    results.testTimestamp = testTimestamp;
    results.testTimestampType = typeof testTimestamp;

    // Test signature generation with correct param names
    const testParams: Record<string, string | number> = {
      app_id: config.appId || 'test',
      timestamps: testTimestamp,
    };
    const testSignature = await generateSignature(testParams, config.appSecret || '');
    results.testSignature = {
      params: testParams,
      signature: testSignature,
      signatureLength: testSignature.length,
    };

    // 1. Get device list
    const deviceListResult = await getDeviceList();
    results.deviceList = {
      code: deviceListResult.code,
      msg: deviceListResult.msg,
      data: deviceListResult.data,
      isArray: Array.isArray(deviceListResult.data),
    };

    // 2. If devices found, analyze structure and test each
    // Bestwond returns code 0 for success (not 200)
    if (deviceListResult.code === 0 && Array.isArray(deviceListResult.data)) {
      const devices = deviceListResult.data as Array<Record<string, unknown>>;
      results.deviceCount = devices.length;
      
      // Show structure of first device
      if (devices.length > 0) {
        results.firstDeviceStructure = {
          keys: Object.keys(devices[0]),
          sample: devices[0],
        };

        // Test API calls with each possible ID field
        const testResults = [];
        for (const device of devices) {
          const idFields = ['device_number', 'deviceNumber', 'deviceId', 'device_id', 'id', 'deviceUid', 'device_uid', 'uid'];
          
          for (const idField of idFields) {
            if (device[idField] !== undefined) {
              const testId = String(device[idField]);
              
              try {
                const statusResult = await getDeviceStatus(testId);
                const boxListResult = await getBoxList(testId);
                
                testResults.push({
                  deviceName: device.name || device.deviceName || 'Unknown',
                  idField,
                  idValue: testId,
                  statusCode: statusResult.code,
                  statusMsg: statusResult.msg,
                  statusOnline: (statusResult.data as {online?: boolean})?.online,
                  boxListCode: boxListResult.code,
                  boxListMsg: boxListResult.msg,
                  boxCount: Array.isArray(boxListResult.data) ? boxListResult.data.length : 0,
                  success: statusResult.code === 0 || boxListResult.code === 0,
                });
              } catch (e) {
                testResults.push({
                  deviceName: device.name || device.deviceName || 'Unknown',
                  idField,
                  idValue: testId,
                  error: e instanceof Error ? e.message : 'API call failed',
                });
              }
              break; // Only test first valid ID field per device
            }
          }
        }
        
        results.testResults = testResults;
        results.workingDevices = testResults.filter(t => t.success);
      }
    }

  } catch (error) {
    results.error = error instanceof Error ? error.message : 'Unknown error';
    results.stack = error instanceof Error ? error.stack : undefined;
  }

  return NextResponse.json(results, { status: 200 });
}
