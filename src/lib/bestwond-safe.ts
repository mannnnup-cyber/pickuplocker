/**
 * bestwond-safe.ts — Safe Bestwond response parser and structured errors
 *
 * Every Bestwond API call MUST go through this module's parseResponse().
 * No route should check `result.code === 0` directly.
 *
 * Structured error types allow callers to decide retry vs fail-fast.
 */

// ============================================
// Structured error types
// ============================================

export type BestwondErrorType =
  | 'TIMEOUT'               // Request timed out (15s)
  | 'DNS_FAILURE'           // Could not resolve api.bestwond.com
  | 'TLS_FAILURE'           // SSL/TLS handshake failed
  | 'INVALID_SIGNATURE'     // Signature generation or validation failed
  | 'TIMESTAMP_REJECTED'    // Server rejected our timestamp (clock drift)
  | 'CREDENTIALS_MISSING'   // appId or appSecret not configured
  | 'DEVICE_OFFLINE'        // Bestwond reports device is offline
  | 'DEVICE_NOT_LINKED'     // Device not linked to app account (uqkey error)
  | 'PROVIDER_UNAVAILABLE'  // Bestwond cloud returned 500/502/503/504
  | 'PROVIDER_RATE_LIMIT'   // Bestwond returned 429
  | 'PROVIDER_AUTH_FAILED'  // Bestwond returned 401/403
  | 'MALFORMED_RESPONSE'    // Response is not valid JSON
  | 'HTML_RESPONSE'         // Response is HTML instead of JSON
  | 'EMPTY_RESPONSE'        // Response body is empty
  | 'LOCKER_REJECTED_CMD'   // Device received command but rejected it
  | 'DOOR_NOT_CONFIRMED'    // Command accepted but door did not open
  | 'DUPLICATE_REQUEST'     // Same operation already processed
  | 'INVALID_LOCK_ADDRESS'  // lock_address is wrong or missing
  | 'INVALID_CODE'          // save_code or pick_code is invalid/expired
  | 'ORDER_NOT_FOUND'       // Order does not exist
  | 'BOX_NOT_FOUND'        // Box not found on device
  | 'NETWORK_ERROR'         // Generic network failure (abort, connection reset)
  | 'VERCEL_TIMEOUT'        // Vercel function terminated before completion
  | 'IDEMPOTENCY_LOCK_FAILED' // Database lock could not be acquired — NO hardware command sent
  | 'UNKNOWN';              // Catch-all

/** Whether this error type is transient and worth retrying */
export function isRetryable(errorType: BestwondErrorType): boolean {
  const retryable: Set<BestwondErrorType> = new Set([
    'TIMEOUT',
    'DNS_FAILURE',
    'TLS_FAILURE',
    'DEVICE_OFFLINE',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_RATE_LIMIT',
    'NETWORK_ERROR',
    'DOOR_NOT_CONFIRMED',  // Maybe door sensor lag
    'VERCEL_TIMEOUT',
  ]);
  return retryable.has(errorType);
}

/** Map HTTP status codes to structured error types */
function httpStatusToErrorType(status: number): BestwondErrorType {
  switch (status) {
    case 401:
    case 403:
      return 'PROVIDER_AUTH_FAILED';
    case 429:
      return 'PROVIDER_RATE_LIMIT';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'PROVIDER_UNAVAILABLE';
    case 408:
      return 'TIMEOUT';
    default:
      return 'PROVIDER_UNAVAILABLE';
  }
}

// ============================================
// Parsed result types
// ============================================

export interface BestwondSuccess<T = unknown> {
  ok: true;
  code: number;
  data: T;
  /** Whether the physical door opening was confirmed */
  confirmed: boolean;
  /** How many Bestwond API calls were made */
  apiCalls: number;
  /** Total duration in ms */
  durationMs: number;
}

export interface BestwondFailure {
  ok: false;
  code: number;
  errorType: BestwondErrorType;
  message: string;
  retryable: boolean;
  /** Partial data if available */
  partialData?: unknown;
  /** How many Bestwond API calls were made before failure */
  apiCalls: number;
  /** Total duration in ms */
  durationMs: number;
}

export type BestwondResult<T = unknown> = BestwondSuccess<T> | BestwondFailure;

// ============================================
// Response parser — THE single point of truth
// ============================================

/**
 * Parse a raw fetch Response from a Bestwond API call.
 *
 * This MUST be called on every Bestwond API response before any
 * route code inspects the result. It handles:
 * - HTTP status code checking (response.ok)
 * - JSON parsing errors
 * - HTML/empty response detection
 * - Bestwond-specific error codes (code !== 0)
 * - Device-level errors (status: "fail")
 *
 * Returns a discriminated union: { ok: true } | { ok: false }
 */
