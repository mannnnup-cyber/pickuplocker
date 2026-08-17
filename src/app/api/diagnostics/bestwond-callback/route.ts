/**
 * Bestwond Callback Diagnostic Endpoint
 *
 * POST /api/diagnostics/bestwond-callback
 *
 * This endpoint captures Bestwond door status callback notifications
 * for DIAGNOSTIC purposes only. It does NOT change any production
 * state (orders, boxes, payments).
 *
 * Bestwond sends callbacks with:
 *   device_id     — Device identifier
 *   lock_address  — Hardware lock address
 *   lock_status   — 0=open, 1=closed (to be verified)
 *   msg_style     — Message type
 *   order_no      — Order number (for express operations)
 *
 * CALLBACK PERSISTENCE:
 *   Vercel serverless logs are the AUTHORITATIVE capture mechanism.
 *   In-memory storage is unreliable on serverless because:
 *     - instances can restart at any time
 *     - POST and GET may hit different instances
 *     - the captured callback may disappear before retrieval
 *
 *   Every callback is logged with a diagnostic correlation ID
 *   that can be searched in Vercel logs. To match callbacks to a
 *   specific diagnostic run, include `?diag_id=<correlation-id>`
 *   in the GET request.
 *
 *   The in-memory cache is kept as a best-effort convenience only
 *   and may be empty or incomplete.
 *
 * SECURITY: This endpoint should be protected in production.
 * It only logs sanitized data — no credentials, no customer info.
 * It does NOT update orders, boxes, or payments.
 * It does NOT trigger any door operation.
 */

import { NextRequest, NextResponse } from 'next/server';

// Best-effort in-memory cache (UNRELIABLE on Vercel serverless)
// This may be empty if GET hits a different instance than POST.
// Vercel logs are the authoritative source.
const callbackCache: Array<{
  receivedAt: string;
  diagId?: string;
  payload: Record<string, unknown>;
}> = [];

const MAX_CACHE = 100;

// POST — Receive callback from Bestwond
export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();

  // Extract diagnostic correlation ID from query params (if provided)
  const { searchParams } = new URL(request.url);
  const diagId = searchParams.get('diag_id') || undefined;

  try {
    // Parse the callback payload
    let payload: Record<string, unknown>;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      // Bestwond may send form-encoded data
      const formData = await request.formData();
      payload = {};
      for (const [key, value] of formData.entries()) {
        payload[key] = value.toString();
      }
    }

    // Sanitize — remove any accidental secrets
    const REDACT_KEYS = new Set([
      'sign', 'signature', 'app_secret', 'appSecret', 'secret',
      'password', 'token', 'save_code', 'pick_code',
    ]);

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (REDACT_KEYS.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    // Best-effort in-memory cache (may be lost on serverless restart)
    const entry = { receivedAt, diagId, payload: sanitized };
    callbackCache.unshift(entry);
    if (callbackCache.length > MAX_CACHE) {
      callbackCache.pop();
    }

    // AUTHORITATIVE: Log to Vercel serverless logs with correlation ID
    // This is the durable capture mechanism.
    const logPayload = {
      source: 'BestwondCallback:DIAGNOSTIC',
      diagId: diagId || 'none',
      receivedAt,
      device_id: sanitized.device_id,
      lock_address: sanitized.lock_address,
      lock_status: sanitized.lock_status,
      msg_style: sanitized.msg_style,
      order_no: sanitized.order_no,
      all_keys: Object.keys(sanitized),
    };

    console.log(JSON.stringify(logPayload));

    // Return success to Bestwond (they expect 200 OK)
    return NextResponse.json({ code: 0, msg: 'ok' });

  } catch (error) {
    // Log error with correlation ID for Vercel log search
    console.error(JSON.stringify({
      source: 'BestwondCallback:DIAGNOSTIC',
      diagId: diagId || 'none',
      error: 'Failed to parse callback',
      message: error instanceof Error ? error.message : String(error),
      receivedAt,
    }));

    // Still return 200 to Bestwond so they don't retry
    return NextResponse.json({ code: 0, msg: 'received with error' });
  }
}

// GET — Retrieve captured callbacks (for diagnostic analysis)
// NOTE: In-memory cache is UNRELIABLE on Vercel serverless.
// The authoritative source is Vercel logs — search for the diag_id.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const diagId = searchParams.get('diag_id');

  // Filter by diagnostic ID if provided
  const filtered = diagId
    ? callbackCache.filter(e => e.diagId === diagId)
    : callbackCache;

  return NextResponse.json({
    totalCached: filtered.length,
    callbacks: filtered,
    persistence: 'Vercel serverless logs are the AUTHORITATIVE capture. In-memory cache is best-effort and may be empty on serverless.',
    instruction: diagId
      ? `Search Vercel logs for: "${diagId}" to find all callbacks for this diagnostic run.`
      : 'Include ?diag_id=<correlation-id> to filter and get Vercel log search instructions.',
    note: 'DIAGNOSTIC ONLY — these callbacks did NOT change any production state (orders, boxes, payments). No door operations were triggered.',
  });
}

// DELETE — Clear the in-memory cache
export async function DELETE() {
  const count = callbackCache.length;
  callbackCache.length = 0;
  return NextResponse.json({
    cleared: count,
    message: 'In-memory cache cleared. Vercel logs are not affected — search them for the diag_id to find historical callbacks.',
  });
}
