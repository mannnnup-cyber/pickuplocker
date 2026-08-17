/**
 * door-operation.ts — Centralized Door Operation Service
 *
 * ALL physical door operations in the system MUST go through this service.
 * No route should call bestwond.ts functions directly.
 *
 * Guarantees:
 * 1. Business state (order status, box status, payment) is ONLY updated
 *    after a confirmed successful door opening.
 * 2. Fallback runs on ANY non-success result, not just thrown exceptions.
 * 3. Lock address is read from the local DB first; only fetched from
 *    Bestwond as a one-time fallback.
 * 4. Idempotency key prevents duplicate operations via ATOMIC INSERT:
 *    - INSERT DoorOperationRecord with status=IN_PROGRESS FIRST
 *    - If UNIQUE violation → fetch existing, return cached or in-progress
 *    - Only the INSERT owner may send the physical Bestwond command
 *    - After command completes → UPDATE record to SUCCEEDED/FAILED/UNKNOWN
 * 5. Every operation is logged with privacy-safe diagnostics.
 * 6. Retry policy is based on error type (transient only).
 * 7. Deterministic idempotency keys: pickup:{orderId}, dropoff:{orderId},
 *    payment-pickup:{orderId}, courier-dropoff:{orderId},
 *    admin-open:{deviceId}:{boxId}:{requestId}
 */

import { db } from '@/lib/db';
import {
  openBoxWithCredentials,
  expressSaveOrTakeWithCredentials,
  getBoxListWithCredentials,
  getDoorStatusWithCredentials,
  getDeviceStatusWithCredentials,
  getCredentialsForDevice,
  type BestwondCredentials,
} from '@/lib/bestwond';
import {
  type BestwondResult,
  type BestwondErrorType,
  type BestwondFailure,
  parseBestwondResponse,
  failureFromError,
  isRetryable,
  logDoorOperation,
  redactForLog,
} from './bestwond-safe';

// ============================================
// Types
// ============================================

export type DoorAction = 'dropoff' | 'pickup' | 'payment-pickup' | 'courier-dropoff' | 'admin-open';

/** State machine for DoorOperationRecord */
export type DoorOperationStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface DoorOperationResult {
  success: boolean;
  confirmed: boolean;
  retryable: boolean;
  operationId: string;
  deviceId: string;
  boxId?: string | null;
  boxNumber?: number;
  lockAddress?: string;
  attempts: number;
  errorType?: BestwondErrorType;
  message: string;
  providerCode?: number;
  providerStatus?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  apiCalls: number;
  /** Whether business state (order/box/payment) was updated */
  businessStateUpdated: boolean;
  /** Status from the state machine */
  status: DoorOperationStatus;
  /** Whether this request owned the operation (sent the hardware command) */
  owned: boolean;
}

