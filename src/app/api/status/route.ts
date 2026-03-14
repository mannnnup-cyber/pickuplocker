import { NextResponse } from 'next/server';
import { getDeviceStatus, getBoxList } from '@/lib/bestwond';
import { getBestwondConfig, getTextbeeConfig, getDimepayConfig, getEmailConfig, clearSettingsCache } from '@/lib/settings';
import { verifyEmailConfig } from '@/lib/email';

interface StatusResult {
  name: string;
  status: 'online' | 'offline' | 'warning' | 'unknown';
  message: string;
  latency?: number;
  details?: Record<string, unknown>;
}

export async function GET() {
  const results: StatusResult[] = [];
  const startTime = Date.now();

  // 1. Database Connection Status
  try {
    const dbStart = Date.now();
    const { db } = await import('@/lib/db');
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    const userCount = await db.user.count();
    const deviceCount = await db.device.count();
    const orderCount = await db.order.count();

    results.push({
      name: 'Database',
      status: 'online',
      message: 'SQLite database connected',
      latency: dbLatency,
      details: {
        provider: 'SQLite',
        users: userCount,
        devices: deviceCount,
        orders: orderCount
      }
    });
  } catch (error) {
    results.push({
      name: 'Database',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Connection failed',
      details: { provider: 'SQLite', error: true }
    });
  }

  // 2. Bestwond Locker API Status
  try {
    const bestwondConfig = await getBestwondConfig();
    const bestwondStart = Date.now();

    if (bestwondConfig.appId && bestwondConfig.appSecret && bestwondConfig.deviceId) {
      // Get device online status
      const statusResult = await getDeviceStatus(bestwondConfig.deviceId);
      const bestwondLatency = Date.now() - bestwondStart;

      if (statusResult.code === 200 && statusResult.data) {
        const deviceData = statusResult.data;
        const isOnline = deviceData.online === true || deviceData.online === 1;

        results.push({
          name: 'Bestwond Lockers',
          status: isOnline ? 'online' : 'warning',
          message: isOnline
            ? `Device ${bestwondConfig.deviceId} online`
            : `Device ${bestwondConfig.deviceId} offline`,
          latency: bestwondLatency,
          details: {
            device_id: bestwondConfig.deviceId,
            online: isOnline,
            box_count: deviceData.boxCount,
            available_boxes: deviceData.availableBoxCount,
            source: 'database'
          }
        });

        // Also get box list for more details
        try {
          const boxListResult = await getBoxList(bestwondConfig.deviceId);
          if (boxListResult.code === 200 && boxListResult.data) {
            const boxes = boxListResult.data;
            const emptyBoxes = boxes.filter(b => b.status === 'EMPTY').length;
            const usedBoxes = boxes.filter(b => b.status === 'USED').length;

            results[results.length - 1].details = {
              ...results[results.length - 1].details,
              empty_boxes: emptyBoxes,
              used_boxes: usedBoxes,
              total_boxes: boxes.length,
              box_preview: boxes.slice(0, 6)
            };
          }
        } catch (boxError) {
          console.error('Failed to get box list:', boxError);
        }
      } else {
        // API returned an error
        const errorMsg = statusResult.msg || `Error code: ${statusResult.code}`;
        results.push({
          name: 'Bestwond Lockers',
          status: 'warning',
          message: errorMsg,
          latency: bestwondLatency,
          details: {
            device_id: bestwondConfig.deviceId,
            code: statusResult.code,
            raw_message: statusResult.msg,
            error: true,
            source: 'database',
            troubleshooting: [
              'Verify App ID and App Secret are correct',
              'Confirm Device ID matches your locker',
              'Check if account needs activation',
              'Verify IP whitelisting in Bestwond dashboard'
            ]
          }
        });
      }
    } else {
      results.push({
        name: 'Bestwond Lockers',
        status: 'warning',
        message: 'API credentials not configured',
        details: {
          app_id: bestwondConfig.appId ? 'Set' : 'Not set',
          app_secret: bestwondConfig.appSecret ? 'Set' : 'Not set',
          device_id: bestwondConfig.deviceId || 'Not set',
          source: 'database'
        }
      });
    }
  } catch (error) {
    results.push({
      name: 'Bestwond Lockers',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Connection failed',
      details: { error: true }
    });
  }

  // 3. TextBee SMS Gateway Status
  try {
    // Clear cache to get fresh settings
    clearSettingsCache();
    
    const textbeeConfig = await getTextbeeConfig();
    const textbeeStart = Date.now();

    if (textbeeConfig.apiKey && textbeeConfig.deviceId) {
      // List devices from TextBee API
      const response = await fetch(`https://api.textbee.dev/api/v1/gateway/devices`, {
        method: 'GET',
        headers: { 'x-api-key': textbeeConfig.apiKey },
      });
      const textbeeLatency = Date.now() - textbeeStart;

      if (response.ok) {
        const data = await response.json();
        const devices = data.data || [];
        
        // Find our device by _id
        const ourDevice = devices.find((d: { _id: string }) => d._id === textbeeConfig.deviceId);
        
        if (ourDevice) {
          // Device is considered online if:
          // 1. Device exists and is enabled
          // 2. OR has recent activity (within 2 hours)
          // TextBee queues SMS anyway, so even if phone sleeps, messages will be delivered
          const isEnabled = ourDevice.enabled === true;
          const lastUpdate = new Date(ourDevice.updatedAt).getTime();
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
          const hasRecentActivity = lastUpdate > twoHoursAgo;
          const isOnline = isEnabled || hasRecentActivity;

          results.push({
            name: 'TextBee SMS',
            status: isOnline ? 'online' : 'warning',
            message: isOnline
              ? `Phone connected (${ourDevice.brand} ${ourDevice.model})`
              : 'Phone not connected to TextBee app',
            latency: textbeeLatency,
            details: {
              device_id: textbeeConfig.deviceId,
              online: isOnline,
              enabled: ourDevice.enabled,
              brand: ourDevice.brand,
              model: ourDevice.model,
              sent_sms: ourDevice.sentSMSCount,
              received_sms: ourDevice.receivedSMSCount,
              last_update: ourDevice.updatedAt,
              source: 'database'
            }
          });
        } else {
          results.push({
            name: 'TextBee SMS',
            status: 'warning',
            message: 'Device ID not found in TextBee account',
            latency: textbeeLatency,
            details: {
              device_id: textbeeConfig.deviceId,
              total_devices: devices.length,
              source: 'database'
            }
          });
        }
      } else if (response.status === 401) {
        results.push({
          name: 'TextBee SMS',
          status: 'offline',
          message: 'Invalid API Key (401)',
          latency: textbeeLatency,
          details: {
            device_id: textbeeConfig.deviceId,
            status: 401,
            error: 'Unauthorized - API key rejected',
            source: 'database',
            troubleshooting: [
              'Verify your API Key in TextBee dashboard',
              'API keys can expire - regenerate if needed',
              'Check if your TextBee account is active'
            ]
          }
        });
      } else {
        const errorText = await response.text();
        results.push({
          name: 'TextBee SMS',
          status: 'warning',
          message: `API error: ${response.status}`,
          latency: textbeeLatency,
          details: {
            device_id: textbeeConfig.deviceId,
            status: response.status,
            error: errorText,
            source: 'database'
          }
        });
      }
    } else {
      results.push({
        name: 'TextBee SMS',
        status: 'warning',
        message: 'Not configured',
        details: {
          api_key: textbeeConfig.apiKey ? 'Set' : 'Not set',
          device_id: textbeeConfig.deviceId || 'Not set',
          source: 'database'
        }
      });
    }
  } catch (error) {
    results.push({
      name: 'TextBee SMS',
      status: 'warning',
      message: error instanceof Error ? error.message : 'SMS gateway error',
      details: { error: true }
    });
  }

  // 4. DimePay Payment Gateway Status
  try {
    const dimepayConfig = await getDimepayConfig();
    const dimepayStart = Date.now();
    
    if (dimepayConfig.apiKey && dimepayConfig.merchantId) {
      // Test connection by trying to verify the API endpoint
      let apiTestPassed = false;
      let testMessage = 'Payment gateway configured';
      let testDetails: Record<string, unknown> = {
        merchant_id: dimepayConfig.merchantId,
        api_key_set: !!dimepayConfig.apiKey,
        base_url: dimepayConfig.baseUrl,
        sandbox_mode: dimepayConfig.sandboxMode,
        fee_percentage: dimepayConfig.feePercentage,
        fixed_fee: dimepayConfig.fixedFee,
        pass_fee_to_customer: dimepayConfig.passFeeToCustomer,
        pass_fee_to_courier: dimepayConfig.passFeeToCourier,
        source: 'database'
      };
      
      try {
        // Try to hit a health/status endpoint or the payments endpoint
        const testResponse = await fetch(`${dimepayConfig.baseUrl}/payments?limit=1`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${dimepayConfig.apiKey}`,
            'X-Merchant-ID': dimepayConfig.merchantId,
          },
        });
        
        if (testResponse.ok) {
          apiTestPassed = true;
          testMessage = 'API connection verified';
        } else if (testResponse.status === 401) {
          testMessage = 'Invalid API credentials (401)';
          testDetails['troubleshooting'] = [
            'Verify your API Key is correct',
            'Check if API key has expired',
            'Ensure API key has the right permissions'
          ];
        } else if (testResponse.status === 403) {
          testMessage = 'Access forbidden - check merchant ID';
          testDetails['troubleshooting'] = [
            'Verify Merchant ID matches your DimePay account',
            'Check if your account is active'
          ];
        } else if (testResponse.status === 404) {
          // 404 might mean the endpoint doesn't exist, but credentials could still be valid
          testMessage = 'API endpoint not found - verify Base URL';
          testDetails['troubleshooting'] = [
            'Production URL: https://api.dimepay.app/dapi/v1',
            'Sandbox URL: https://sandbox.api.dimepay.com',
            'Make sure the Base URL is correct for your environment'
          ];
        } else {
          testMessage = `API returned status ${testResponse.status}`;
        }
      } catch (fetchError) {
        testMessage = `Connection failed: ${fetchError instanceof Error ? fetchError.message : 'Network error'}`;
        testDetails['troubleshooting'] = [
          'Check if the Base URL is correct and accessible',
          'Verify network connectivity',
          'Production: https://api.dimepay.app/dapi/v1',
          'Sandbox: https://sandbox.api.dimepay.com'
        ];
      }
      
      const dimepayLatency = Date.now() - dimepayStart;
      
      results.push({
        name: 'DimePay',
        status: apiTestPassed ? 'online' : 'warning',
        message: testMessage,
        latency: dimepayLatency,
        details: testDetails
      });
    } else {
      results.push({
        name: 'DimePay',
        status: 'warning',
        message: 'Not configured',
        details: {
          merchant_id: dimepayConfig.merchantId || 'Not set',
          api_key_set: !!dimepayConfig.apiKey,
          sandbox_mode: dimepayConfig.sandboxMode,
          source: 'database',
          setup_guide: [
            '1. Get API Key from DimePay dashboard',
            '2. Get Merchant ID from your DimePay account',
            '3. Choose Production or Sandbox mode',
            '4. Save settings and test connection'
          ]
        }
      });
    }
  } catch (error) {
    results.push({
      name: 'DimePay',
      status: 'warning',
      message: error instanceof Error ? error.message : 'Configuration error',
      details: { error: true }
    });
  }

  // 5. Email Notification Status
  try {
    const emailStart = Date.now();
    const emailConfig = await getEmailConfig();
    const emailLatency = Date.now() - emailStart;

    if (emailConfig.enabled && emailConfig.user && emailConfig.password) {
      // Try to verify the connection
      const verifyResult = await verifyEmailConfig();
      
      results.push({
        name: 'Email SMTP',
        status: verifyResult.success ? 'online' : 'warning',
        message: verifyResult.success 
          ? `SMTP connected (${emailConfig.host}:${emailConfig.port})`
          : (verifyResult.error || 'Connection failed'),
        latency: emailLatency,
        details: {
          host: emailConfig.host,
          port: emailConfig.port,
          user: emailConfig.user,
          from_email: emailConfig.fromEmail,
          enabled: emailConfig.enabled,
          source: 'database'
        }
      });
    } else {
      results.push({
        name: 'Email SMTP',
        status: emailConfig.enabled ? 'warning' : 'online',
        message: emailConfig.enabled ? 'Configured but credentials incomplete' : 'Disabled (optional)',
        details: {
          host: emailConfig.host || 'Not set',
          user: emailConfig.user || 'Not set',
          password: emailConfig.password ? 'Set' : 'Not set',
          enabled: emailConfig.enabled,
          source: 'database'
        }
      });
    }
  } catch (error) {
    results.push({
      name: 'Email SMTP',
      status: 'warning',
      message: error instanceof Error ? error.message : 'Configuration error',
      details: { error: true }
    });
  }

  // Overall system status
  const hasOffline = results.some(r => r.status === 'offline');
  const hasWarning = results.some(r => r.status === 'warning');
  let overallStatus: 'online' | 'degraded' | 'offline' = 'online';
  if (hasOffline) overallStatus = 'offline';
  else if (hasWarning) overallStatus = 'degraded';

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    overallStatus,
    totalLatency: Date.now() - startTime,
    services: results
  });
}
