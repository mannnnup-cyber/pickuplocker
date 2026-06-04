/**
 * Locker Allocation - Database as Source of Truth
 *
 * The DB is the authoritative source for which boxes are available.
 * Bestwond API is used ONLY for physical operations (opening doors).
 *
 * Flow:
 * 1. Query DB for an AVAILABLE box matching the requested size
 * 2. Reserve it in DB (status → RESERVED) with a transaction
 * 3. Generate codes (saveCode, pickCode) locally
 * 4. Try Bestwond API to register the express order (for door-opening via codes)
 *    - If Bestwond succeeds: update with its box assignment and codes
 *    - If Bestwond fails: still proceed — box can be opened manually or via direct API
 * 5. Create ExpressOrder + Order records in DB
 *
 * AUTO-INIT: If no device/boxes exist in the DB, automatically creates a default
 * device with 36 boxes (10S + 10M + 10L + 6XL). This ensures the system works
 * out of the box even without running seed.
 */

import { db } from '@/lib/db';
import { generateOrderNumber, generateTrackingCode } from '@/lib/storage';
import { setSaveOrderWithCredentials, getCredentialsForDevice, type BestwondCredentials } from '@/lib/bestwond';

// Box sizes and their prices for drop-off credits (JMD)
export const BOX_PRICES: Record<string, number> = {
  S: 150,
  M: 200,
  L: 300,
  XL: 400,
};

export type BoxSize = 'S' | 'M' | 'L' | 'XL';

// Default box layout for a 36-box device
const DEFAULT_BOX_LAYOUT = [
  { size: 'S', count: 10 },   // Boxes 1-10
  { size: 'M', count: 10 },   // Boxes 11-20
  { size: 'L', count: 10 },   // Boxes 21-30
  { size: 'XL', count: 6 },   // Boxes 31-36
];

// Result of a successful locker allocation
export interface LockerAllocationResult {
  success: true;
  device: {
    id: string;
    deviceId: string;     // Bestwond device number
    name: string;
    location: string | null;
  };
  box: {
    id: string;
    boxNumber: number;
    size: string;
    lockAddress: string | null;
  };
  orderNo: string;
  saveCode: string;
  pickCode: string;
  bestwondRegistered: boolean;   // Whether Bestwond API was successfully called
  bestwondBoxName: string | null; // Box name from Bestwond (may differ from DB boxNumber)
}

// Error result
export interface LockerAllocationError {
  success: false;
  error: string;
  statusCode: number;
}

/**
 * Auto-initialize a default device with boxes if none exist.
 * This ensures the kiosk works out of the box without requiring seed.
 */
async function ensureDeviceAndBoxesExist(): Promise<void> {
  try {
    const deviceCount = await db.device.count();

    if (deviceCount > 0) {
      return; // Device already exists
    }

    console.log('[Locker Alloc] No devices found — auto-initializing default device with 36 boxes...');

    // Get Bestwond credentials from env
    const bestwondAppId = process.env.BESTWOND_APP_ID || '';
    const bestwondAppSecret = process.env.BESTWOND_APP_SECRET || '';
    const bestwondDeviceId = process.env.BESTWOND_DEVICE_ID || '2100018247';

    // Create default device
    const device = await db.device.create({
      data: {
        deviceId: bestwondDeviceId,
        name: 'Pickup Locker - Jamaica',
        location: 'Jamaica',
        description: 'Primary smart locker in Jamaica (auto-initialized)',
        totalBoxes: 36,
        availableBoxes: 36,
        status: 'ONLINE',
        bestwondAppId: bestwondAppId || null,
        bestwondAppSecret: bestwondAppSecret || null,
      },
    });

    // Create all 36 boxes
    let boxNumber = 1;
    for (const { size, count } of DEFAULT_BOX_LAYOUT) {
      for (let i = 0; i < count; i++) {
        await db.box.create({
          data: {
            deviceId: device.id,
            boxNumber,
            status: 'AVAILABLE',
            size,
          },
        });
        boxNumber++;
      }
    }

    console.log(`[Locker Alloc] Auto-init complete: device "${device.name}" (${device.id}) with 36 boxes created`);
  } catch (error) {
    console.error('[Locker Alloc] Auto-init failed:', error);
    // Don't throw — the allocation might still work if another process created the device
  }
}

/**
 * Allocate a locker from the database.
 *
 * This function:
 * 1. Finds an AVAILABLE box of the right size in the DB
 * 2. Reserves it atomically
 * 3. Generates codes locally
 * 4. Attempts Bestwond API registration (non-blocking)
 *
 * @param boxSize - S, M, L, or XL
 * @returns Allocation result or error
 */
