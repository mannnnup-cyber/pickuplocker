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
 * 4. Idempotency key prevents duplicate operations.
 * 5. Every operation is logged with privacy-safe diagnostics.
 * 6. Retry policy is based on error type (transient only).
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

export type DoorAction = 'dropoff' | 'pickup' | 'admin-open';

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
  /** Idempotency key to prevent duplicate operations */
  idempotencyKey: string;
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
// Idempotency check
// ============================================

/**
 * Check if this exact operation was already processed.
 * Returns the previous result if found, null otherwise.
 */
async function checkIdempotency(
  idempotencyKey: string,
): Promise<DoorOperationResult | null> {
  try {
    const existing = await db.boxLog.findFirst({
      where: {
        metadata: { contains: idempotencyKey },
        action: 'DOOR_OPERATION',
      },
      orderBy: { occurredAt: 'desc' },
    });

    if (existing && existing.metadata) {
      try {
        const parsed = JSON.parse(existing.metadata);
        if (parsed.idempotencyKey === idempotencyKey && parsed.result) {
          return parsed.result as DoorOperationResult;
        }
      } catch {
        // Malformed metadata, ignore
      }
    }
  } catch (error) {
    // DB error during idempotency check — proceed with operation
    console.error('[DoorOp] Idempotency check failed:', error);
  }

  return null;
}

/**
 * Record the operation result for idempotency.
 */
async function recordOperation(
  result: DoorOperationResult,
  idempotencyKey: string,
): Promise<void> {
  try {
    await db.boxLog.create({
      data: {
        boxId: result.boxId || 'unknown',
        deviceId: result.deviceId,
        action: 'DOOR_OPERATION',
        orderNo: result.operationId,
        occurredAt: new Date(),
        metadata: JSON.stringify({
          idempotencyKey,
          result,
        }),
      },
    });
  } catch (error) {
    console.error('[DoorOp] Failed to record operation:', error);
  }
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

    // getBoxListWithCredentials returns a BestwondResponse, not a raw Response
    // so we check it directly
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

      // Check multiple possible indicators of door being open
      if (data.door_open === true) {
        return { confirmed: true, doorStatus: 'open' };
      }
      if (data.status === 'open' || data.status === 'opened') {
        return { confirmed: true, doorStatus: data.status };
      }
      if (data.status === 'closed' || data.status === 'close') {
        return { confirmed: false, doorStatus: 'closed' };
      }

      // Status is ambiguous — not confirmed
      return { confirmed: false, doorStatus: data.status || 'unknown' };
    }

    // API error checking door status — inconclusive
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
 * - Idempotency (duplicate protection)
 * - Lock address resolution (local first, API fallback)
 * - Retry with backoff for transient errors
 * - Fallback on ANY non-success (not just thrown exceptions)
 * - Physical door verification when possible
 * - Privacy-safe diagnostic logging
 * - Recording the operation for audit
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
  const operationId = `door-${options.action}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // 1. Idempotency check
  const existing = await checkIdempotency(options.idempotencyKey);
  if (existing) {
    logDoorOperation({
      operationId,
      action: options.action,
      orderId: options.orderId,
      deviceId: options.deviceId,
      result: existing.success ? 'success' : 'failure',
      message: 'Duplicate operation — returning cached result',
      durationMs: Date.now() - startTime,
      apiCalls: 0,
      businessStateUpdated: existing.businessStateUpdated,
    });
    return existing;
  }

  // 2. Get credentials
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
    }, options, startTime, startedAt);
    await recordOperation(result, options.idempotencyKey);
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
    }, options, startTime, startedAt);
    await recordOperation(result, options.idempotencyKey);
    return result;
  }

  // 3. Resolve lock address (local first)
  let totalApiCalls = 0;
  const lockInfo = await resolveLockAddress(
    options.deviceNumber,
    options.boxNumber ?? 1,
    options.boxId ?? undefined,
    credentials,
  );
  if (lockInfo.source === 'api') totalApiCalls++;

  // 4. Execute with retry
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
          options.action === 'dropoff' ? 'save' : 'take',
          credentials,
        );
        totalApiCalls++;

        // Express API returns BestwondResponse (not raw Response)
        // We need to check it directly since parseBestwondResponse
        // requires a raw Response object
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

            // Non-retryable errors — stop immediately
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

          // If confirmed, we're done
          if (doorVerify.confirmed) break;

          // If not confirmed but API said success, still break (don't retry success)
          break;
        }

        // Express API returned non-zero code — this is a failure
        const errorType = classifyExpressError(expressResult.code, expressResult.msg || '');
        lastResult = {
          success: false,
          confirmed: false,
          errorType,
          message: expressResult.msg || `Express API error code ${expressResult.code}`,
          providerCode: expressResult.code,
          apiCalls: 1,
        };

        // Try fallback (direct open) for any non-success, not just exceptions
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

            // Fallback also failed
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

        // Non-retryable — stop
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

      // Non-retryable network errors — stop
      if (!isRetryable(errResult.errorType)) break;
    }
  }

  // 5. Build final result
  const finalResult = buildResult({
    success: lastResult?.success ?? false,
    confirmed: lastResult?.confirmed ?? false,
    retryable: lastResult?.errorType ? isRetryable(lastResult.errorType) : false,
    errorType: lastResult?.errorType,
    message: lastResult?.message || 'Operation completed with no result',
    providerCode: lastResult?.providerCode,
    attempts,
    apiCalls: totalApiCalls,
  }, options, startTime, startedAt, lockInfo.lockAddress);

  // 6. Log and record
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
    businessStateUpdated: false, // We never update business state here
    message: finalResult.message,
  });

  await recordOperation(finalResult, options.idempotencyKey);

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
  lockAddress?: string,
): DoorOperationResult {
  return {
    success: partial.success,
    confirmed: partial.confirmed,
    retryable: partial.retryable ?? false,
    operationId: `door-${options.action}-${Date.now()}`,
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
    businessStateUpdated: false, // Caller must update business state
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
      title: action === 'dropoff' ? 'Locker Opened' : 'Locker Opened',
      message: action === 'dropoff'
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
