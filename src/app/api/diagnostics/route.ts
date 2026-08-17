import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getDeviceStatusWithCredentials,
  getCredentialsForDevice,
} from '@/lib/bestwond';
import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';
import { sendSMS, getDeviceStatus as getTextBeeDeviceStatus } from '@/lib/textbee';
import { isEmailEnabled, sendEmail } from '@/lib/email';
import { getDimepayConfig } from '@/lib/settings';

// GET /api/diagnostics - Get system diagnostic data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get box grid status
    if (action === 'box-grid') {
      return await getBoxGrid();
    }

    // Test Bestwond API connection
    if (action === 'test-bestwond') {
      return await testBestwond();
    }

    // Test TextBee SMS connection
    if (action === 'test-textbee') {
      return await testTextBee();
    }

    // Test DimePay connection
    if (action === 'test-dimepay') {
      return await testDimePay();
    }

    // Test Email (Resend)
    if (action === 'test-email') {
      return await testEmail();
    }

    // Test Database connection
    if (action === 'test-database') {
      return await testDatabase();
    }

    // Get full system overview
    return await getSystemOverview();

  } catch (error) {
    console.error('[Diagnostics] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Diagnostics failed',
    }, { status: 500 });
  }
}

// POST /api/diagnostics - Execute diagnostic actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Open a specific box door
    if (action === 'open-box') {
      const { deviceId, boxNumber } = body;
      return await openBoxDoor(deviceId, boxNumber);
    }

    // Open all available boxes (emergency unlock)
    if (action === 'open-all-boxes') {
      return await openAllBoxes();
    }

    // Send test SMS
    if (action === 'send-test-sms') {
      const { phone } = body;
      return await sendTestSMS(phone);
    }

    // Send test email
    if (action === 'send-test-email') {
      const { email } = body;
      return await sendTestEmail(email);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action',
    }, { status: 400 });

  } catch (error) {
    console.error('[Diagnostics] POST Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Action failed',
    }, { status: 500 });
  }
}

// ============ GET HANDLERS ============

async function getBoxGrid() {
  const devices = await db.device.findMany({
    include: {
      boxes: {
        orderBy: { boxNumber: 'asc' },
      },
    },
  });

  const grid = devices.map(device => ({
    id: device.id,
    deviceId: device.deviceId,
    name: device.name,
    location: device.location,
    status: device.status,
    totalBoxes: device.totalBoxes,
    availableBoxes: device.availableBoxes,
    boxes: device.boxes.map(box => ({
      id: box.id,
      boxNumber: box.boxNumber,
      size: box.size,
      status: box.status,
      lastUsedAt: box.lastUsedAt,
    })),
  }));

  return NextResponse.json({ success: true, devices: grid });
}

