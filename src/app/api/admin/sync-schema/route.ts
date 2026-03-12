import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * One-time endpoint to sync database schema
 * Call this once: GET /api/admin/sync-schema?key=sync-schema-2024
 *
 * This adds missing columns like bestwondAppId, bestwondAppSecret to devices table
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // Simple auth check
    if (key !== 'sync-schema-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if columns already exist by trying to query them
    try {
      await db.$executeRaw`
        SELECT "bestwondAppId", "bestwondAppSecret" FROM devices LIMIT 1
      `;
      return NextResponse.json({
        success: true,
        message: 'Schema already synced - columns exist'
      });
    } catch {
      // Columns don't exist, add them
      await db.$executeRaw`
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS "bestwondAppId" TEXT
      `;
      await db.$executeRaw`
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS "bestwondAppSecret" TEXT
      `;

      return NextResponse.json({
        success: true,
        message: 'Schema synced - added bestwondAppId and bestwondAppSecret columns to devices table'
      });
    }
  } catch (error) {
    console.error('Schema sync error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync schema'
    }, { status: 500 });
  }
}
