import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBoxListWithCredentials, getConfigAsync } from '@/lib/bestwond';

// Cache box availability for 15 seconds (ISR)
// This significantly reduces calls to Bestwond API and database
export const revalidate = 15;

// Size mapping - handles various formats
const SIZE_MAP: Record<string, string> = {
  'S': 'S',
  'SMALL': 'S',
  'M': 'M',
  'MEDIUM': 'M',
  'MED': 'M',
  'L': 'L',
  'LARGE': 'L',
  'LRG': 'L',
  'XL': 'XL',
  'XTRA': 'XL',
  'EXTRA': 'XL',
  'EXTRA LARGE': 'XL',
  'X-LARGE': 'XL',
};

function normalizeSize(size: string | null | undefined): string {
  if (!size) return 'M'; // Default to Medium
  const upperSize = size.toUpperCase().trim();
  return SIZE_MAP[upperSize] || 'M';
}

// Get credentials for a device
async function getCredentials(deviceId: string) {
  const device = await db.device.findFirst({
    where: { deviceId: deviceId },
    select: { bestwondAppId: true, bestwondAppSecret: true }
  });
  
  if (device?.bestwondAppId && device?.bestwondAppSecret) {
    return {
      appId: device.bestwondAppId,
      appSecret: device.bestwondAppSecret,
      baseUrl: 'https://api.bestwond.com',
    };
  }
  
  // Fallback to global settings
  const globalConfig = await getConfigAsync();
  return {
    appId: globalConfig.appId,
    appSecret: globalConfig.appSecret,
    baseUrl: globalConfig.baseUrl,
  };
}

export async function GET() {
  try {
    // Try to get real data from Bestwond API first
    let boxesFromApi: Array<{
      box_name: string;
      box_size?: string;
      order_no?: string | null;
      box_status?: number;
      enable_status?: number;
    }> = [];
    
    try {
      // Get the first device (any status, prefer ONLINE)
      const device = await db.device.findFirst({
        orderBy: [
          { status: 'desc' }, // ONLINE comes before OFFLINE alphabetically
          { createdAt: 'asc' }
        ]
      });
      
      console.log('[Box Availability] Found device:', device?.deviceId, 'status:', device?.status);
      
      if (device) {
        const credentials = await getCredentials(device.deviceId);
        
        console.log('[Box Availability] Has credentials:', {
          hasAppId: !!credentials.appId,
          hasAppSecret: !!credentials.appSecret,
        });
        
        if (credentials.appId && credentials.appSecret) {
          const result = await getBoxListWithCredentials(device.deviceId, credentials);
          
          console.log('[Box Availability] Bestwond API result:', {
            code: result.code,
            dataLength: Array.isArray(result.data) ? result.data.length : 0,
            msg: result.msg,
          });
          
          if (result.code === 0 && Array.isArray(result.data)) {
            boxesFromApi = result.data;
          }
        }
      }
    } catch (apiError) {
      console.error('[Box Availability] Bestwond API error:', apiError);
      // Continue with database fallback
    }
    
    // If we got data from API, use it (most accurate)
    if (boxesFromApi.length > 0) {
      const sizeCounts: Record<string, number> = {
        S: 0,
        M: 0,
        L: 0,
        XL: 0,
      };
      
      const availableBoxes: Array<{
        boxNo: number;
        size: string;
        status: string;
      }> = [];
      
      for (const box of boxesFromApi) {
        // A box is available ONLY if it has NO active order
        // We check order_no - if it exists and is not empty, the box is occupied
        // box_status and enable_status are NOT reliable indicators of occupancy
        const hasOrder = !!(box.order_no && box.order_no.trim() !== '');
        
        if (!hasOrder) {
          const size = normalizeSize(box.box_size);
          sizeCounts[size]++;
          availableBoxes.push({
            boxNo: parseInt(box.box_name, 10),
            size,
            status: 'EMPTY',
          });
        }
      }
      
      console.log('[Box Availability] Size counts from API:', sizeCounts, 'Total available:', availableBoxes.length);
      
      return NextResponse.json({
        success: true,
        source: 'bestwond_api',
        sizes: Object.entries(sizeCounts).map(([code, available]) => ({
          code,
          available,
        })),
        totalAvailable: availableBoxes.length,
        boxes: availableBoxes.slice(0, 10),
      });
    }
    
    // Fallback to database - get ALL boxes and calculate availability
    console.log('[Box Availability] Using database fallback');
    
    // First check if we have any boxes at all
    const totalBoxCount = await db.box.count();
    console.log('[Box Availability] Total boxes in database:', totalBoxCount);
    
    if (totalBoxCount === 0) {
      // No boxes in database - return no availability but don't error
      console.log('[Box Availability] No boxes in database - need to sync');
      return NextResponse.json({
        success: true,
        source: 'none',
        sizes: [
          { code: 'S', available: 0 },
          { code: 'M', available: 0 },
          { code: 'L', available: 0 },
          { code: 'XL', available: 0 },
        ],
        totalAvailable: 0,
        boxes: [],
        warning: 'No boxes found in database. Please sync with Bestwond or add boxes manually.',
      });
    }
    
    // Get all boxes and determine availability based on status
    const boxes = await db.box.findMany({
      select: {
        id: true,
        size: true,
        boxNumber: true,
        status: true,
        device: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
      },
    });

    // Group by size - AVAILABLE boxes only
    const sizeCounts: Record<string, number> = {
      S: 0,
      M: 0,
      L: 0,
      XL: 0,
    };

    let availableCount = 0;
    
    boxes.forEach((box) => {
      if (box.status === 'AVAILABLE') {
        availableCount++;
        const size = normalizeSize(box.size);
        sizeCounts[size]++;
      }
    });

    console.log('[Box Availability] Database stats:', {
      total: boxes.length,
      available: availableCount,
      sizeCounts,
      statuses: boxes.reduce((acc, b) => {
        acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });

    return NextResponse.json({
      success: true,
      source: 'database',
      sizes: Object.entries(sizeCounts).map(([code, available]) => ({
        code,
        available,
      })),
      totalAvailable: availableCount,
      boxes: boxes.filter(b => b.status === 'AVAILABLE').slice(0, 10).map(b => ({
        id: b.id,
        boxNumber: b.boxNumber,
        size: normalizeSize(b.size),
        rawSize: b.size,
        deviceName: b.device.name,
      })),
      warning: availableCount === 0 
        ? 'No available boxes found. All boxes may be occupied or in maintenance.'
        : undefined,
    });
  } catch (error) {
    console.error('Error fetching box availability:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch box availability',
        details: error instanceof Error ? error.message : 'Unknown error',
        sizes: [
          { code: 'S', available: 0 },
          { code: 'M', available: 0 },
          { code: 'L', available: 0 },
          { code: 'XL', available: 0 },
        ],
        totalAvailable: 0,
      },
      { status: 500 }
    );
  }
}