async function testBestwond() {
  const startTime = Date.now();

  try {
    const device = await db.device.findFirst();
    if (!device) {
      return NextResponse.json({
        success: false,
        service: 'Bestwond',
        status: 'error',
        message: 'No devices configured in database',
        latency: Date.now() - startTime,
      });
    }

    const credentials = await getCredentialsForDevice(device.id);

    if (!credentials.appId || !credentials.appSecret) {
      return NextResponse.json({
        success: false,
        service: 'Bestwond',
        status: 'not_configured',
        message: 'Bestwond credentials not configured. Set BESTWOND_APP_ID and BESTWOND_APP_SECRET.',
        latency: Date.now() - startTime,
      });
    }

    // Try to get device status
    const result = await getDeviceStatusWithCredentials(device.deviceId, credentials);

    return NextResponse.json({
      success: true,
      service: 'Bestwond',
      status: 'connected',
      message: `Device "${device.name}" is ${result.code === 0 ? 'online' : 'responding with code ' + result.code}`,
      latency: Date.now() - startTime,
      details: {
        deviceName: device.name,
        deviceId: device.deviceId,
        responseCode: result.code,
        responseData: result.data,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      service: 'Bestwond',
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed',
      latency: Date.now() - startTime,
    });
  }
}

async function testTextBee() {
  const startTime = Date.now();

  try {
    const apiKey = process.env.TEXTBEE_API_KEY;
    const deviceId = process.env.TEXTBEE_DEVICE_ID;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        service: 'TextBee SMS',
        status: 'not_configured',
        message: 'TEXTBEE_API_KEY not set in environment',
        latency: Date.now() - startTime,
      });
    }

    if (!deviceId) {
      return NextResponse.json({
        success: false,
        service: 'TextBee SMS',
        status: 'not_configured',
        message: 'TEXTBEE_DEVICE_ID not set in environment',
        latency: Date.now() - startTime,
      });
    }

    const status = await getTextBeeDeviceStatus();

    return NextResponse.json({
      success: true,
      service: 'TextBee SMS',
      status: status?.connected ? 'connected' : 'degraded',
      message: status?.connected
        ? `Phone gateway connected (${status.device?.model || 'Unknown device'})`
        : 'API reachable but phone gateway may be disconnected',
      latency: Date.now() - startTime,
      details: status,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      service: 'TextBee SMS',
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed',
      latency: Date.now() - startTime,
    });
  }
}

