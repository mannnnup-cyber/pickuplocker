import { NextResponse } from 'next/server';

/**
 * GET /api/app-version
 *
 * Returns the latest APK version info for in-app update checks.
 * The kiosk app polls this on startup and periodically to detect updates.
 *
 * Version info is loaded from app-version.json in the project root,
 * so you can update it without changing code — just edit the JSON
 * and redeploy (or use the admin dashboard if configured).
 *
 * Response:
 *   { version, versionCode, apkUrl, checksum, changelog, minVersion, forceUpdate }
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedConfig: any = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getVersionConfig() {
  const now = Date.now();
  if (cachedConfig && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'app-version.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw);
    cachedAt = now;
    return cachedConfig;
  } catch {
    // Return defaults if no config file exists
    const defaults = {
      version: '3.2',
      versionCode: 6,
      apkUrl: '',
      checksum: '',
      changelog: 'No updates available',
      minVersion: '3.0',
      forceUpdate: false,
    };
    cachedConfig = defaults;
    cachedAt = now;
    return defaults;
  }
}

export async function GET() {
  try {
    const config = await getVersionConfig();

    return NextResponse.json({
      version: config.version || '3.2',
      versionCode: config.versionCode || 6,
      apkUrl: config.apkUrl || '',
      checksum: config.checksum || '',
      changelog: config.changelog || '',
      minVersion: config.minVersion || '3.0',
      forceUpdate: config.forceUpdate || false,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to read version info' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/app-version
 *
 * Update the version config (admin only — should be protected by auth in production).
 * Body: { version, versionCode, apkUrl, checksum, changelog, minVersion, forceUpdate }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'app-version.json');

    // Read existing config or create new
    let existing: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // File doesn't exist yet
    }

    // Merge with new values
    const updated = {
      version: body.version || existing.version || '3.2',
      versionCode: body.versionCode || existing.versionCode || 6,
      apkUrl: body.apkUrl || existing.apkUrl || '',
      checksum: body.checksum || existing.checksum || '',
      changelog: body.changelog || existing.changelog || '',
      minVersion: body.minVersion || existing.minVersion || '3.0',
      forceUpdate: body.forceUpdate !== undefined ? body.forceUpdate : (existing.forceUpdate || false),
    };

    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');

    // Invalidate cache
    cachedConfig = null;
    cachedAt = 0;

    return NextResponse.json({ success: true, config: updated });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update version info' },
      { status: 500 }
    );
  }
}