export async function parseBestwondResponse(
  response: Response,
  startTime: number,
  apiCalls: number = 1,
): Promise<BestwondResult> {
  const durationMs = Date.now() - startTime;

  // 1. Check HTTP status first
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let responseBody = '';

    try {
      responseBody = await response.text();
    } catch {
      // Can't even read the body
    }

    // Detect HTML response
    if (contentType.includes('text/html') || responseBody.trim().startsWith('<')) {
      return {
        ok: false,
        code: response.status,
        errorType: 'HTML_RESPONSE',
        message: `Bestwond returned HTML (${response.status}). Possible maintenance page.`,
        retryable: false,
        apiCalls,
        durationMs,
      };
    }

    // Empty response
    if (!responseBody.trim()) {
      return {
        ok: false,
        code: response.status,
        errorType: 'EMPTY_RESPONSE',
        message: `Bestwond returned empty response (${response.status})`,
        retryable: response.status >= 500, // Retry on server errors
        apiCalls,
        durationMs,
      };
    }

    // Try to parse as JSON for the error message
    try {
      const json = JSON.parse(responseBody);
      const errorType = httpStatusToErrorType(response.status);
      return {
        ok: false,
        code: response.status,
        errorType,
        message: json.msg || json.message || `Bestwond HTTP ${response.status}`,
        retryable: isRetryable(errorType),
        partialData: json,
        apiCalls,
        durationMs,
      };
    } catch {
      // Non-JSON error response
      const errorType = httpStatusToErrorType(response.status);
      return {
        ok: false,
        code: response.status,
        errorType,
        message: `Bestwond HTTP ${response.status}: ${responseBody.substring(0, 200)}`,
        retryable: isRetryable(errorType),
        apiCalls,
        durationMs,
      };
    }
  }

  // 2. Response is OK (2xx) — parse JSON
  let json: Record<string, unknown>;
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return {
      ok: false,
      code: 200,
      errorType: 'EMPTY_RESPONSE',
      message: 'Bestwond returned 200 OK with empty body',
      retryable: false,
      apiCalls,
      durationMs,
    };
  }

  try {
    json = JSON.parse(rawBody);
  } catch {
    // Check for HTML
    if (rawBody.trim().startsWith('<')) {
      return {
        ok: false,
        code: 200,
        errorType: 'HTML_RESPONSE',
        message: 'Bestwond returned HTML instead of JSON (200 OK)',
        retryable: false,
        apiCalls,
        durationMs,
      };
    }
    return {
      ok: false,
      code: 200,
      errorType: 'MALFORMED_RESPONSE',
      message: `Bestwond returned invalid JSON: ${rawBody.substring(0, 100)}`,
      retryable: false,
      apiCalls,
      durationMs,
    };
  }

  // 3. Check Bestwond business-level response code
  const bwCode = typeof json.code === 'number' ? json.code : -1;
  const bwMsg = typeof json.msg === 'string' ? json.msg : '';
  const bwData = json.data;

  if (bwCode !== 0) {
    // Bestwond reported an error
    const errorType = classifyBestwondError(bwCode, bwMsg, bwData);
    return {
      ok: false,
      code: bwCode,
      errorType,
      message: bwMsg || `Bestwond error code ${bwCode}`,
      retryable: isRetryable(errorType),
      partialData: bwData,
      apiCalls,
      durationMs,
    };
  }

  // 4. Check for device-level failure in nested data
  if (bwData && typeof bwData === 'object') {
    const dataObj = bwData as Record<string, unknown>;
    const deviceStatus = dataObj.status;
    const deviceMsg = typeof dataObj.msg === 'string' ? dataObj.msg : '';

    if (deviceStatus === 'fail') {
      const errorType = classifyDeviceError(deviceMsg);
      return {
        ok: false,
        code: 0,
        errorType,
        message: deviceMsg || 'Device rejected command',
        retryable: isRetryable(errorType),
        partialData: bwData,
        apiCalls,
        durationMs,
      };
    }
  }

  // 5. Success!
  return {
    ok: true,
    code: 0,
    data: bwData,
    confirmed: false, // Caller must verify door status separately
    apiCalls,
    durationMs,
  };
}

/**
 * Create a failure result from a thrown error (network/abort/timeout)
 */
