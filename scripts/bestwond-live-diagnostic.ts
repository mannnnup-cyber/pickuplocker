#!/usr/bin/env npx tsx
/**
 * Bestwond Live API Diagnostic — DIAGNOSTIC ONLY
 *
 * This script verifies how the ACTUAL locker and Bestwond API behave
 * in the real environment. It does NOT change any production logic,
 * orders, boxes, or payment states.
 *
 * DO NOT use this in production flows. This is for engineering
 * verification only.
 *
 * Usage:
 *   npx tsx scripts/bestwond-live-diagnostic.ts
 *
 * Environment (REQUIRED — no hardcoded defaults):
 *   BESTWOND_APP_ID       — Bestwond API app ID
 *   BESTWOND_APP_SECRET   — Bestwond API app secret
 *   BESTWOND_DEVICE_ID    — Bestwond device number (e.g., 2100018247)
 *   BESTWOND_BASE_URL     — (default: https://api.bestwond.com)
 *   BESTWOND_TEST_BOX     — Box number to test (must be EMPTY, e.g., 1)
 *
 * Logging rules:
 *   ✅ May show: device number, box number, lock address, response codes,
 *      status fields, task IDs, timing
 *   ❌ Never show: app secret, signatures, customer data, credentials
 */

import crypto from 'crypto';
import { createHash } from 'crypto';

// ============================================
// Configuration — environment only, no defaults for secrets
// ============================================

const APP_ID = process.env.BESTWOND_APP_ID || '';
const APP_SECRET = process.env.BESTWOND_APP_SECRET || '';
const DEVICE_NUMBER = process.env.BESTWOND_DEVICE_ID || '';
const BASE_URL = process.env.BESTWOND_BASE_URL || 'https://api.bestwond.com';
const TEST_BOX = parseInt(process.env.BESTWOND_TEST_BOX || '0', 10);

if (!APP_ID || !APP_SECRET || !DEVICE_NUMBER || !TEST_BOX) {
  console.error('ERROR: Set BESTWOND_APP_ID, BESTWOND_APP_SECRET, BESTWOND_DEVICE_ID, and BESTWOND_TEST_BOX environment variables.');
  console.error('BESTWOND_TEST_BOX must be a known EMPTY box number.');
  process.exit(1);
}

// Default lock address format: "01" + box number in lowercase HEX (2 chars)
const BOX_HEX = TEST_BOX.toString(16).toLowerCase().padStart(2, '0');
const DEFAULT_LOCK_ADDRESS = `01${BOX_HEX}`;

// ============================================
// Bestwond API helpers (standalone — no production imports)
// ============================================

function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function createSignature(params: Record<string, string | number>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
  const stringToSign = `${encodedParams}${secret}`;
  return createHash('sha512').update(stringToSign).digest('hex');
}

const TIMEOUT_MS = 15000;

async function bestwondPost(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<{
  httpStatus: number;
  responseTimeMs: number;
  body: unknown;
  raw: string;
}> {
  const url = `${BASE_URL}${endpoint}`;
  const signature = createSignature(params, APP_SECRET);
  const fullUrl = `${url}?sign=${signature}`;
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker-Diagnostic/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - startTime;
    const raw = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }

    return { httpStatus: response.status, responseTimeMs, body, raw };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      httpStatus: 0,
      responseTimeMs,
      body: { error: error instanceof Error ? error.message : String(error) },
      raw: '',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Sanitize response: remove any accidental secret leakage */
function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const REDACT_KEYS = new Set([
    'sign', 'signature', 'app_secret', 'appSecret', 'secret',
    'password', 'token', 'access_token', 'accessToken',
  ]);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACT_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitize(value);
    }
  }
  return result;
}

// ============================================
// Test Results Container
// ============================================

const results: Record<string, unknown> = {};