export async function allocateLocker(
  boxSize: BoxSize
): Promise<LockerAllocationResult | LockerAllocationError> {
  // Validate box size
  if (!BOX_PRICES[boxSize]) {
    return {
      success: false,
      error: `Invalid box size. Must be S, M, L, or XL`,
      statusCode: 400,
    };
  }

  // Step 0: Auto-initialize device and boxes if DB is empty
  await ensureDeviceAndBoxesExist();

  // Step 1: Find a device with available boxes
  let device = await db.device.findFirst({
    where: {
      status: { in: ['ONLINE', 'OFFLINE'] }, // Accept both — DB is source of truth
      boxes: {
        some: {
          status: 'AVAILABLE',
          size: boxSize,
        },
      },
    },
    include: {
      boxes: {
        where: {
          status: 'AVAILABLE',
          size: boxSize,
        },
        orderBy: { boxNumber: 'asc' },
        take: 1,
      },
    },
  });

  // If no device with available boxes found, try any device at all
  if (!device || device.boxes.length === 0) {
    device = await db.device.findFirst({
      include: {
        boxes: {
          where: {
            status: 'AVAILABLE',
            size: boxSize,
          },
          orderBy: { boxNumber: 'asc' },
          take: 1,
        },
      },
    });
  }

  if (!device || device.boxes.length === 0) {
    // No available boxes of this size — check if any boxes exist at all
    const totalAvailable = await db.box.count({
      where: { status: 'AVAILABLE' },
    });

    if (totalAvailable === 0) {
      return {
        success: false,
        error: `All lockers are currently occupied. Please try again later or contact support.`,
        statusCode: 400,
      };
    }

    // Some boxes available but not in this size
    const availableSizes = await db.box.findMany({
      where: { status: 'AVAILABLE' },
      select: { size: true },
      distinct: ['size'],
    });
    const sizeList = availableSizes.map(b => b.size).filter(Boolean).join(', ');

    return {
      success: false,
      error: `No ${boxSize} lockers available. Available sizes: ${sizeList || 'none'}. Please try another size.`,
      statusCode: 400,
    };
  }

  const availableBox = device.boxes[0];

  // Step 2: Reserve the box atomically (prevent race conditions)
  try {
    await db.box.update({
      where: { id: availableBox.id },
      data: { status: 'RESERVED' },
    });
  } catch (updateError) {
    console.error('[Locker Alloc] Error reserving box:', updateError);
    return {
      success: false,
      error: 'Failed to reserve locker. Please try again.',
      statusCode: 500,
    };
  }

  // Step 3: Generate codes locally
  const orderNumber = generateOrderNumber();
  const saveCode = generateTrackingCode();
  const pickCode = generateTrackingCode();

  // Step 4: Try Bestwond API (non-blocking — don't fail if it's down)
  let bestwondRegistered = false;
  let bestwondBoxName: string | null = null;

  try {
    const credentials = await getCredentialsForDevice(device.id);

    if (credentials.appId && credentials.appSecret) {
      console.log(`[Locker Alloc] Attempting Bestwond registration: device=${device.deviceId}, order=${orderNumber}, size=${boxSize}`);

      const bestwondResult = await setSaveOrderWithCredentials(
        device.deviceId,
        orderNumber,
        boxSize,
        credentials
      );

      if (bestwondResult.code === 0 && bestwondResult.data) {
        bestwondRegistered = true;
        bestwondBoxName = bestwondResult.data.box_name || null;
        console.log(`[Locker Alloc] Bestwond registered successfully. Box: ${bestwondBoxName}`);
      } else {
        console.warn(`[Locker Alloc] Bestwond API returned error: ${bestwondResult.msg || 'Unknown'}. Proceeding with DB allocation.`);
      }
    } else {
      console.warn('[Locker Alloc] No Bestwond credentials configured. Proceeding with DB-only allocation.');
    }
  } catch (bestwondError) {
    console.warn('[Locker Alloc] Bestwond API error (non-fatal):', bestwondError instanceof Error ? bestwondError.message : bestwondError);
    // Continue — DB allocation is still valid
  }

  // Step 5: Update device available count
  try {
    await db.device.update({
      where: { id: device.id },
      data: {
        availableBoxes: { decrement: 1 },
      },
    });
  } catch (deviceError) {
    console.error('[Locker Alloc] Error updating device count:', deviceError);
  }

  return {
    success: true,
    device: {
      id: device.id,
      deviceId: device.deviceId,
      name: device.name,
      location: device.location,
    },
    box: {
      id: availableBox.id,
      boxNumber: availableBox.boxNumber,
      size: availableBox.size || boxSize,
      lockAddress: availableBox.lockAddress,
    },
    orderNo: orderNumber,
    saveCode,
    pickCode,
    bestwondRegistered,
    bestwondBoxName,
  };
}

/**
 * Get available box counts by size from the database.
 * Used for the kiosk UI to show which sizes are available.
 */
export async function getAvailableBoxCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = { S: 0, M: 0, L: 0, XL: 0 };

  try {
    // Auto-init if no boxes exist
    await ensureDeviceAndBoxesExist();

    const availableBoxes = await db.box.findMany({
      where: { status: 'AVAILABLE' },
      select: { size: true },
    });

    for (const box of availableBoxes) {
      const size = box.size?.toUpperCase() || 'M';
      if (counts[size] !== undefined) {
        counts[size]++;
      }
    }
  } catch (error) {
    console.error('[Locker Alloc] Error counting available boxes:', error);
  }

  return counts;
}

/**
 * Release a reserved box back to AVAILABLE if the order fails.
 * Call this to undo an allocation if something goes wrong after reserving.
 */
export async function releaseLocker(boxId: string): Promise<void> {
  try {
    await db.box.update({
      where: { id: boxId },
      data: { status: 'AVAILABLE' },
    });

    // Increment device available count
    const box = await db.box.findUnique({
      where: { id: boxId },
      select: { deviceId: true },
    });

    if (box) {
      await db.device.update({
        where: { id: box.deviceId },
        data: { availableBoxes: { increment: 1 } },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('[Locker Alloc] Error releasing box:', error);
  }
}
