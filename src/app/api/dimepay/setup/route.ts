import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSettingsCache } from '@/lib/settings';

// POST - Set DimePay credentials for SDK integration
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sandboxClientId, sandboxSecretKey, liveClientId, liveSecretKey, sandboxMode } = body;

    const updates = [];

    // Set sandbox credentials
    if (sandboxClientId) {
      updates.push(
        db.setting.upsert({
          where: { key: 'dimepay_sandbox_clientId' },
          update: { value: sandboxClientId },
          create: { key: 'dimepay_sandbox_clientId', value: sandboxClientId }
        })
      );
    }

    if (sandboxSecretKey) {
      updates.push(
        db.setting.upsert({
          where: { key: 'dimepay_sandbox_secretKey' },
          update: { value: sandboxSecretKey },
          create: { key: 'dimepay_sandbox_secretKey', value: sandboxSecretKey }
        })
      );
    }

    // Set live credentials
    if (liveClientId) {
      updates.push(
        db.setting.upsert({
          where: { key: 'dimepay_live_clientId' },
          update: { value: liveClientId },
          create: { key: 'dimepay_live_clientId', value: liveClientId }
        })
      );
    }

    if (liveSecretKey) {
      updates.push(
        db.setting.upsert({
          where: { key: 'dimepay_live_secretKey' },
          update: { value: liveSecretKey },
          create: { key: 'dimepay_live_secretKey', value: liveSecretKey }
        })
      );
    }

    // Set mode
    if (sandboxMode !== undefined) {
      updates.push(
        db.setting.upsert({
          where: { key: 'dimepay_sandboxMode' },
          update: { value: String(sandboxMode) },
          create: { key: 'dimepay_sandboxMode', value: String(sandboxMode) }
        })
      );
    }

    // Enable DimePay
    updates.push(
      db.setting.upsert({
        where: { key: 'dimepay_enabled' },
        update: { value: 'true' },
        create: { key: 'dimepay_enabled', value: 'true' }
      })
    );

    await Promise.all(updates);

    // Clear cache
    clearSettingsCache();

    return NextResponse.json({
      success: true,
      message: 'DimePay SDK credentials configured successfully',
      mode: sandboxMode ? 'sandbox' : 'live',
      credentials: {
        sandbox: {
          clientIdSet: !!sandboxClientId,
          secretKeySet: !!sandboxSecretKey
        },
        live: {
          clientIdSet: !!liveClientId,
          secretKeySet: !!liveSecretKey
        }
      }
    });
  } catch (error) {
    console.error('Failed to set DimePay credentials:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to set credentials'
    }, { status: 500 });
  }
}