async function testDimePay() {
  const startTime = Date.now();

  try {
    const config = await getDimepayConfig();

    const effectiveClientId = config.sandboxMode ? config.sandboxClientId : config.liveClientId;
    const effectiveSecretKey = config.sandboxMode ? config.sandboxSecretKey : config.liveSecretKey;

    if (!effectiveClientId || !effectiveSecretKey) {
      return NextResponse.json({
        success: false,
        service: 'DimePay',
        status: 'not_configured',
        message: `No ${config.sandboxMode ? 'sandbox' : 'live'} credentials configured`,
        latency: Date.now() - startTime,
        details: {
          sandboxMode: config.sandboxMode,
          hasClientId: !!effectiveClientId,
          hasSecretKey: !!effectiveSecretKey,
        },
      });
    }

    // Verify credentials format (DimePay client IDs are typically UUIDs)
    const isValidFormat = effectiveClientId.length > 10 && effectiveSecretKey.length > 10;

    return NextResponse.json({
      success: true,
      service: 'DimePay',
      status: isValidFormat ? 'configured' : 'degraded',
      message: isValidFormat
        ? `DimePay ${config.sandboxMode ? 'sandbox' : 'live'} credentials configured`
        : 'Credentials may be incorrectly formatted',
      latency: Date.now() - startTime,
      details: {
        sandboxMode: config.sandboxMode,
        hasClientId: true,
        hasSecretKey: true,
        clientIdPrefix: effectiveClientId.substring(0, 8) + '...',
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      service: 'DimePay',
      status: 'error',
      message: error instanceof Error ? error.message : 'Configuration check failed',
      latency: Date.now() - startTime,
    });
  }
}

async function testEmail() {
  const startTime = Date.now();

  try {
    const enabled = await isEmailEnabled();

    if (!enabled) {
      return NextResponse.json({
        success: false,
        service: 'Email (Resend)',
        status: 'not_configured',
        message: 'RESEND_API_KEY not set or email is disabled',
        latency: Date.now() - startTime,
      });
    }

    return NextResponse.json({
      success: true,
      service: 'Email (Resend)',
      status: 'configured',
      message: 'Resend API key is configured',
      latency: Date.now() - startTime,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      service: 'Email (Resend)',
      status: 'error',
      message: error instanceof Error ? error.message : 'Check failed',
      latency: Date.now() - startTime,
    });
  }
}

async function testDatabase() {
  const startTime = Date.now();

  try {
    // Test basic connectivity
    const userCount = await db.user.count();
    const orderCount = await db.order.count();
    const boxCount = await db.box.count();
    const deviceCount = await db.device.count();
    const courierCount = await db.courier.count();

    // Test write capability
    const testKey = `db_test_${Date.now()}`;
    await db.setting.upsert({
      where: { key: testKey },
      create: { key: testKey, value: 'test', description: 'Diagnostics write test' },
      update: { value: 'test' },
    });
    await db.setting.delete({ where: { key: testKey } }).catch(() => {});

    return NextResponse.json({
      success: true,
      service: 'Database (PostgreSQL)',
      status: 'connected',
      message: 'Database is healthy — read and write operations working',
      latency: Date.now() - startTime,
      details: {
        users: userCount,
        orders: orderCount,
        boxes: boxCount,
        devices: deviceCount,
        couriers: courierCount,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      service: 'Database (PostgreSQL)',
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
      latency: Date.now() - startTime,
    });
  }
}

async function getSystemOverview() {
  const results: Record<string, any> = {};

  // Database
  try {
    const userCount = await db.user.count();
    const orderCount = await db.order.count();
    const boxCount = await db.box.count();
    const deviceCount = await db.device.count();

    results.database = {
      status: 'connected',
      users: userCount,
      orders: orderCount,
      boxes: boxCount,
      devices: deviceCount,
    };
  } catch (error) {
    results.database = { status: 'error', message: error instanceof Error ? error.message : 'Failed' };
  }

  // Environment check
  const envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    BESTWOND_APP_ID: !!process.env.BESTWOND_APP_ID,
    BESTWOND_APP_SECRET: !!process.env.BESTWOND_APP_SECRET,
    BESTWOND_DEVICE_ID: !!process.env.BESTWOND_DEVICE_ID,
    TEXTBEE_API_KEY: !!process.env.TEXTBEE_API_KEY,
    TEXTBEE_DEVICE_ID: !!process.env.TEXTBEE_DEVICE_ID,
    DIMEPAY_SANDBOX_CLIENT_ID: !!process.env.DIMEPAY_SANDBOX_CLIENT_ID,
    DIMEPAY_LIVE_CLIENT_ID: !!process.env.DIMEPAY_LIVE_CLIENT_ID,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
  };

  const missing = Object.entries(envVars).filter(([_, set]) => !set).map(([key]) => key);

  results.environment = {
    status: missing.length === 0 ? 'healthy' : 'degraded',
    configured: envVars,
    missing,
  };

  // Box availability summary
  try {
    const available = await db.box.count({ where: { status: 'AVAILABLE' } });
    const occupied = await db.box.count({ where: { status: 'OCCUPIED' } });
    const reserved = await db.box.count({ where: { status: 'RESERVED' } });
    const offline = await db.box.count({ where: { status: 'OFFLINE' } });
    const total = await db.box.count();

    results.boxes = {
      total,
      available,
      occupied,
      reserved,
      offline,
      utilizationPercent: total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0,
    };
  } catch {
    results.boxes = { status: 'error' };
  }

  return NextResponse.json({ success: true, overview: results });
}

// ============ POST HANDLERS ============

async function openBoxDoor(deviceId: string, boxNumber: number) {
  try {
    if (!deviceId || !boxNumber) {
      return NextResponse.json({
        success: false,
        error: 'Device ID and box number are required',
      }, { status: 400 });
    }

    const device = await db.device.findFirst({
      where: {
        OR: [
          { id: deviceId },
          { deviceId: deviceId },
        ],
      },
    });

    if (!device) {
      return NextResponse.json({
        success: false,
        error: 'Device not found',
      }, { status: 404 });
    }

    // Use DoorOperationService for all physical door operations
    const requestId = `diag-open-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const doorResult = await executeDoorOperation({
      orderId: `admin-diag-${device.id}`,
      orderNo: `DIAGNOSTIC-OPEN`,
      deviceId: device.id,
      deviceNumber: device.deviceId,
      boxNumber,
      action: 'admin-open',
      requestId,
    });

    // Log the action
    await db.activity.create({
      data: {
        action: 'DIAGNOSTIC_BOX_OPEN',
        description: `Diagnostic: Opened box #${boxNumber} on device ${device.name}`,
      },
    });

    return NextResponse.json({
      success: doorResult.success && doorResult.confirmed,
      message: doorResult.success && doorResult.confirmed
        ? `Box #${boxNumber} opened successfully`
        : `Failed to open box #${boxNumber}: ${doorResult.message}`,
      details: doorResult,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open box',
    }, { status: 500 });
  }
}

