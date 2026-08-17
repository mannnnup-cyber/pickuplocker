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
 * All received callbacks are stored in memory (lost on server restart)
 * and can be retrieved via GET for analysis.
 *
 * SECURITY: This endpoint should be protected in production.
 * It only logs sanitized data — no credentials, no customer info.
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory callback storage (diagnostic only — lost on restart)
const callbackLog: Array<{
  receivedAt: string;
  payload: Record<string, unknown>;
}> = [];

const MAX_CALLBACK_LOG = 100;

// POST — Receive callback from Bestwond
export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();

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

    // Log the callback
    const entry = { receivedAt, payload: sanitized };
    callbackLog.unshift(entry);
    if (callbackLog.length > MAX_CALLBACK_LOG) {
      callbackLog.pop();
    }

    // Log to console (sanitized)
    console.log('[BestwondCallback:DIAGNOSTIC]', JSON.stringify({
      receivedAt,
      device_id: sanitized.device_id,
      lock_address: sanitized.lock_address,
      lock_status: sanitized.lock_status,
      msg_style: sanitized.msg_style,
      order_no: sanitized.order_no,
      all_keys: Object.keys(sanitized),
    }));

    // Return success to Bestwond (they expect 200 OK)
    return NextResponse.json({ code: 0, msg: 'ok' });

  } catch (error) {
    console.error('[BestwondCallback:DIAGNOSTIC] Error parsing callback:', error);

    // Still return 200 to Bestwond so they don't retry
    return NextResponse.json({ code: 0, msg: 'received with error' });
  }
}

// GET — Retrieve captured callbacks (for diagnostic analysis)
export async function GET() {
  return NextResponse.json({
    totalCallbacks: callbackLog.length,
    callbacks: callbackLog,
    note: 'DIAGNOSTIC ONLY — these callbacks did NOT change any production state. Storage is in-memory (lost on server restart).',
  });
}

// DELETE — Clear the callback log
export async function DELETE() {
  const count = callbackLog.length;
  callbackLog.length = 0;
  return NextResponse.json({
    cleared: count,
    message: 'Callback log cleared.',
  });
}
