import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/settings
export async function GET() {
  try {
    const settings = await db.systemSetting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    // Provide defaults
    return NextResponse.json({
      DEFAULT_FREE_HOURS: settingsMap.DEFAULT_FREE_HOURS || process.env.DEFAULT_FREE_HOURS || '24',
      DEFAULT_HOURLY_RATE: settingsMap.DEFAULT_HOURLY_RATE || process.env.DEFAULT_HOURLY_RATE || '0.5',
      DEFAULT_CURRENCY: settingsMap.DEFAULT_CURRENCY || process.env.DEFAULT_CURRENCY || 'USD',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { DEFAULT_FREE_HOURS, DEFAULT_HOURLY_RATE, DEFAULT_CURRENCY } = body;

    const updates: Promise<unknown>[] = [];

    if (DEFAULT_FREE_HOURS !== undefined) {
      updates.push(
        db.systemSetting.upsert({
          where: { key: 'DEFAULT_FREE_HOURS' },
          update: { value: String(DEFAULT_FREE_HOURS) },
          create: { key: 'DEFAULT_FREE_HOURS', value: String(DEFAULT_FREE_HOURS) },
        })
      );
    }

    if (DEFAULT_HOURLY_RATE !== undefined) {
      updates.push(
        db.systemSetting.upsert({
          where: { key: 'DEFAULT_HOURLY_RATE' },
          update: { value: String(DEFAULT_HOURLY_RATE) },
          create: { key: 'DEFAULT_HOURLY_RATE', value: String(DEFAULT_HOURLY_RATE) },
        })
      );
    }

    if (DEFAULT_CURRENCY !== undefined) {
      updates.push(
        db.systemSetting.upsert({
          where: { key: 'DEFAULT_CURRENCY' },
          update: { value: DEFAULT_CURRENCY },
          create: { key: 'DEFAULT_CURRENCY', value: DEFAULT_CURRENCY },
        })
      );
    }

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
