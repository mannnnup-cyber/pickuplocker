import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSettingsCache } from '@/lib/settings';

// POST - Fix DimePay URLs to correct values
export async function POST() {
  try {
    const correctUrls = {
      dimepay_baseUrl: 'https://api.dimepay.app/dapi/v1',
      dimepay_sandboxBaseUrl: 'https://sandbox.api.dimepay.app/dapi/v1',
    };

    const updates = [];
    for (const [key, value] of Object.entries(correctUrls)) {
      updates.push(
        db.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        })
      );
    }

    await Promise.all(updates);

    // Clear cache so new values are picked up
    clearSettingsCache();

    return NextResponse.json({
      success: true,
      message: 'DimePay URLs have been corrected',
      updated: correctUrls
    });
  } catch (error) {
    console.error('Failed to fix DimePay URLs:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update settings'
    }, { status: 500 });
  }
}

// GET - Show current DimePay URL settings
export async function GET() {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: {
          in: ['dimepay_baseUrl', 'dimepay_sandboxBaseUrl', 'dimepay_sandboxMode', 'dimepay_apiKey', 'dimepay_merchantId']
        }
      }
    });

    const result: Record<string, string> = {};
    for (const setting of settings) {
      // Mask sensitive values
      if (setting.key.includes('apiKey')) {
        result[setting.key] = setting.value.substring(0, 8) + '...' + setting.value.substring(setting.value.length - 4);
      } else {
        result[setting.key] = setting.value;
      }
    }

    return NextResponse.json({
      success: true,
      currentSettings: result,
      correctUrls: {
        dimepay_baseUrl: 'https://api.dimepay.app/dapi/v1',
        dimepay_sandboxBaseUrl: 'https://sandbox.api.dimepay.app/dapi/v1',
      }
    });
  } catch (error) {
    console.error('Failed to get DimePay settings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get settings'
    }, { status: 500 });
  }
}