export function failureFromError(
  error: unknown,
  startTime: number,
  apiCalls: number = 0,
): BestwondFailure {
  const durationMs = Date.now() - startTime;
  const message = error instanceof Error ? error.message : String(error);

  let errorType: BestwondErrorType = 'NETWORK_ERROR';

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      errorType = 'TIMEOUT';
    } else if (message.includes('ECONNREFUSED')) {
      errorType = 'PROVIDER_UNAVAILABLE';
    } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      errorType = 'DNS_FAILURE';
    } else if (message.includes('ECONNRESET') || message.includes('socket hang up')) {
      errorType = 'NETWORK_ERROR';
    } else if (message.includes('certificate') || message.includes('SSL') || message.includes('TLS')) {
      errorType = 'TLS_FAILURE';
    } else if (message.includes('timeout') || message.includes('Timeout')) {
      errorType = 'TIMEOUT';
    }
  }

  return {
    ok: false,
    code: 0,
    errorType,
    message,
    retryable: isRetryable(errorType),
    apiCalls,
    durationMs,
  };
}

// ============================================
// Internal helpers
// ============================================

function classifyBestwondError(
  code: number,
  msg: string,
  _data: unknown,
): BestwondErrorType {
  const msgLower = msg.toLowerCase();

  if (msgLower.includes('uqkey') || msgLower.includes('not linked') || msgLower.includes('device key')) {
    return 'DEVICE_NOT_LINKED';
  }
  if (msgLower.includes('offline') || msgLower.includes('not online')) {
    return 'DEVICE_OFFLINE';
  }
  if (msgLower.includes('invalid sign') || msgLower.includes('signature')) {
    return 'INVALID_SIGNATURE';
  }
  if (msgLower.includes('timestamp') || msgLower.includes('time expired')) {
    return 'TIMESTAMP_REJECTED';
  }
  if (msgLower.includes('rate limit') || msgLower.includes('too many')) {
    return 'PROVIDER_RATE_LIMIT';
  }
  if (code === 401 || code === 403) {
    return 'PROVIDER_AUTH_FAILED';
  }
  if (msgLower.includes('order not found') || msgLower.includes('no order')) {
    return 'ORDER_NOT_FOUND';
  }
  if (msgLower.includes('code') && (msgLower.includes('invalid') || msgLower.includes('expired'))) {
    return 'INVALID_CODE';
  }
  if (msgLower.includes('box') && msgLower.includes('not found')) {
    return 'BOX_NOT_FOUND';
  }

  return 'UNKNOWN';
}

function classifyDeviceError(deviceMsg: string): BestwondErrorType {
  const msgLower = deviceMsg.toLowerCase();

  if (msgLower.includes('uqkey') || msgLower.includes('key')) {
    return 'DEVICE_NOT_LINKED';
  }
  if (msgLower.includes('offline') || msgLower.includes('not online')) {
    return 'DEVICE_OFFLINE';
  }
  if (msgLower.includes('lock') || msgLower.includes('address')) {
    return 'INVALID_LOCK_ADDRESS';
  }

  return 'LOCKER_REJECTED_CMD';
}

// ============================================
// Privacy-safe logging
// ============================================

/** Fields that must NEVER appear in logs */
const SENSITIVE_FIELDS = new Set([
  'save_code', 'pick_code', 'action_code', 'saveCode', 'pickCode',
  'app_secret', 'appSecret', 'bestwondAppSecret',
  'pin', 'tempPin', 'pinHash', 'passwordHash',
  'card_token', 'cardToken', 'secretKey', 'secret_key',
  'sign', 'signature',
  'payment_token', 'paymentToken',
  'access_token', 'accessToken',
]);

/**
 * Redact sensitive fields from an object for logging.
 * Returns a new object — never mutates the original.
 */
export function redactForLog(obj: unknown, depth: number = 0): unknown {
  if (depth > 3) return '[max depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactForLog(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      if (typeof value === 'string' && value.length > 0) {
        redacted[key] = value.substring(0, 4) + '***REDACTED***';
      } else {
        redacted[key] = '***REDACTED***';
      }
    } else {
      redacted[key] = redactForLog(value, depth + 1);
    }
  }
  return redacted;
}

/**
 * Privacy-safe structured log for door operations.
 * Never logs access codes, customer phones, or credentials.
 */
export function logDoorOperation(event: {
  operationId: string;
  action: string;
  orderId?: string | null;
  deviceId?: string;
  boxId?: string | null;
  boxNumber?: number;
  attempt?: number;
  result: 'success' | 'failure' | 'timeout' | 'unknown';
  errorType?: BestwondErrorType;
  providerCode?: number;
  durationMs?: number;
  apiCalls?: number;
  businessStateUpdated?: boolean;
  message?: string;
}): void {
  // Explicitly do NOT log: access codes, customer phone, credentials
  console.log('[DoorOp]', JSON.stringify({
    ...event,
    // Ensure no sensitive fields leak
    timestamp: new Date().toISOString(),
  }));
}