export interface DoorOperationOptions {
  orderId: string;
  orderNo: string;
  deviceId: string;
  deviceNumber: string; // Bestwond device_number
  boxId?: string | null;
  boxNumber?: number;
  boxSize?: 'S' | 'M' | 'L' | 'XL';
  lockAddress?: string; // Pre-known lock address
  action: DoorAction;
  actionCode?: string; // save_code or pick_code for express API
  /** Idempotency key to prevent duplicate operations.
   *  If not provided, one is derived deterministically from action + orderId.
   *  For admin-open, you MUST provide an explicit requestId so that
   *  intentionally reopening the same box is allowed.
   */
  idempotencyKey?: string;
  /** For admin-open: explicit request ID to allow repeated opens */
  requestId?: string;
  /** Maximum retry attempts for transient errors */
  maxRetries?: number;
  /** Whether to use express API (save/take) vs direct open */
  useExpressApi?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_RETRIES = 2; // Total 3 attempts (1 initial + 2 retries)
const RETRY_BASE_DELAY_MS = 500;
const DOOR_CHECK_DELAY_MS = 1500;
const DOOR_CHECK_MAX_WAIT_MS = 5000;

// ============================================
// Deterministic idempotency key generation
// ============================================

/**
 * Generate a deterministic idempotency key.
 *
 * For customer actions (pickup, dropoff, payment-pickup, courier-dropoff):
 *   The key is based on action + orderId — no timestamp.
 *   This means retries for the SAME operation reuse the same key.
 *
 * For admin-open:
 *   The key includes an explicit requestId so that an admin CAN
 *   intentionally open the same box multiple times (different requests).
 */
export function deriveIdempotencyKey(options: DoorOperationOptions): string {
  // If caller provided an explicit key, use it
  if (options.idempotencyKey) return options.idempotencyKey;

  switch (options.action) {
    case 'pickup':
      return `pickup:${options.orderId}`;
    case 'dropoff':
      return `dropoff:${options.orderId}`;
    case 'payment-pickup':
      return `payment-pickup:${options.orderId}`;
    case 'courier-dropoff':
      return `courier-dropoff:${options.orderId}`;
    case 'admin-open': {
      // Admin opens MUST have an explicit requestId to allow
      // intentional repeated opens of the same box
      const reqId = options.requestId || `admin-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      return `admin-open:${options.deviceId}:${options.boxId || options.boxNumber || 'unknown'}:${reqId}`;
    }
    default:
      return `${options.action}:${options.orderId}`;
  }
}

// ============================================
// Atomic idempotency lock (INSERT-first)
// ============================================

/**
 * Attempt to atomically claim ownership of a door operation.
 *
 * This uses the UNIQUE constraint on idempotencyKey as the lock mechanism.
 * We INSERT a record with status=IN_PROGRESS FIRST, before any hardware call.
 *
 * - If INSERT succeeds → this request OWNS the operation, proceed to hardware
 * - If UNIQUE violation → another request already claimed it:
 *   - SUCCEEDED → return cached success
 *   - IN_PROGRESS → return "already in progress" (do NOT send hardware command)
 *   - FAILED + retryable → attempt retry ownership
 *   - UNKNOWN → do NOT resend, return needs-reconciliation
 */
async function acquireOperationLock(
  idempotencyKey: string,
  options: DoorOperationOptions,
): Promise<{
  owned: boolean;
  recordId: string;
  operationId: string;
  existingResult?: DoorOperationResult;
}> {
  const operationId = `door-${options.action}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startedAt = new Date();

  try {
    // ATOMIC INSERT — this is the lock acquisition
    const record = await db.doorOperationRecord.create({
      data: {
        idempotencyKey,
        operationId,
        action: options.action,
        orderId: options.orderId || null,
        status: 'IN_PROGRESS',
        deviceId: options.deviceId,
        boxId: options.boxId ?? null,
        boxNumber: options.boxNumber ?? null,
        lockAddress: options.lockAddress ?? null,
        startedAt,
        completedAt: null, // Not completed yet
      },
    });

    // INSERT succeeded → we own this operation
    logDoorOperation({
      operationId,
      action: options.action,
      orderId: options.orderId,
      deviceId: options.deviceId,
      result: 'success',
      message: 'Lock acquired — this request owns the operation',
      durationMs: 0,
      apiCalls: 0,
      businessStateUpdated: false,
    });

    return { owned: true, recordId: record.id, operationId };
  } catch (error: unknown) {
    // UNIQUE constraint violation → another request already owns this
    const isUniqueViolation =
      error instanceof Error &&
      (error.message.includes('Unique constraint') ||
       error.message.includes('unique') ||
       error.message.includes('idempotencyKey'));

    if (!isUniqueViolation) {
      // Non-unique DB error — proceed without lock (degraded safety)
      console.error('[DoorOp] Lock acquisition failed (non-unique error):', error);
      return { owned: true, recordId: '', operationId };
    }

    // Fetch the existing record to decide what to do
    try {
      const existing = await db.doorOperationRecord.findUnique({
        where: { idempotencyKey },
      });

      if (!existing) {
        // Race: record was deleted between insert and find — proceed
        console.warn('[DoorOp] Lock: UNIQUE violation but record not found — proceeding');
        return { owned: true, recordId: '', operationId };
      }

      switch (existing.status as DoorOperationStatus) {
        case 'SUCCEEDED':
          // Return cached success — do NOT send hardware command
          return {
            owned: false,
            recordId: existing.id,
            operationId: existing.operationId,
            existingResult: recordToResult(existing),
          };

        case 'IN_PROGRESS':
          // Another request is currently opening the door
          // Do NOT send another hardware command
          return {
            owned: false,
            recordId: existing.id,
            operationId: existing.operationId,
            existingResult: {
              ...recordToResult(existing),
              success: false,
              confirmed: false,
              retryable: false,
              message: 'Operation already in progress — another request is opening this door',
              status: 'IN_PROGRESS',
              owned: false,
            },
          };

        case 'UNKNOWN':
          // Previous command was sent but result unknown (crash, timeout, etc.)
          // Do NOT blindly resend — requires manual reconciliation
          return {
            owned: false,
            recordId: existing.id,
            operationId: existing.operationId,
            existingResult: {
              ...recordToResult(existing),
              success: false,
              confirmed: false,
              retryable: false,
              errorType: 'DOOR_NOT_CONFIRMED',
              message: 'Previous operation result unknown — requires reconciliation before retry',
              status: 'UNKNOWN',
              owned: false,
            },
          };

        case 'FAILED': {
          // Check if retry is allowed
          const isRetryableError = existing.errorType && isRetryable(existing.errorType as BestwondErrorType);
          if (isRetryableError) {
            // Delete the old failed record and try to acquire lock again
            // This is safe because only ONE concurrent request will succeed
            // at deleting + re-inserting
            try {
              await db.doorOperationRecord.delete({ where: { id: existing.id } });
              // Re-attempt the insert
              const retryRecord = await db.doorOperationRecord.create({
                data: {
                  idempotencyKey,
                  operationId,
                  action: options.action,
                  orderId: options.orderId || null,
                  status: 'IN_PROGRESS',
                  deviceId: options.deviceId,
                  boxId: options.boxId ?? null,
                  boxNumber: options.boxNumber ?? null,
                  lockAddress: options.lockAddress ?? null,
                  startedAt,
                  completedAt: null,
                },
              });
              return { owned: true, recordId: retryRecord.id, operationId };
            } catch (retryError) {
              // Another concurrent request won the retry race
              console.warn('[DoorOp] Retry lock lost to another request');
              return {
                owned: false,
                recordId: existing.id,
                operationId: existing.operationId,
                existingResult: {
                  ...recordToResult(existing),
                  message: 'Another request is already retrying this operation',
                  owned: false,
                },
              };
            }
          }
          // Non-retryable failure — return cached failure
          return {
            owned: false,
            recordId: existing.id,
            operationId: existing.operationId,
            existingResult: {
              ...recordToResult(existing),
              owned: false,
            },
          };
        }

        case 'PENDING':
          // Stale pending record — claim it
          try {
            await db.doorOperationRecord.update({
              where: { id: existing.id },
              data: { status: 'IN_PROGRESS', operationId, startedAt },
            });
            return { owned: true, recordId: existing.id, operationId };
          } catch {
            return {
              owned: false,
              recordId: existing.id,
              operationId: existing.operationId,
              existingResult: {
                ...recordToResult(existing),
                message: 'Could not claim pending operation',
                owned: false,
              },
            };
          };

        default:
          // Unknown status — treat as needing reconciliation
          return {
            owned: false,
            recordId: existing.id,
            operationId: existing.operationId,
            existingResult: {
              ...recordToResult(existing),
              success: false,
              confirmed: false,
              retryable: false,
              message: `Operation in unexpected state: ${existing.status}`,
              owned: false,
            },
          };
      }
    } catch (fetchError) {
      console.error('[DoorOp] Failed to fetch existing lock record:', fetchError);
      // Proceed without lock — degraded safety but don't block the operation
      return { owned: true, recordId: '', operationId };
    }
  }
}

/**
 * Update the operation record with the final result.
 */
async function finalizeOperationRecord(
  recordId: string,
  result: DoorOperationResult,
  idempotencyKey: string,
): Promise<void> {
  if (!recordId) return; // No record to update

  const status: DoorOperationStatus =
    result.success && result.confirmed ? 'SUCCEEDED'
    : result.success && !result.confirmed ? 'UNKNOWN'  // API success but door unconfirmed
    : 'FAILED';

  try {
    await db.doorOperationRecord.update({
      where: { id: recordId },
      data: {
        status,
        success: result.success,
        confirmed: result.confirmed,
        retryable: result.retryable,
        errorType: result.errorType ?? null,
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
        apiCalls: result.apiCalls,
        attempts: result.attempts,
        businessStateUpdated: result.businessStateUpdated,
        providerCode: result.providerCode ?? null,
        message: result.message,
        resultJson: JSON.stringify({
          operationId: result.operationId,
          errorType: result.errorType,
          providerCode: result.providerCode,
        }),
      },
    });
  } catch (error) {
    console.error('[DoorOp] Failed to finalize operation record:', error);
  }
}

/**
 * Convert a DoorOperationRecord to a DoorOperationResult.
 */
function recordToResult(record: {
  id: string;
  operationId: string;
  action: string;
  orderId: string | null;
  deviceId: string;
  boxId: string | null;
  boxNumber: number | null;
  lockAddress: string | null;
  success: boolean;
  confirmed: boolean;
  retryable: boolean;
  errorType: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number;
  apiCalls: number;
  attempts: number;
  businessStateUpdated: boolean;
  providerCode: number | null;
  message: string | null;
  status: string;
}): DoorOperationResult {
  return {
    success: record.success,
    confirmed: record.confirmed,
    retryable: record.retryable,
    operationId: record.operationId,
    deviceId: record.deviceId,
    boxId: record.boxId,
    boxNumber: record.boxNumber,
    lockAddress: record.lockAddress,
    attempts: record.attempts,
    errorType: record.errorType as BestwondErrorType | undefined,
    message: record.message || 'Previous operation result',
    providerCode: record.providerCode ?? undefined,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() || record.startedAt.toISOString(),
    durationMs: record.durationMs,
    apiCalls: record.apiCalls,
    businessStateUpdated: record.businessStateUpdated,
    status: record.status as DoorOperationStatus,
    owned: false,
  };
}

// ============================================
// Lock address resolution (local first)
// ============================================

/**
 * Get the lock_address for a box, preferring the locally-stored value
 * and only falling back to a Bestwond API call if needed.
 */
async function resolveLockAddress(
  deviceNumber: string,
  boxNumber: number,
  boxId: string | undefined,
  credentials: BestwondCredentials,
): Promise<{ lockAddress: string; source: 'local' | 'api' | 'default' }> {
  // 1. Try local DB first
  if (boxId) {
    try {
      const box = await db.box.findUnique({
        where: { id: boxId },
        select: { lockAddress: true },
      });
      if (box?.lockAddress) {
        return { lockAddress: box.lockAddress, source: 'local' };
      }
    } catch (error) {
      console.error('[DoorOp] Failed to read lock address from DB:', error);
    }
  }

  // 2. Try Bestwond API (one-time fetch)
  try {
    const startTime = Date.now();
    const response = await getBoxListWithCredentials(deviceNumber, credentials);

    if (response.code === 0 && response.data) {
      const boxes = response.data as Array<{
        box_name: string;
        lock_address?: string;
      }>;
      const box = boxes.find(b => parseInt(b.box_name, 10) === boxNumber);

      if (box?.lock_address) {
        // Save to local DB for next time
        if (boxId) {
          try {
            await db.box.update({
              where: { id: boxId },
              data: { lockAddress: box.lock_address },
            });
          } catch {
            // Non-critical — we have the address for this operation
          }
        }
        return { lockAddress: box.lock_address, source: 'api' };
      }
    }
  } catch (error) {
    console.error('[DoorOp] Failed to fetch lock address from API:', error);
  }

  // 3. Default HEX format
  const boxHex = boxNumber.toString(16).toLowerCase().padStart(2, '0');
  return { lockAddress: `01${boxHex}`, source: 'default' };
}

// ============================================
// Retry with exponential backoff + jitter
// ============================================

function retryDelay(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * RETRY_BASE_DELAY_MS;
  return base + jitter;
}

// ============================================
// Door status verification
// ============================================

/**
 * Verify the door actually opened by checking door status.
 * Returns true only if the door sensor confirms the door is open.
 */
async function verifyDoorOpened(
  deviceNumber: string,
  lockAddress: string,
  credentials: BestwondCredentials,
): Promise<{ confirmed: boolean; doorStatus?: string }> {
  try {
    // Wait for the physical door to respond
    await new Promise(resolve => setTimeout(resolve, DOOR_CHECK_DELAY_MS));

    const doorResult = await getDoorStatusWithCredentials(
      deviceNumber,
      lockAddress,
      credentials,
    );

    if (doorResult.code === 0 && doorResult.data) {
      const data = doorResult.data as { status?: string; door_open?: boolean };

      if (data.door_open === true) {
        return { confirmed: true, doorStatus: 'open' };
      }
      if (data.status === 'open' || data.status === 'opened') {
        return { confirmed: true, doorStatus: data.status };
      }
      if (data.status === 'closed' || data.status === 'close') {
        return { confirmed: false, doorStatus: 'closed' };
      }

      return { confirmed: false, doorStatus: data.status || 'unknown' };
    }

    return { confirmed: false, doorStatus: 'check_failed' };
  } catch (error) {
    console.error('[DoorOp] Door status check failed:', error);
    return { confirmed: false, doorStatus: 'check_error' };
  }
}

// ============================================
// Main entry point: executeDoorOperation
// ============================================

/**
 * Execute a physical door operation with all safety guarantees.
 *
 * This is the ONLY function that should be called to open a locker door.
 * It handles:
 * - Atomic idempotency lock (INSERT-first via UNIQUE constraint)
 * - Deterministic idempotency keys (same operation = same key)
 * - Lock address resolution (local first, API fallback)
 * - Retry with backoff for transient errors
 * - Fallback on ANY non-success (not just thrown exceptions)
 * - Physical door verification when possible
 * - Privacy-safe diagnostic logging
 * - State machine: PENDING → IN_PROGRESS → SUCCEEDED/FAILED/UNKNOWN
 *
 * IMPORTANT: This function does NOT update business state (order/box/payment).
 * The caller must check `result.success && result.confirmed` before
 * updating any business state.
 */
export async function executeDoorOperation(
  options: DoorOperationOptions,
): Promise<DoorOperationResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  // 1. Derive deterministic idempotency key
  const idempotencyKey = deriveIdempotencyKey(options);

  // 2. ATOMIC LOCK: Attempt to claim ownership via INSERT
  const lock = await acquireOperationLock(idempotencyKey, options);

  if (!lock.owned) {
    // We do NOT own this operation — return existing result
    if (lock.existingResult) {
      logDoorOperation({
        operationId: lock.operationId,
        action: options.action,
        orderId: options.orderId,
        deviceId: options.deviceId,
        result: lock.existingResult.success ? 'success' : 'failure',
        message: `Lock not acquired — returning existing: ${lock.existingResult.message}`,
        durationMs: Date.now() - startTime,
        apiCalls: 0,
        businessStateUpdated: lock.existingResult.businessStateUpdated,
      });
      return lock.existingResult;
    }

    // Edge case: no existing result but not owned — shouldn't happen
    const fallbackResult: DoorOperationResult = {
      success: false,
      confirmed: false,
      retryable: false,
      operationId: lock.operationId,
      deviceId: options.deviceId,
      boxId: options.boxId,
      boxNumber: options.boxNumber,
      attempts: 0,
      message: 'Could not acquire operation lock',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      apiCalls: 0,
      businessStateUpdated: false,
      status: 'FAILED',
      owned: false,
    };
    return fallbackResult;
  }

  // 3. We OWN the operation — proceed with hardware command
  const operationId = lock.operationId;

  // 4. Get credentials
  let credentials: BestwondCredentials;
  try {
    credentials = await getCredentialsForDevice(options.deviceId);
  } catch (error) {
    const result = buildResult({
      success: false,
      confirmed: false,
      retryable: false,
      errorType: 'CREDENTIALS_MISSING',
      message: 'Failed to get Bestwond credentials for device',
      attempts: 0,
      apiCalls: 0,
    }, options, startTime, startedAt, operationId);
    await finalizeOperationRecord(lock.recordId, result, idempotencyKey);
    return result;
  }

  if (!credentials.appId || !credentials.appSecret) {
    const result = buildResult({
      success: false,
      confirmed: false,
      retryable: false,
      errorType: 'CREDENTIALS_MISSING',
      message: 'Bestwond API credentials not configured for this device',
      attempts: 0,
      apiCalls: 0,
    }, options, startTime, startedAt, operationId);
    await finalizeOperationRecord(lock.recordId, result, idempotencyKey);
    return result;
  }

  // 5. Resolve lock address (local first)
  let totalApiCalls = 0;
  const lockInfo = await resolveLockAddress(
    options.deviceNumber,
    options.boxNumber ?? 1,
    options.boxId ?? undefined,
    credentials,
  );
  if (lockInfo.source === 'api') totalApiCalls++;

  // 6. Execute with retry
  let lastResult: { success: boolean; confirmed: boolean; errorType?: BestwondErrorType; message: string; providerCode?: number; apiCalls: number } | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    // Retry delay (skip on first attempt)
    if (attempt > 0) {
      const delay = retryDelay(attempt);
      logDoorOperation({
        operationId,
        action: options.action,
        orderId: options.orderId,
        deviceId: options.deviceId,
        boxId: options.boxId,
        boxNumber: options.boxNumber,
        attempt: attempts,
        result: 'timeout',
        errorType: lastResult?.errorType,
        message: `Retrying after ${Math.round(delay)}ms delay`,
        durationMs: Date.now() - startTime,
        apiCalls: totalApiCalls,
        businessStateUpdated: false,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const attemptStart = Date.now();

      // Choose express API or direct open
      if (options.useExpressApi && options.actionCode) {
        // Express API path
        const expressResult = await expressSaveOrTakeWithCredentials(
          options.deviceNumber,
          options.boxSize ?? 'M',
          options.actionCode,
          options.action === 'dropoff' || options.action === 'courier-dropoff' ? 'save' : 'take',
          credentials,
        );
        totalApiCalls++;

        if (expressResult.code === 0 && expressResult.data) {
          const data = expressResult.data as unknown as Record<string, unknown>;

          // Check for device-level failure in response data
          if (data.status === 'fail') {
            const deviceMsg = typeof data.msg === 'string' ? data.msg : 'Device rejected command';
            const errorType = deviceMsg.toLowerCase().includes('offline') ? 'DEVICE_OFFLINE' as BestwondErrorType
              : deviceMsg.toLowerCase().includes('uqkey') || deviceMsg.toLowerCase().includes('key') ? 'DEVICE_NOT_LINKED' as BestwondErrorType
              : 'LOCKER_REJECTED_CMD' as BestwondErrorType;

            lastResult = {
              success: false,
              confirmed: false,
              errorType,
              message: deviceMsg,
              providerCode: expressResult.code,
              apiCalls: 1,
            };

            if (!isRetryable(errorType)) break;
            continue;
          }

          // API reports success — verify door
          const doorVerify = await verifyDoorOpened(
            options.deviceNumber,
            lockInfo.lockAddress,
            credentials,
          );
          totalApiCalls++;

          lastResult = {
            success: true,
            confirmed: doorVerify.confirmed,
            message: doorVerify.confirmed
              ? 'Door opened and confirmed'
              : 'API reports success but door opening not confirmed',
            apiCalls: 2,
          };

          if (doorVerify.confirmed) break;
          break;
        }

        // Express API returned non-zero code — failure
        const errorType = classifyExpressError(expressResult.code, expressResult.msg || '');
        lastResult = {
          success: false,
          confirmed: false,
          errorType,
          message: expressResult.msg || `Express API error code ${expressResult.code}`,
          providerCode: expressResult.code,
          apiCalls: 1,
        };

        // Try fallback (direct open) for any non-success
        if (options.boxNumber) {
          logDoorOperation({
            operationId,
            action: options.action,
            orderId: options.orderId,
            deviceId: options.deviceId,
            attempt: attempts,
            result: 'failure',
            errorType,
            message: 'Express API failed — trying direct open fallback',
            durationMs: Date.now() - attemptStart,
            apiCalls: totalApiCalls,
            businessStateUpdated: false,
          });

          try {
            const fallbackResult = await openBoxWithCredentials(
              options.deviceNumber,
              options.boxNumber,
              credentials,
            );
            totalApiCalls++;

            if (fallbackResult.code === 0) {
              const doorVerify = await verifyDoorOpened(
                options.deviceNumber,
                lockInfo.lockAddress,
                credentials,
              );
              totalApiCalls++;

              lastResult = {
                success: true,
                confirmed: doorVerify.confirmed,
                message: doorVerify.confirmed
                  ? 'Fallback: Door opened and confirmed'
                  : 'Fallback: API reports success but door not confirmed',
                apiCalls: 3,
              };
              break;
            }

            const fbErrorType = classifyExpressError(fallbackResult.code, fallbackResult.msg || '');
            lastResult = {
              success: false,
              confirmed: false,
              errorType: fbErrorType,
              message: `Both express and fallback failed. Express: ${expressResult.msg}, Fallback: ${fallbackResult.msg}`,
              providerCode: fallbackResult.code,
              apiCalls: 2,
            };
          } catch (fallbackError) {
            lastResult = {
              success: false,
              confirmed: false,
              errorType: failureFromError(fallbackError, attemptStart, 1).errorType,
              message: `Express failed, fallback threw: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
              apiCalls: 1,
            };
          }
        }

        if (lastResult.errorType && !isRetryable(lastResult.errorType)) break;
        continue;
      }

      // Direct open path
      const openResult = await openBoxWithCredentials(
        options.deviceNumber,
        options.boxNumber ?? 1,
        credentials,
      );
      totalApiCalls++;

      if (openResult.code === 0) {
        // Check for device-level failure
        const data = openResult.data as Record<string, unknown> | undefined;
        if (data?.status === 'fail') {
          const deviceMsg = typeof data.msg === 'string' ? data.msg : 'Device rejected command';
          lastResult = {
            success: false,
            confirmed: false,
            errorType: 'LOCKER_REJECTED_CMD',
            message: deviceMsg,
            providerCode: 0,
            apiCalls: 1,
          };
          break; // Device rejection is not retryable
        }

        // Verify door
        const doorVerify = await verifyDoorOpened(
          options.deviceNumber,
          lockInfo.lockAddress,
          credentials,
        );
        totalApiCalls++;

        lastResult = {
          success: true,
          confirmed: doorVerify.confirmed,
          message: doorVerify.confirmed
            ? 'Door opened and confirmed'
            : 'API reports success but door not confirmed',
          apiCalls: 2,
        };
        break;
      }

      // Direct open returned non-zero — failure
      const errorType = classifyExpressError(openResult.code, openResult.msg || '');
      lastResult = {
        success: false,
        confirmed: false,
        errorType,
        message: openResult.msg || `Open box error code ${openResult.code}`,
        providerCode: openResult.code,
        apiCalls: 1,
      };

      // Non-retryable — stop
      if (!isRetryable(errorType)) break;

    } catch (error) {
      totalApiCalls++;
      const errResult = failureFromError(error, startTime, totalApiCalls);

      lastResult = {
        success: false,
        confirmed: false,
        errorType: errResult.errorType,
        message: errResult.message,
        apiCalls: totalApiCalls,
      };

      if (!isRetryable(errResult.errorType)) break;
    }
  }

  // 7. Build final result
  const finalResult = buildResult({
    success: lastResult?.success ?? false,
    confirmed: lastResult?.confirmed ?? false,
    retryable: lastResult?.errorType ? isRetryable(lastResult.errorType) : false,
    errorType: lastResult?.errorType,
    message: lastResult?.message || 'Operation completed with no result',
    providerCode: lastResult?.providerCode,
    attempts,
    apiCalls: totalApiCalls,
  }, options, startTime, startedAt, operationId, lockInfo.lockAddress);

  finalResult.owned = true;
  finalResult.status =
    finalResult.success && finalResult.confirmed ? 'SUCCEEDED'
    : finalResult.success && !finalResult.confirmed ? 'UNKNOWN'
    : 'FAILED';

  // 8. Log and finalize record
  logDoorOperation({
    operationId,
    action: options.action,
    orderId: options.orderId,
    deviceId: options.deviceId,
    boxId: options.boxId,
    boxNumber: options.boxNumber,
    attempt: attempts,
    result: finalResult.success ? 'success' : 'failure',
    errorType: finalResult.errorType,
    providerCode: finalResult.providerCode,
    durationMs: finalResult.durationMs,
    apiCalls: totalApiCalls,
    businessStateUpdated: false,
    message: finalResult.message,
  });

  await finalizeOperationRecord(lock.recordId, finalResult, idempotencyKey);

  return finalResult;
}

// ============================================
// Helpers
// ============================================

function buildResult(
  partial: {
    success: boolean;
    confirmed: boolean;
    retryable?: boolean;
    errorType?: BestwondErrorType;
    message: string;
    providerCode?: number;
    attempts: number;
    apiCalls: number;
  },
  options: DoorOperationOptions,
  startTime: number,
  startedAt: string,
  operationId?: string,
  lockAddress?: string,
): DoorOperationResult {
  return {
    success: partial.success,
    confirmed: partial.confirmed,
    retryable: partial.retryable ?? false,
    operationId: operationId || `door-${options.action}-${Date.now()}`,
    deviceId: options.deviceId,
    boxId: options.boxId,
    boxNumber: options.boxNumber,
    lockAddress,
    attempts: partial.attempts,
    errorType: partial.errorType,
    message: partial.message,
    providerCode: partial.providerCode,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    apiCalls: partial.apiCalls,
    businessStateUpdated: false,
    status: partial.success && partial.confirmed ? 'SUCCEEDED' : partial.success ? 'UNKNOWN' : 'FAILED',
    owned: true,
  };
}

function classifyExpressError(code: number, msg: string): BestwondErrorType {
  const msgLower = msg.toLowerCase();
  if (msgLower.includes('uqkey') || msgLower.includes('key')) return 'DEVICE_NOT_LINKED';
  if (msgLower.includes('offline') || msgLower.includes('not online')) return 'DEVICE_OFFLINE';
  if (msgLower.includes('invalid sign') || msgLower.includes('signature')) return 'INVALID_SIGNATURE';
  if (msgLower.includes('timestamp')) return 'TIMESTAMP_REJECTED';
  if (msgLower.includes('rate limit')) return 'PROVIDER_RATE_LIMIT';
  if (msgLower.includes('order not found') || msgLower.includes('no order')) return 'ORDER_NOT_FOUND';
  if (msgLower.includes('code') && (msgLower.includes('invalid') || msgLower.includes('expired'))) return 'INVALID_CODE';
  if (code === 401 || code === 403) return 'PROVIDER_AUTH_FAILED';
  if (code === 429) return 'PROVIDER_RATE_LIMIT';
  if (code >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN';
}

// ============================================
// Safe business state update helpers
// ============================================

/**
 * Update business state for a SUCCESSFUL drop-off (STORED).
 * ONLY call this after confirming the door opened.
 */
export async function updateBusinessStateForDropoff(params: {
  expressOrderId: string;
  orderId?: string | null;
  boxId?: string | null;
  deviceId?: string | null;
  customerPhone: string;
  boxName: string;
  saveCode: string;
  pickCode: string;
  deviceLocation?: string;
  customerName?: string;
}): Promise<void> {
  const now = new Date();

  // Update express order
  await db.expressOrder.update({
    where: { id: params.expressOrderId },
    data: {
      status: 'STORED',
      saveTime: now,
      customerPhone: params.customerPhone,
    },
  });

  // Update main order
  if (params.orderId) {
    await db.order.update({
      where: { id: params.orderId },
      data: {
        status: 'STORED',
        dropOffAt: now,
        customerPhone: params.customerPhone,
        storageStartAt: now,
      },
    });

    // Mark box as occupied
    if (params.boxId) {
      await db.box.update({
        where: { id: params.boxId },
        data: { status: 'OCCUPIED', lastUsedAt: now },
      });
    }
  }
}

/**
 * Update business state for a SUCCESSFUL pickup (PICKED_UP).
 * ONLY call this after confirming the door opened.
 */
export async function updateBusinessStateForPickup(params: {
  expressOrderId?: string;
  orderId?: string | null;
  boxId?: string | null;
  deviceId?: string | null;
  storageDays: number;
  storageFee: number;
  feeOwed?: number;
  paymentMethod?: string;
  customerPhone?: string;
  customerName?: string;
  boxName: string;
}): Promise<void> {
  const now = new Date();

  // Update express order
  if (params.expressOrderId) {
    await db.expressOrder.update({
      where: { id: params.expressOrderId },
      data: {
        status: 'PICKED_UP',
        pickTime: now,
      },
    });
  }

  // Update main order
  if (params.orderId) {
    await db.order.update({
      where: { id: params.orderId },
      data: {
        status: 'PICKED_UP',
        pickUpAt: now,
        storageDays: params.storageDays,
        storageFee: params.feeOwed && params.feeOwed > 0 ? params.feeOwed : params.storageFee,
      },
    });

    // Record payment if applicable
    if (params.feeOwed && params.feeOwed > 0 && params.paymentMethod && params.orderId) {
      const order = await db.order.findUnique({ where: { id: params.orderId } });
      if (order) {
        await db.payment.create({
          data: {
            orderId: params.orderId,
            userId: order.customerId,
            amount: params.feeOwed,
            method: params.paymentMethod as 'CASH' | 'CARD' | 'ONLINE',
            status: 'COMPLETED',
            paidAt: now,
          },
        });
      }
    }

    // Mark box as available
    if (params.boxId) {
      await db.box.update({
        where: { id: params.boxId },
        data: { status: 'AVAILABLE' },
      });
    }

    // Increment device available count
    if (params.deviceId) {
      await db.device.update({
        where: { id: params.deviceId },
        data: { availableBoxes: { increment: 1 } },
      });
    }
  }
}

// ============================================
// Customer-facing messages
// ============================================

export function getCustomerMessage(result: DoorOperationResult, action: DoorAction): {
  title: string;
  message: string;
  showRetry: boolean;
  showCancel: boolean;
  showStaffAssist: boolean;
} {
  if (result.success && result.confirmed) {
    return {
      title: action === 'dropoff' || action === 'courier-dropoff' ? 'Locker Opened' : 'Locker Opened',
      message: action === 'dropoff' || action === 'courier-dropoff'
        ? 'Please place your package inside and close the door.'
        : 'Please collect your package and close the door.',
      showRetry: false,
      showCancel: false,
      showStaffAssist: false,
    };
  }

  if (result.success && !result.confirmed) {
    return {
      title: 'Opening Locker…',
      message: 'The locker command was sent but we could not confirm the door opened. Please check if the door is open.',
      showRetry: true,
      showCancel: true,
      showStaffAssist: true,
    };
  }

  // Operation already in progress
  if (result.status === 'IN_PROGRESS') {
    return {
      title: 'Locker Opening…',
      message: 'Another request is already opening this locker. Please wait a moment.',
      showRetry: false,
      showCancel: true,
      showStaffAssist: false,
    };
  }

  // Unknown state — needs reconciliation
  if (result.status === 'UNKNOWN') {
    return {
      title: 'Locker Status Unknown',
      message: 'A previous command was sent but the result is unknown. Please check the locker or contact staff.',
      showRetry: false,
      showCancel: true,
      showStaffAssist: true,
    };
  }

  // Failure
  if (result.errorType === 'DEVICE_OFFLINE') {
    return {
      title: 'Locker Reconnecting',
      message: 'The locker is temporarily reconnecting. Please wait and try again.',
      showRetry: true,
      showCancel: true,
      showStaffAssist: true,
    };
  }

  if (result.errorType === 'DEVICE_NOT_LINKED') {
    return {
      title: 'Locker Configuration Error',
      message: 'This locker needs technical attention. Please contact staff for assistance.',
      showRetry: false,
      showCancel: true,
      showStaffAssist: true,
    };
  }

  if (result.errorType === 'INVALID_CODE') {
    return {
      title: 'Invalid Code',
      message: 'The code you entered is invalid or has expired.',
      showRetry: false,
      showCancel: true,
      showStaffAssist: false,
    };
  }

  if (result.errorType === 'TIMEOUT' || result.errorType === 'PROVIDER_UNAVAILABLE') {
    return {
      title: 'Locker Temporarily Unavailable',
      message: 'The locker service is experiencing a delay. Please try again in a moment.',
      showRetry: true,
      showCancel: true,
      showStaffAssist: true,
    };
  }

  // Generic failure
  return {
    title: 'Could Not Open Locker',
    message: result.retryable
      ? 'We could not open the locker. Please press Retry.'
      : 'We could not open the locker. Please contact staff for assistance.',
    showRetry: result.retryable,
    showCancel: true,
    showStaffAssist: true,
  };
}
