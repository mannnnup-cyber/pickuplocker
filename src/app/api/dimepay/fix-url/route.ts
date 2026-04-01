import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSettingsCache } from '@/lib/settings';

// POST - Migrate old DimePay settings to new format
export async function POST() {
  try {
    // Get old settings
    const oldSettings = await db.setting.findMany({
      where: {
        key: {
          in: ['dimepay_apiKey', 'dimepay_merchantId', 'dimepay_baseUrl', 'dimepay_sandboxBaseUrl']
        }
      }
    });

    const oldValues: Record<string, string> = {};
    for (const setting of oldSettings) {
      oldValues[setting.key] = setting.value;
    }

    // Delete old settings that are no longer used
    await db.setting.deleteMany({
      where: {
        key: {
          in: ['dimepay_apiKey', 'dimepay_merchantId', 'dimepay_baseUrl', 'dimepay_sandboxBaseUrl']
        }
      }
    });

    // Clear cache
    clearSettingsCache();

    return NextResponse.json({
      success: true,
      message: 'Old DimePay settings cleaned up. Please configure new Client ID and Secret Key in Settings.',
      removedSettings: Object.keys(oldValues),
      note: 'DimePay now uses Client ID (ck_test_/ck_live_) and Secret Key instead of API Key and Merchant ID.'
    });
  } catch (error) {
    console.error('Failed to migrate DimePay settings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to migrate settings'
    }, { status: 500 });
  }
}

// GET - Show current DimePay settings status
export async function GET() {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: {
          startsWith: 'dimepay_'
        }
      }
    });

    const result: Record<string, string> = {};
    for (const setting of settings) {
      // Mask sensitive values
      if (setting.key.includes('secretKey')) {
        result[setting.key] = '***' + setting.value.substring(setting.value.length - 4);
      } else if (setting.key.includes('clientId')) {
        result[setting.key] = setting.value.substring(0, 15) + '...';
      } else {
        result[setting.key] = setting.value;
      }
    }

    return NextResponse.json({
      success: true,
      currentSettings: result,
      correctFormat: {
        sandbox_clientId: 'Should start with ck_test_',
        sandbox_secretKey: 'Your sandbox secret key',
        live_clientId: 'Should start with ck_live_',
        live_secretKey: 'Your live secret key',
        sandboxMode: 'true for testing, false for production'
      },
      apiUrl: 'https://api.dimepay.com (same for both environments)'
    });
  } catch (error) {
    console.error('Failed to get DimePay settings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get settings'
    }, { status: 500 });
  }
}