async function openAllBoxes() {
  try {
    const device = await db.device.findFirst();
    if (!device) {
      return NextResponse.json({
        success: false,
        error: 'No devices found',
      }, { status: 404 });
    }

    const boxes = await db.box.findMany({
      where: { deviceId: device.id },
      orderBy: { boxNumber: 'asc' },
    });

    const results: { boxNumber: number; success: boolean; error?: string }[] = [];

    for (const box of boxes) {
      try {
        // Use DoorOperationService for each box
        const requestId = `diag-all-${box.boxNumber}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const doorResult = await executeDoorOperation({
          orderId: `admin-diag-all-${device.id}`,
          orderNo: `DIAGNOSTIC-OPEN-ALL`,
          deviceId: device.id,
          deviceNumber: device.deviceId,
          boxId: box.id,
          boxNumber: box.boxNumber,
          action: 'admin-open',
          requestId,
        });
        results.push({ boxNumber: box.boxNumber, success: doorResult.success && doorResult.confirmed });
      } catch (err) {
        results.push({ boxNumber: box.boxNumber, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }

    // Log the action
    await db.activity.create({
      data: {
        action: 'DIAGNOSTIC_OPEN_ALL',
        description: `Diagnostic: Emergency unlock all ${boxes.length} boxes on ${device.name}`,
      },
    });

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      message: `Opened ${successCount}/${boxes.length} boxes`,
      results,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open boxes',
    }, { status: 500 });
  }
}

async function sendTestSMS(phone: string) {
  try {
    if (!phone) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required',
      }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = `[PICKUP JA TEST] This is a test message from your Pickup Jamaica diagnostics panel. Sent at ${new Date().toISOString()}`;

    await sendSMS(cleanPhone, message);

    // Log
    await db.activity.create({
      data: {
        action: 'DIAGNOSTIC_TEST_SMS',
        description: `Diagnostic: Test SMS sent to ${cleanPhone}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Test SMS sent to ${cleanPhone}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    }, { status: 500 });
  }
}

async function sendTestEmail(email: string) {
  try {
    if (!email) {
      return NextResponse.json({
        success: false,
        error: 'Email address is required',
      }, { status: 400 });
    }

    const emailEnabled = await isEmailEnabled();
    if (!emailEnabled) {
      return NextResponse.json({
        success: false,
        error: 'Email is not configured (RESEND_API_KEY missing)',
      }, { status: 400 });
    }

    await sendEmail(
      email,
      'Pickup Jamaica - Diagnostic Test Email',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #111111; padding: 20px; text-align: center;">
          <h1 style="color: #FFD439; margin: 0;">PICK<span style="color: white;">UP</span></h1>
          <p style="color: #999; margin: 5px 0 0 0;">Smart Locker System</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #111;">Diagnostic Test</h2>
          <p style="font-size: 16px; color: #333;">This is a test email from your Pickup Jamaica diagnostics panel.</p>
          <p style="font-size: 14px; color: #666;">Sent at: ${new Date().toISOString()}</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">If you did not request this test, please check your diagnostics panel settings.</p>
        </div>
      </div>
      `,
      `Pickup Jamaica Diagnostic Test - This is a test email sent at ${new Date().toISOString()}`
    );

    // Log
    await db.activity.create({
      data: {
        action: 'DIAGNOSTIC_TEST_EMAIL',
        description: `Diagnostic: Test email sent to ${email}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${email}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }, { status: 500 });
  }
}
