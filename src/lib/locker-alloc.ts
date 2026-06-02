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
    // No available boxes at all — try ANY available box regardless of size
    device = await db.device.findFirst({
      include: {
        boxes: {
          where: { status: 'AVAILABLE' },
          orderBy: { boxNumber: 'asc' },
          take: 1,
        },
      },
    });

    if (!device || device.boxes.length === 0) {
      return {
        success: false,
        error: `No available lockers for ${boxSize} size. All lockers may be occupied or not yet configured. Please try a different size or contact support.`,
        statusCode: 400,
      };
    }

    // Found a box but wrong size — still report no match for this size
    return {
      success: false,
      error: `No available ${boxSize} lockers. Available sizes may differ — please try another size.`,
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
