import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSettingsCache } from '@/lib/settings';

// POST /api/devices/configure - Configure device credentials in settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceNumber, name, appId, appSecret, deviceIndex = 2 } = body;

    if (!deviceNumber || !appId || !appSecret) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: deviceNumber, appId, appSecret',
      }, { status: 400 });
    }

    // Store device credentials in settings
    const settingsToUpsert = [
      { key: `device_${deviceIndex}_id`, value: deviceNumber },
      { key: `device_${deviceIndex}_name`, value: name || `Locker ${deviceNumber}` },
      { key: `device_${deviceIndex}_appId`, value: appId },
      { key: `device_${deviceIndex}_appSecret`, value: appSecret },
    ];

    for (const setting of settingsToUpsert) {
      await db.setting.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: { key: setting.key, value: setting.value },
      });
    }

    // Clear settings cache
    clearSettingsCache();

    // Also try to create/update device in database
    try {
      const existingDevice = await db.device.findFirst({
        where: { deviceId: deviceNumber },
      });

      if (existingDevice) {
        await db.device.update({
          where: { id: existingDevice.id },
          data: {
            name: name || `Locker ${deviceNumber}`,
            bestwondAppId: appId,
            bestwondAppSecret: appSecret,
            status: 'ONLINE',
          },
        });
      } else {
        await db.device.create({
          data: {
            deviceId: deviceNumber,
            name: name || `Locker ${deviceNumber}`,
            bestwondAppId: appId,
            bestwondAppSecret: appSecret,
            status: 'ONLINE',
            totalBoxes: 36,
            availableBoxes: 36,
          },
        });
      }
    } catch (dbError) {
      console.log('Note: Could not update database device table, but settings saved');
    }

    return NextResponse.json({
      success: true,
      message: `Device ${deviceNumber} configured successfully`,
      device: {
        deviceId: deviceNumber,
        name: name || `Locker ${deviceNumber}`,
        appId: appId.substring(0, 10) + '...',
      },
      settingsSaved: settingsToUpsert.map(s => s.key),
    });

  } catch (error) {
    console.error('Configure device error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/devices/configure - Get list of configured devices
export async function GET() {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: {
          startsWith: 'device_',
        },
      },
    });

    const devices: Array<{
      deviceIndex: number;
      deviceId: string;
      name: string;
      hasCredentials: boolean;
    }> = [];

    // Parse device configurations
    const deviceIds = settings.filter(s => s.key.endsWith('_id'));
    const deviceNames = settings.filter(s => s.key.endsWith('_name'));
    const appIds = settings.filter(s => s.key.endsWith('_appId'));
    const appSecrets = settings.filter(s => s.key.endsWith('_appSecret'));

    for (const idSetting of deviceIds) {
      const match = idSetting.key.match(/device_(\d+)_id/);
      if (match) {
        const index = parseInt(match[1], 10);
        const nameSetting = deviceNames.find(s => s.key === `device_${index}_name`);
        const appIdSetting = appIds.find(s => s.key === `device_${index}_appId`);
        const secretSetting = appSecrets.find(s => s.key === `device_${index}_appSecret`);

        devices.push({
          deviceIndex: index,
          deviceId: idSetting.value,
          name: nameSetting?.value || `Locker ${index}`,
          hasCredentials: !!(appIdSetting?.value && secretSetting?.value),
        });
      }
    }

    return NextResponse.json({
      success: true,
      devices,
      total: devices.length,
    });

  } catch (error) {
    console.error('Get configured devices error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
