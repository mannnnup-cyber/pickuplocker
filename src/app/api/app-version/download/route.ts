import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { stat } from 'fs/promises';

/**
 * GET /api/app-version/download
 *
 * Serves the latest APK file for in-app updates.
 *
 * The APK is searched in the following order:
 *   1. <cwd>/releases/PickupJamaica-kiosk-v<version>.apk  (version-specific)
 *   2. <cwd>/releases/PickupJamaica-kiosk-latest.apk      (latest alias)
 *   3. <cwd>/releases/*.apk                                (most recent by mtime)
 *   4. <cwd>/download/*.apk                                (fallback — for dev sandboxes)
 *
 * For production, you should use a CDN or object storage (S3, R2, etc.)
 * instead of serving the APK through the Next.js server.
 *
 * Vercel note: serverless functions have a read-only filesystem except
 * for /tmp. The APK must be bundled into the deployment (committed to
 * the repo or uploaded as a build artifact). Place it in /releases/
 * at build time.
 */

// Cache the resolved APK path for 5 minutes to avoid repeated directory
// scans on every request. The cache is per-instance on Vercel serverless.
let cachedApkPath: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function findApkPath(): Promise<string | null> {
  const now = Date.now();
  if (cachedApkPath && (now - cachedAt) < CACHE_TTL_MS) {
    // Verify the cached file still exists
    try {
      await stat(cachedApkPath);
      return cachedApkPath;
    } catch {
      cachedApkPath = null;
    }
  }

  const fs = await import('fs');
  const path = await import('path');

  // Read version config to know which version we're looking for
  let config: { version?: string; apkUrl?: string } = {};
  try {
    const configPath = path.join(process.cwd(), 'app-version.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    // No config file — fall back to defaults
  }

  const version = config.version || '3.2';

  // Search directories — in priority order. Include /tmp on Vercel for
  // cases where a build script downloads the APK at deploy time.
  const searchDirs = [
    path.join(process.cwd(), 'releases'),
    path.join(process.cwd(), 'download'),
    '/tmp/releases',
    '/tmp/download',
  ];

  const filenames = [
    `PickupJamaica-kiosk-v${version}.apk`,
    'PickupJamaica-kiosk-latest.apk',
  ];

  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;

      // Try specific filenames first
      for (const fname of filenames) {
        const fullPath = path.join(dir, fname);
        try {
          const stats = await stat(fullPath);
          if (stats.isFile() && stats.size > 0) {
            cachedApkPath = fullPath;
            cachedAt = now;
            console.log(`[app-version/download] Found APK: ${fullPath} (${stats.size} bytes)`);
            return fullPath;
          } else {
            console.warn(`[app-version/download] Skipping empty file: ${fullPath} (size=${stats.size})`);
          }
        } catch {
          // File doesn't exist — try next
        }
      }

      // Fall back to most recent APK in the directory
      try {
        const files = fs.readdirSync(dir)
          .filter(f => f.toLowerCase().endsWith('.apk'))
          .map(f => {
            const filePath = path.join(dir, f);
            try {
              const stats = fs.statSync(filePath);
              return { name: f, path: filePath, mtime: stats.mtime.getTime(), size: stats.size };
            } catch {
              return null;
            }
          })
          .filter((f): f is { name: string; path: string; mtime: number; size: number } =>
            f !== null && f.size > 0
          )
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const latest = files[0];
          cachedApkPath = latest.path;
          cachedAt = now;
          console.log(`[app-version/download] Found APK (most recent): ${latest.path} (${latest.size} bytes)`);
          return latest.path;
        }
      } catch {
        // readdir failed — try next dir
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET() {
  try {
    const apkPath = await findApkPath();

    if (!apkPath) {
      console.error('[app-version/download] No APK file found in any search directory');
      return NextResponse.json(
        {
          error: 'No APK file found. Upload an APK to the releases/ directory.',
          searchedDirs: ['releases/', 'download/', '/tmp/releases/', '/tmp/download/'],
          hint: 'On Vercel, the APK must be committed to the repo or uploaded as a build artifact at deploy time. Serverless functions have a read-only filesystem except /tmp.',
        },
        { status: 404 }
      );
    }

    const buffer = await readFile(apkPath);

    if (buffer.length === 0) {
      console.error(`[app-version/download] APK file is empty: ${apkPath}`);
      return NextResponse.json(
        { error: 'APK file exists but is empty (0 bytes). Re-upload the APK.' },
        { status: 500 }
      );
    }

    const filename = apkPath.split('/').pop() || 'pickuplocker.apk';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[app-version/download] Failed to serve APK:', error);
    return NextResponse.json(
      {
        error: 'Failed to serve APK file',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
