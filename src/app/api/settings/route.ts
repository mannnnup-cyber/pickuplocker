import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSettingsCache } from '@/lib/settings';

// GET all settings grouped by category
export async function GET(request: NextRequest) {
  try {
    const settings = await db.setting.findMany();

    // Group settings by category (prefix before _)
    const groupedSettings: Record<string, Record<string, string>> = {};

    for (const setting of settings) {
      const parts = setting.key.split('_');
      const category = parts[0];
      const key = parts.slice(1).join('_');

      if (!groupedSettings[category]) {
        groupedSettings[category] = {};
      }
      groupedSettings[category][key] = setting.value;
    }

    // Define default settings structure
    const defaultSettings = {
      business: {
        brandName: groupedSettings.business?.brandName || 'Pickup',
        location: groupedSettings.business?.location || 'UTech Campus',
        partners: groupedSettings.business?.partners || 'Dirty Hand Designs + 876OnTheGo',
        phone: groupedSettings.business?.phone || '876-XXX-XXXX',
        email: groupedSettings.business?.email || 'support@pickupja.com',
      },
      storage: {
        freeDays: groupedSettings.storage?.freeDays || '3',
        tier1Fee: groupedSettings.storage?.tier1Fee || '100',
        tier2Fee: groupedSettings.storage?.tier2Fee || '150',
        tier3Fee: groupedSettings.storage?.tier3Fee || '200',
        maxDays: groupedSettings.storage?.maxDays || '30',
      },
      bestwond: {
        appId: groupedSettings.bestwond?.appId || process.env.BESTWOND_APP_ID || '',
        appSecret: groupedSettings.bestwond?.appSecret || process.env.BESTWOND_APP_SECRET || '',
        deviceId: groupedSettings.bestwond?.deviceId || process.env.BESTWOND_DEVICE_ID || '',
        baseUrl: groupedSettings.bestwond?.baseUrl || process.env.BESTWOND_BASE_URL || 'https://api.bestwond.com',
        enabled: groupedSettings.bestwond?.enabled || 'true',
      },
      textbee: {
        apiKey: groupedSettings.textbee?.apiKey || process.env.TEXTBEE_API_KEY || '',
        deviceId: groupedSettings.textbee?.deviceId || process.env.TEXTBEE_DEVICE_ID || '',
        enabled: groupedSettings.textbee?.enabled || 'true',
        senderName: groupedSettings.textbee?.senderName || 'PickupJA',
      },
      dimepay: {
        apiKey: groupedSettings.dimepay?.apiKey || process.env.DIMEPAY_API_KEY || '',
        merchantId: groupedSettings.dimepay?.merchantId || process.env.DIMEPAY_MERCHANT_ID || '',
        baseUrl: groupedSettings.dimepay?.baseUrl || process.env.DIMEPAY_BASE_URL || 'https://api.dimepay.app/dapi/v1',
        sandboxMode: groupedSettings.dimepay?.sandboxMode || 'false',
        sandboxBaseUrl: groupedSettings.dimepay?.sandboxBaseUrl || 'https://sandbox.api.dimepay.app/dapi/v1',
        enabled: groupedSettings.dimepay?.enabled || 'true',
        // Fee pass-through settings
        passFeeToCustomer: groupedSettings.dimepay?.passFeeToCustomer || 'true', // Pass fee to customers for storage fees
        passFeeToCourier: groupedSettings.dimepay?.passFeeToCourier || 'false', // Merchant absorbs fee for courier top-ups
        feePercentage: groupedSettings.dimepay?.feePercentage || '2.5',
        fixedFee: groupedSettings.dimepay?.fixedFee || '30',
      },
      notifications: {
        smsEnabled: groupedSettings.notifications?.smsEnabled || 'true',
        emailEnabled: groupedSettings.notifications?.emailEnabled || 'false',
        whatsappEnabled: groupedSettings.notifications?.whatsappEnabled || 'false',
        pickupReminder: groupedSettings.notifications?.pickupReminder || '24',
        abandonedWarning: groupedSettings.notifications?.abandonedWarning || '25',
      },
      sms: {
        signature: groupedSettings.sms?.signature || '- Pickup Jamaica',
        costPerSms: groupedSettings.sms?.costPerSms || '5',
        maxRetries: groupedSettings.sms?.maxRetries || '3',
      },
      email: {
        enabled: groupedSettings.email?.enabled || 'false',
        host: groupedSettings.email?.host || '',
        port: groupedSettings.email?.port || '587',
        secure: groupedSettings.email?.secure || 'true',
        user: groupedSettings.email?.user || '',
        password: groupedSettings.email?.password || '',
        fromEmail: groupedSettings.email?.fromEmail || 'noreply@pickupja.com',
        fromName: groupedSettings.email?.fromName || 'Pickup Jamaica',
      }
    };

    return NextResponse.json({
      success: true,
      data: defaultSettings,
      raw: groupedSettings
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch settings'
    }, { status: 500 });
  }
}

// PUT update settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, settings } = body;

    if (!category || !settings) {
      return NextResponse.json({
        success: false,
        error: 'Category and settings are required'
      }, { status: 400 });
    }

    // Update each setting in the category
    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
      const fullKey = `${category}_${key}`;
      updates.push(
        db.setting.upsert({
          where: { key: fullKey },
          update: { value: String(value) },
          create: { key: fullKey, value: String(value) }
        })
      );
    }

    await Promise.all(updates);

    // Clear the settings cache so new values are picked up immediately
    clearSettingsCache();

    return NextResponse.json({
      success: true,
      message: `${category} settings updated successfully`
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update settings'
    }, { status: 500 });
  }
}