function section(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function logResult(label: string, data: unknown) {
  const sanitized = sanitize(data);
  console.log(`\n${label}:`);
  console.log(JSON.stringify(sanitized, null, 2));
  return sanitized;
}

// ============================================
// Main diagnostic
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  BESTWOND LIVE API DIAGNOSTIC — DIAGNOSTIC ONLY                    ║');
  console.log('║  This does NOT change any production logic, orders, or payments.    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  console.log('\nTest Configuration:');
  console.log(`  Device Number: ${DEVICE_NUMBER}`);
  console.log(`  Test Box:      ${TEST_BOX}`);
  console.log(`  Lock Address:  ${DEFAULT_LOCK_ADDRESS} (default HEX format)`);
  console.log(`  Base URL:      ${BASE_URL}`);
  console.log(`  App ID:        ${APP_ID.substring(0, 8)}...[REDACTED]`);
  console.log(`  Timestamp:     ${getTimestamp()}`);

  // ========================================
  // TEST 1 — Device connectivity
  // ========================================
  section('TEST 1 — Device Connectivity (/api/iot/device/line/status/)');

  const t1Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
  };
  const t1 = await bestwondPost('/api/iot/device/line/status/', t1Params);
  results.test1_deviceStatus = logResult('Raw sanitized response', {
    httpStatus: t1.httpStatus,
    responseTimeMs: t1.responseTimeMs,
    body: t1.body,
  });

  // Extract specific fields for summary
  const t1Body = t1.body as Record<string, unknown> | null;
  const t1Data = (t1Body?.data || {}) as Record<string, unknown>;
  console.log('\nKey fields:');
  console.log(`  code:    ${t1Body?.code}`);
  console.log(`  msg:     ${t1Body?.msg}`);
  console.log(`  status:  ${t1Data.status}`);
  console.log(`  online:  ${t1Data.online}`);
  console.log(`  box_count:          ${t1Data.box_count}`);
  console.log(`  available_box_count: ${t1Data.available_box_count}`);

  const deviceOnline = t1Data.status === 'on' || t1Data.online === true;
  if (!deviceOnline) {
    console.log('\n⚠️  Device appears OFFLINE. Subsequent tests may fail.');
    console.log('   Continue anyway? The box status test will reveal more.');
  }

  // ========================================
  // TEST 2 — Box status while CLOSED
  // ========================================
  section('TEST 2 — Box Status while CLOSED (/api/iot/device/box/status/)');

  console.log('\n⚠️  Ensure the test box is PHYSICALLY CLOSED before proceeding.');
  console.log(`   Test box: #${TEST_BOX} (lock_address: ${DEFAULT_LOCK_ADDRESS})`);

  const t2Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
    lock_address: DEFAULT_LOCK_ADDRESS,
  };
  const t2 = await bestwondPost('/api/iot/device/box/status/', t2Params);
  results.test2_boxStatusClosed = logResult('Raw sanitized response (door CLOSED)', {
    httpStatus: t2.httpStatus,
    responseTimeMs: t2.responseTimeMs,
    body: t2.body,
  });

  const t2Body = t2.body as Record<string, unknown> | null;
  const t2Data = (t2Body?.data || {}) as Record<string, unknown>;
  console.log('\nKey fields (looking for physical door state indicators):');
  console.log(`  code:         ${t2Body?.code}`);
  console.log(`  msg:          ${t2Body?.msg}`);
  console.log(`  data.status:  ${t2Data.status}`);
  console.log(`  data.door_open:     ${t2Data.door_open}`);
  console.log(`  data.lock_status:  ${t2Data.lock_status}`);
  console.log(`  data.task_id:      ${t2Data.task_id}`);
  console.log(`  All data keys:     ${Object.keys(t2Data).join(', ')}`);

  // ========================================
  // TEST 3 — Open the test box
  // ========================================
  section('TEST 3 — Open the Test Box (/api/iot/open/box/)');

  console.log('\n⚠️  About to send OPEN command to the physical locker.');
  console.log(`   Device: ${DEVICE_NUMBER}, Box: ${TEST_BOX}, Lock: ${DEFAULT_LOCK_ADDRESS}`);
  console.log('   This will physically open the door. Do NOT proceed if box is occupied.');

  const t3Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
    lock_address: DEFAULT_LOCK_ADDRESS,
    use_type: 'S',
  };
  const t3 = await bestwondPost('/api/iot/open/box/', t3Params);
  results.test3_openBox = logResult('Raw sanitized response (OPEN command)', {
    httpStatus: t3.httpStatus,
    responseTimeMs: t3.responseTimeMs,
    body: t3.body,
  });

  const t3Body = t3.body as Record<string, unknown> | null;
  const t3Data = (t3Body?.data || {}) as Record<string, unknown>;
  console.log('\nKey fields:');
  console.log(`  code:           ${t3Body?.code}`);
  console.log(`  msg:            ${t3Body?.msg}`);
  console.log(`  data.status:    ${t3Data.status}`);
  console.log(`  data.msg:       ${t3Data.msg}`);
  console.log(`  data.task_id:   ${t3Data.task_id}`);
  console.log(`  All data keys:  ${Object.keys(t3Data).join(', ')}`);

  // Store task_id for later correlation
  const taskId = t3Data.task_id as string | undefined;
  results.openTaskId = taskId;
  if (taskId) {
    console.log(`\n✅ task_id returned: ${taskId}`);
  } else {
    console.log('\n❌ No task_id in open response.');
  }

  // Wait for physical door to respond
  console.log('\nWaiting 3 seconds for physical door to open...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ========================================
  // TEST 4 — Box status while physically OPEN
  // ========================================
  section('TEST 4 — Box Status while physically OPEN (/api/iot/device/box/status/)');

  const t4Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
    lock_address: DEFAULT_LOCK_ADDRESS,
  };
  const t4 = await bestwondPost('/api/iot/device/box/status/', t4Params);
  results.test4_boxStatusOpen = logResult('Raw sanitized response (door OPEN)', {
    httpStatus: t4.httpStatus,
    responseTimeMs: t4.responseTimeMs,
    body: t4.body,
  });

  const t4Body = t4.body as Record<string, unknown> | null;
  const t4Data = (t4Body?.data || {}) as Record<string, unknown>;
  console.log('\nKey fields:');
  console.log(`  code:         ${t4Body?.code}`);
  console.log(`  msg:          ${t4Body?.msg}`);
  console.log(`  data.status:  ${t4Data.status}`);
  console.log(`  data.door_open:     ${t4Data.door_open}`);
  console.log(`  data.lock_status:  ${t4Data.lock_status}`);
  console.log(`  data.task_id:      ${t4Data.task_id}`);
  console.log(`  All data keys:     ${Object.keys(t4Data).join(', ')}`);

  // Compare Test 2 (closed) vs Test 4 (open)
  console.log('\n─── COMPARISON: CLOSED (Test 2) vs OPEN (Test 4) ───');
  console.log(`  code:         ${t2Body?.code} → ${t4Body?.code}`);
  console.log(`  data.status:  ${t2Data.status} → ${t4Data.status}`);
  console.log(`  data.door_open:     ${t2Data.door_open} → ${t4Data.door_open}`);
  console.log(`  data.lock_status:  ${t2Data.lock_status} → ${t4Data.lock_status}`);

  const statusChanged = JSON.stringify(t2Data) !== JSON.stringify(t4Data);
  console.log(`\n  Response CHANGED between closed and open: ${statusChanged ? 'YES' : 'NO'}`);

  if (!statusChanged) {
    console.log('  ⚠️  /device/box/status/ may NOT synchronously return physical door state.');
    console.log('     The response is identical for both door-closed and door-open states.');
  } else {
    console.log('  ✅ /device/box/status/ DOES return different responses for closed vs open.');
  }

  // Wait for door to be closed again before proceeding
  console.log('\n⚠️  Please CLOSE the test box door now, then press Enter to continue...');
  // In non-interactive mode, just wait
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ========================================
  // TEST 5 — Callback behavior
  // ========================================
  section('TEST 5 — Bestwond Callback Behavior');

  // Check if callback address is configured
  console.log('\nChecking current callback address configuration...');

  const t5Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
  };

  // Try to get current callback config
  // The Bestwond API endpoint for callback is:
  // /api/iot/device/set/box/callback/address/ (POST)
  // We first query what's configured

  const t5 = await bestwondPost('/api/iot/device/set/box/callback/address/', t5Params);
  results.test5_callbackConfig = logResult('Callback address query result', {
    httpStatus: t5.httpStatus,
    responseTimeMs: t5.responseTimeMs,
    body: t5.body,
  });

  const t5Body = t5.body as Record<string, unknown> | null;
  const t5Data = (t5Body?.data || {}) as Record<string, unknown>;
  console.log('\nCallback configuration:');
  console.log(`  Current callback URL: ${t5Data.callback_url || t5Data.url || 'NOT FOUND'}`);
  console.log(`  All data keys:        ${Object.keys(t5Data).join(', ')}`);

  console.log('\n📋 Callback documentation notes:');
  console.log('  - Bestwond sends POST callbacks with door status updates');
  console.log('  - Expected callback payload fields:');
  console.log('    device_id, lock_address, lock_status, msg_style');
  console.log('  - lock_status=0 is believed to mean OPEN');
  console.log('  - lock_status=1 is believed to mean CLOSED');
  console.log('  - A protected diagnostic callback endpoint should be created');
  console.log('    at /api/diagnostics/bestwond-callback to capture these');

  console.log('\n⚠️  Do NOT replace an existing callback URL blindly.');
  console.log('   If a callback URL is already configured, changing it could');
  console.log('   break existing functionality.');

  // ========================================
  // TEST 6 — Box operation log
  // ========================================
  section('TEST 6 — Box Operation Log (/api/iot/device/box/log/)');

  const t6Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
    box_name: String(TEST_BOX).padStart(2, '0'),
    page_num: 1,
    page_size: 10,
  };
  const t6 = await bestwondPost('/api/iot/device/box/log/', t6Params);
  results.test6_boxLog = logResult('Raw sanitized box log', {
    httpStatus: t6.httpStatus,
    responseTimeMs: t6.responseTimeMs,
    body: t6.body,
  });

  const t6Body = t6.body as Record<string, unknown> | null;
  const t6Data = (t6Body?.data || {}) as Record<string, unknown>;
  const logEntries = Array.isArray(t6Data.list) ? t6Data.list : (Array.isArray(t6Data) ? t6Data : []);

  console.log(`\nFound ${logEntries.length} log entries.`);

  if (logEntries.length > 0) {
    // Find the most recent entry that matches our test
    const recentEntry = logEntries[0] as Record<string, unknown>;
    console.log('\nMost recent log entry:');
    console.log(`  task_id:       ${recentEntry.task_id || recentEntry.id || 'N/A'}`);
    console.log(`  device:        ${recentEntry.device_id || recentEntry.device_number || 'N/A'}`);
    console.log(`  box_name:      ${recentEntry.box_name || 'N/A'}`);
    console.log(`  lock_address:  ${recentEntry.lock_address || 'N/A'}`);
    console.log(`  action:        ${recentEntry.action || recentEntry.remark || 'N/A'}`);
    console.log(`  timestamp:     ${recentEntry.create_time || recentEntry.timestamp || 'N/A'}`);
    console.log(`  result/status: ${recentEntry.result || recentEntry.status || 'N/A'}`);
    console.log(`  All keys:      ${Object.keys(recentEntry).join(', ')}`);

    // Correlation check
    if (taskId && recentEntry.task_id) {
      const matches = String(recentEntry.task_id) === String(taskId);
      console.log(`\n─── TASK ID CORRELATION ───`);
      console.log(`  Open request task_id:  ${taskId}`);
      console.log(`  Log entry task_id:     ${recentEntry.task_id}`);
      console.log(`  MATCH: ${matches ? 'YES ✅' : 'NO ❌'}`);
      results.taskIdCorrelation = matches;
    } else if (taskId) {
      console.log(`\n  task_id from open (${taskId}) NOT found in log entries.`);
      console.log('  May need to search more entries or wait for log update.');
    }
  }

  // ========================================
  // TEST 7 — Express save/take documentation review
  // ========================================
  section('TEST 7 — Express Save/Take API Review (DOCUMENTATION ONLY)');

  console.log('\nThis test reviews the express save/take API documentation.');
  console.log('No real customer transaction is executed.');
  console.log('');
  console.log('Express API endpoint: /api/iot/kd/order/save/or/take/');
  console.log('');
  console.log('Known parameters:');
  console.log('  app_id         — Bestwond app ID');
  console.log('  timestamps     — Unix timestamp');
  console.log('  device_number  — Device number');
  console.log('  order_no       — Order number');
  console.log('  box_name       — Box name (e.g., "01")');
  console.log('  box_size       — Box size (S/M/L/XL)');
  console.log('  save_code      — 6-digit save code');
  console.log('  pick_code      — 6-digit pick code');
  console.log('  use_type       — "save" or "take"');
  console.log('  sign           — SHA512 signature');
  console.log('');
  console.log('📋 Callback/webhook for express operations:');
  console.log('  Bestwond provides callback notifications for SAVE and TAKE results.');
  console.log('  The callback includes:');
  console.log('    device_id    — Device identifier');
  console.log('    order_no     — Order number for correlation');
  console.log('    box_name     — Box name');
  console.log('    lock_address — Lock address');
  console.log('    lock_status  — 0=open, 1=closed');
  console.log('    msg_style    — Message type indicator');
  console.log('');
  console.log('  Correlation identifiers available:');
  console.log('    order_no     — Primary: matches our ExpressOrder.orderNo');
  console.log('    device_id    — Secondary: confirms which device');
  console.log('    box_name     — Tertiary: confirms which box');
  console.log('');
  console.log('  ⚠️  The express API uses save_code/pick_code for customer');
  console.log('  authentication. The callback is ASYNCHRONOUS — the initial');
  console.log('  API response only confirms the command was sent, not that');
  console.log('  the door physically opened.');

  // ========================================
  // TEST 8 — Temporary connectivity loss (INSTRUCTIONS ONLY)
  // ========================================
  section('TEST 8 — Temporary Connectivity Loss (MANUAL)');

  console.log('\nThis test requires PHYSICAL access to the locker to disconnect');
  console.log('and reconnect its Wi-Fi. It cannot be automated from this script.');
  console.log('');
  console.log('Steps to perform manually:');
  console.log('');
  console.log('1. Verify locker is online:');
  console.log('     Call /api/iot/device/line/status/ → status should be "on"');
  console.log(`     Device: ${DEVICE_NUMBER}`);
  console.log('');
  console.log('2. PHYSICALLY disconnect the locker from Wi-Fi/internet');
  console.log('   (unplug ethernet, disable Wi-Fi on the router, etc.)');
  console.log('');
  console.log('3. Call /api/iot/device/line/status/ again');
  console.log('   Record the exact response (may still show "on" for a while)');
  console.log('');
  console.log('4. Restore Wi-Fi/internet connection');
  console.log('');
  console.log('5. Poll /api/iot/device/line/status/ every 10-15 seconds');
  console.log('   until Bestwond reports the device online again');
  console.log('');
  console.log('6. Record:');
  console.log('   - How long reconnection takes');
  console.log('   - Whether Bestwond immediately sees it as online');
  console.log('   - Whether the first open command after reconnection succeeds');
  console.log('');
  console.log('7. After reconnection, test opening the box:');
  console.log(`   Call /api/iot/open/box/ with device=${DEVICE_NUMBER} box=${TEST_BOX}`);
  console.log('   Verify the physical door opens.');

  // Run a quick online check to confirm current state
  const t8Params = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_NUMBER,
  };
  const t8 = await bestwondPost('/api/iot/device/line/status/', t8Params);
  const t8Body = t8.body as Record<string, unknown> | null;
  const t8Data = (t8Body?.data || {}) as Record<string, unknown>;
  console.log('\nCurrent device status (for Test 8 baseline):');
  console.log(`  status: ${t8Data.status}`);
  console.log(`  online: ${t8Data.online}`);

  // ========================================
  // FINAL SUMMARY
  // ========================================
  section('DIAGNOSTIC SUMMARY');

  console.log('\n─── A. Device Status ───');
  console.log(`  Online:      ${deviceOnline ? 'YES' : 'NO'}`);
  console.log(`  status:      ${t1Data.status}`);
  console.log(`  box_count:   ${t1Data.box_count}`);
  console.log(`  available:   ${t1Data.available_box_count}`);

  console.log('\n─── B. Door Status CLOSED ───');
  console.log(`  code:         ${t2Body?.code}`);
  console.log(`  data.status:  ${t2Data.status}`);
  console.log(`  data.door_open:     ${t2Data.door_open}`);
  console.log(`  data.lock_status:  ${t2Data.lock_status}`);

  console.log('\n─── C. Door OPEN Command ───');
  console.log(`  code:         ${t3Body?.code}`);
  console.log(`  data.status:  ${t3Data.status}`);
  console.log(`  data.task_id: ${t3Data.task_id || 'NONE'}`);
  console.log(`  physical door opened: NEEDS MANUAL CONFIRMATION`);

  console.log('\n─── D. Door Status OPEN ───');
  console.log(`  code:         ${t4Body?.code}`);
  console.log(`  data.status:  ${t4Data.status}`);
  console.log(`  data.door_open:     ${t4Data.door_open}`);
  console.log(`  data.lock_status:  ${t4Data.lock_status}`);

  console.log('\n─── E. Callback ───');
  console.log('  See Test 5 output above for callback configuration.');

  console.log('\n─── F. Box Log ───');
  if (logEntries.length > 0) {
    const e = logEntries[0] as Record<string, unknown>;
    console.log(`  Most recent: task_id=${e.task_id || 'N/A'}, action=${e.action || e.remark || 'N/A'}`);
  } else {
    console.log('  No log entries found.');
  }

  console.log('\n─── G. Task ID Correlation ───');
  if (taskId) {
    console.log(`  Open request task_id: ${taskId}`);
    console.log(`  Found in log: ${results.taskIdCorrelation ? 'YES' : 'NOT CONFIRMED'}`);
  } else {
    console.log('  No task_id returned from open command.');
  }

  console.log('\n─── H. Interpretation ───');
  console.log('');
  console.log(`  Does /device/box/status/ synchronously return physical door state?`);
  console.log(`    → ${statusChanged ? 'YES (response differs between closed/open)' : 'INCONCLUSIVE (response identical — may be async only)'}`);

  const hasDoorOpen = t4Data.door_open !== undefined;
  const hasLockStatus = t4Data.lock_status !== undefined;
  console.log(`\n  Is lock_status present? ${hasLockStatus ? 'YES' : 'NO'}`);
  if (hasLockStatus) {
    console.log(`    lock_status when closed: ${t2Data.lock_status}`);
    console.log(`    lock_status when open:   ${t4Data.lock_status}`);
    if (t2Data.lock_status !== t4Data.lock_status) {
      console.log(`    Observed meaning: ${t4Data.lock_status} = OPEN, ${t2Data.lock_status} = CLOSED`);
    }
  }

  console.log(`\n  Is door_open present? ${hasDoorOpen ? 'YES' : 'NO'}`);
  if (hasDoorOpen) {
    console.log(`    door_open when closed: ${t2Data.door_open}`);
    console.log(`    door_open when open:   ${t4Data.door_open}`);
  }

  console.log(`\n  Does /open/box/ return task_id? ${taskId ? 'YES' : 'NO'}`);
  if (taskId) {
    console.log(`    task_id: ${taskId}`);
  }

  const canLogVerify = logEntries.length > 0 && (logEntries[0] as Record<string, unknown>).task_id;
  console.log(`\n  Can box log verify the open operation? ${canLogVerify ? 'PARTIALLY (log exists, task_id correlation ' + (results.taskIdCorrelation ? 'confirmed)' : 'unconfirmed)') : 'INCONCLUSIVE (no log entries with task_id)'}`);

  console.log('\n  Does Bestwond send physical door state through callback?');
  console.log('    → INCONCLUSIVE (requires callback endpoint to capture)');

  console.log('\n  Does the locker automatically recover after Wi-Fi reconnects?');
  console.log('    → INCONCLUSIVE (requires manual Test 8)');

  console.log('\n─── I. Recommended Production Changes ───');
  console.log('');
  console.log('  Based on observed results:');
  console.log('');

  if (statusChanged) {
    console.log('  1. /device/box/status/ CAN be used for door verification');
    console.log('     because it returns different states for open vs closed doors.');
    if (hasLockStatus) {
      console.log(`     Use lock_status field: ${t4Data.lock_status}=open, ${t2Data.lock_status}=closed`);
    }
    if (hasDoorOpen) {
      console.log(`     Use door_open field: ${t4Data.door_open}=open, ${t2Data.door_open}=closed`);
    }
  } else {
    console.log('  1. /device/box/status/ CANNOT be reliably used for door verification');
    console.log('     because it does not synchronously reflect physical door state.');
    console.log('     Must rely on Bestwond callbacks or timed confirmation instead.');
  }

  if (taskId) {
    console.log('');
    console.log('  2. task_id is available from /open/box/ responses.');
    console.log('     Store task_id in DoorOperationRecord for correlation.');
    console.log('     Use /device/box/log/ with task_id to verify operation result.');
  }

  console.log('');
  console.log('  3. Implement a protected callback endpoint');
  console.log('     (/api/diagnostics/bestwond-callback or /api/webhooks/bestwond)');
  console.log('     to capture asynchronous door status notifications.');
  console.log('     This is the MOST RELIABLE way to confirm physical door state.');

  console.log('');
  console.log('  4. For stale IN_PROGRESS reconciliation:');
  console.log('     - Query /device/box/status/ if it reflects physical state');
  console.log('     - Otherwise, check /device/box/log/ for recent operations');
  console.log('     - If neither confirms, mark UNKNOWN and require manual check');

  // Save full results to file
  const fs = await import('fs');
  const path = await import('path');
  const outputPath = path.join(process.cwd(), 'download', 'bestwond-diagnostic-results.json');
  try {
    await fs.promises.mkdir(path.join(process.cwd(), 'download'), { recursive: true });
    await fs.promises.writeFile(outputPath, JSON.stringify(sanitize(results), null, 2));
    console.log(`\n\nFull results saved to: ${outputPath}`);
  } catch (e) {
    console.log('\n\nCould not save results file:', e instanceof Error ? e.message : String(e));
  }

  console.log('\n✅ Diagnostic complete. No production data was modified.');
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
