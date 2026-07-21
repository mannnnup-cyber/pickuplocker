import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * GET /api/app-version/download
 *
 * Serves the latest APK file for in-app updates.
 * The APK is read from /home/z/my-project/releases/ directory.
 * 
 * For production, you should use a CDN or object storage (S3, R2, etc.)
 * instead of serving the APK through the Next.js server.
 */
export async function GET() {
  try {
    // Try to find the latest APK in the releases directory
    const fs = await import('fs');
    const path = await import('path');

    // Read version config to know which file to serve
    let configPath: string;
    let config: { version?: string; apkUrl?: string } = {};
    try {
      configPath = path.join(process.cwd(), 'app-version.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      // No config file
    }

    // Look for APK files in common locations
    const searchDirs = [
      path.join(process.cwd(), 'releases'),
      path.join(process.cwd(), 'download'),
      '/home/z/my-project/releases',
      '/home/z/my-project/download',
    ];

    // Try version-specific filename first, then latest
    const version = config.version || '3.2';
    const filenames = [
      `PickupJamaica-kiosk-v${version}.apk`,
      'PickupJamaica-kiosk-latest.apk',
    ];

    // Also scan for any APK sorted by modification time
    for (const dir of searchDirs) {
      try {
        if (!fs.existsSync(dir)) continue;

        // Try specific filenames first
        for (const fname of filenames) {
          const fullPath = path.join(dir, fname);
          if (fs.existsSync(fullPath)) {
            const buffer = await readFile(fullPath);
            return new NextResponse(buffer, {
              status: 200,
              headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': `attachment; filename="${fname}"`,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
              },
            });
          }
        }

        // Fall back to most recent APK in the directory
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith('.apk'))
          .map(f => ({
            name: f,
            path: path.join(dir, f),
            mtime: fs.statSync(path.join(dir, f)).mtime.getTime(),
          }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const latest = files[0];
          const buffer = await readFile(latest.path);
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': `attachment; filename="${latest.name}"`,
              'Content-Length': buffer.length.toString(),
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json(
      { error: 'No APK file found. Upload an APK to the releases directory.' },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to serve APK file' },
      { status: 500 }
    );
  }
}
