#!/usr/bin/env npx tsx
/**
 * Bestwond API Full Diagnostic
 * Tests every endpoint to pinpoint exactly which ones are working.
 *
 * Usage:
 *   npx tsx scripts/bestwond-diagnostic.ts
 *
 * Environment (REQUIRED — no hardcoded defaults):
 *   BESTWOND_APP_ID
 *   BESTWOND_APP_SECRET
 *   BESTWOND_DEVICE_ID
 *   BESTWOND_BASE_URL    (default: https://api.bestwond.com)
 */

import crypto from 'crypto';

// ============================================================
// CONFIGURATION — pull from env (REQUIRED, no hardcoded defaults)
// ============================================================
const APP_ID = process.env.BESTWOND_APP_ID;
const APP_SECRET = process.env.BESTWOND_APP_SECRET;
const DEVICE_ID = process.env.BESTWOND_DEVICE_ID;
const BASE_URL = process.env.BESTWOND_BASE_URL || 'https://api.bestwond.com';

if (!APP_ID || !APP_SECRET || !DEVICE_ID) {
  console.error('ERROR: BESTWOND_APP_ID, BESTWOND_APP_SECRET, and BESTWOND_DEVICE_ID environment variables are required.');
  console.error('Set them before running this script. Never hardcode API credentials.');
  process.exit(1);
}

// ============================================================
// HELPERS
// ============================================================
function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function generateSignature(params: Record<string, string | number>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  const stringToSign = encodedParams + secret;
  return crypto.createHash('sha512').update(stringToSign).digest('hex');
}

interface ApiResult {
  endpoint: string;
  method: string;
  success: boolean;
  httpStatus: number;
  code?: number;
  msg?: string;
  data?: unknown;
  durationMs: number;
  error?: string;
}

async function callApi(
  endpoint: string,
  params: Record<string, string | number>,
  label: string
): Promise<ApiResult> {
  const startTime = Date.now();
  const signature = generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}${endpoint}?sign=${signature}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker-Diagnostic/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text.substring(0, 500) };
    }

    const durationMs = Date.now() - startTime;
    const code = typeof data?.code === 'number' ? data.code : undefined;
    const msg = data?.msg || data?.data?.msg || '';
    const success = code === 0;

    return {
      endpoint: label,
      method: `POST ${endpoint}`,
      success,
      httpStatus: response.status,
      code,
      msg,
      data: data?.data,
      durationMs,
    };
  } catch (error) {
    return {
      endpoint: label,
      method: `POST ${endpoint}`,
      success: false,
      httpStatus: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// DIAGNOSTIC TESTS
// ============================================================
const tests: ApiResult[] = [];

async function runDiagnostics() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║         BESTWOND API — FULL DIAGNOSTIC TEST SUITE                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ CONFIGURATION                                                         │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Base URL    : ${BASE_URL.padEnd(54)}│`);
  console.log(`│ App ID      : ${APP_ID.padEnd(54)}│`);
  console.log(`│ App Secret  : ${(APP_SECRET.substring(0, 8) + '...' + APP_SECRET.substring(APP_SECRET.length - 6)).padEnd(54)}│`);
  console.log(`│ Device ID   : ${DEVICE_ID.padEnd(54)}│`);
  console.log(`│ Timestamp   : ${String(getTimestamp()).padEnd(54)}│`);
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Running tests...\n');

  // ─── Test 1: Device List ────────────────────────────────────────────────
  // Lists ALL devices linked to this app account
  tests.push(await callApi(
    '/api/iot/device/list/',
    { app_id: APP_ID, timestamps: getTimestamp() },
    '1. Device List (all devices linked to this app account)'
  ));

  // ─── Test 2: Device Online/Line Status ──────────────────────────────────
  tests.push(await callApi(
    '/api/iot/device/line/status/',
    { app_id: APP_ID, timestamps: getTimestamp(), device_number: DEVICE_ID },
    '2. Device Line Status (online/offline check)'
  ));

  // ─── Test 3: Box List ───────────────────────────────────────────────────
  tests.push(await callApi(
    '/api/iot/device/box/list/',
    { app_id: APP_ID, timestamps: getTimestamp(), device_number: DEVICE_ID },
    '3. Box List (all boxes on this device)'
  ));

  // ─── Test 4: Box Status for Box #1 ──────────────────────────────────────
  tests.push(await callApi(
    '/api/iot/device/box/status/',
    { app_id: APP_ID, timestamps: getTimestamp(), device_number: DEVICE_ID, lock_address: '0101' },
    '4. Box Status (door open/closed for box #1)'
  ));

  // ─── Test 5: Box Log for Box #1 ─────────────────────────────────────────
  tests.push(await callApi(
    '/api/iot/device/box/log/',
    {
      app_id: APP_ID,
      timestamps: getTimestamp(),
      device_number: DEVICE_ID,
      lock_address: '0101',
      page: 1,
      size: 5,
    },
    '5. Box Log (recent events for box #1)'
  ));

  // ─── Test 6: Open Box #1 (this is where it fails) ───────────────────────
  // NOTE: This actually tries to open the box. Comment out if you don't want
  // to physically attempt to open during testing.
  tests.push(await callApi(
    '/api/iot/open/box/',
    {
      app_id: APP_ID,
      timestamps: getTimestamp(),
      device_number: DEVICE_ID,
      lock_address: '0101',
      use_type: 'S',
    },
    '6. Open Box #1 (ACTUAL OPEN ATTEMPT — will trigger physical open if working)'
  ));

  // ─── Test 7: Sync Device List (alternate API path) ──────────────────────
  tests.push(await callApi(
    '/api/iot/sync/device/list/',
    { app_id: APP_ID, timestamps: getTimestamp() },
    '7. Sync Device List (alternate endpoint)'
  ));

  // ─── Print results ──────────────────────────────────────────────────────
  printResults();

  // ─── Print analysis ─────────────────────────────────────────────────────
  printAnalysis();
}

function printResults() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                         DETAILED RESULTS                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const t of tests) {
    const statusIcon = t.success ? '✅' : (t.error ? '❌' : '⚠️');
    console.log(`┌─ ${statusIcon} ${t.endpoint}`);
    console.log(`│  Endpoint  : ${t.method}`);
    console.log(`│  HTTP      : ${t.httpStatus}`);
    console.log(`│  Code      : ${t.code ?? 'N/A'}`);
    console.log(`│  Message   : ${t.msg || t.error || '(none)'}`);
    console.log(`│  Duration  : ${t.durationMs}ms`);
    if (t.data) {
      const dataStr = JSON.stringify(t.data);
      const trimmed = dataStr.length > 200 ? dataStr.substring(0, 200) + '...' : dataStr;
      console.log(`│  Data      : ${trimmed}`);
    }
    console.log('└────────────────────────────────────────────────────────────────────');
    console.log('');
  }
}

function printAnalysis() {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                          ANALYSIS                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Device list test
  const deviceList = tests[0];
  const lineStatus = tests[1];
  const boxList = tests[2];
  const openBox = tests[5];

  // Find which test shows "Device is not exists"
  const deviceNotExistTests = tests.filter(
    t => t.msg && t.msg.toLowerCase().includes('device') && t.msg.toLowerCase().includes('not')
  );

  console.log('── Diagnosis ──────────────────────────────────────────────────────────');
  console.log('');

  if (deviceList.success) {
    console.log('✓ Device List API works — your App ID is valid');
    const devices = Array.isArray(deviceList.data) ? deviceList.data : [];
    console.log(`  → Found ${devices.length} device(s) linked to this account`);
    if (devices.length > 0) {
      console.log('  → Linked devices:');
      devices.forEach((d: any, i: number) => {
        console.log(`      ${i + 1}. device_number: ${d.device_number || d.device_id || '?'}, name: ${d.device_name || '?'}`);
      });
      const match = devices.find((d: any) =>
        String(d.device_number || d.device_id) === String(DEVICE_ID)
      );
      if (match) {
        console.log(`  → ✅ Device ${DEVICE_ID} IS in the list`);
      } else {
        console.log(`  → ❌ Device ${DEVICE_ID} is NOT in the list!`);
        console.log('  → This means the device is not linked to this app account.');
        console.log('  → Contact Bestwond supplier to link it.');
      }
    }
  } else {
    console.log('✗ Device List API failed');
    console.log(`  → Error: ${deviceList.msg || deviceList.error}`);
    console.log('  → This means either the App ID/Secret is wrong, or the API is down.');
  }
  console.log('');

  if (lineStatus.success) {
    console.log('✓ Device Line Status works — device is reachable');
    console.log(`  → Status: ${JSON.stringify(lineStatus.data)}`);
  } else {
    console.log('✗ Device Line Status failed');
    console.log(`  → Error: ${lineStatus.msg || lineStatus.error}`);
    if (lineStatus.msg && lineStatus.msg.toLowerCase().includes('not exist')) {
      console.log('  → ⚠️  Bestwond says "Device is not exists" for this device_number');
      console.log('  → The device may have been unregistered or the device_number is wrong.');
    }
  }
  console.log('');

  if (boxList.success) {
    console.log('✓ Box List works — device returned box info');
    const boxes = Array.isArray(boxList.data) ? boxList.data : [];
    console.log(`  → Found ${boxes.length} boxes on this device`);
  } else {
    console.log('✗ Box List failed');
    console.log(`  → Error: ${boxList.msg || boxList.error}`);
  }
  console.log('');

  if (openBox.success) {
    console.log('✓ Open Box API call succeeded');
    console.log(`  → Response: ${JSON.stringify(openBox.data)}`);
    console.log('  → NOTE: Check if the physical box actually opened!');
    console.log('  → If API says success but box did NOT open, this is the "uqkey" issue');
    console.log('     documented previously — device is not linked properly.');
  } else {
    console.log('✗ Open Box API call failed');
    console.log(`  → Error: ${openBox.msg || openBox.error}`);
    if (openBox.msg && openBox.msg.toLowerCase().includes('not exist')) {
      console.log('  → ⚠️  This is the "Device is not exists" error you reported');
      console.log('  → Bestwond does not recognize this device_number.');
    }
  }
  console.log('');

  // ─── Summary & Next Steps ───────────────────────────────────────────────
  console.log('── Summary & Next Steps ──────────────────────────────────────────────');
  console.log('');

  if (deviceNotExistTests.length > 0) {
    console.log('🔍 Diagnosis: "Device is not exists" error detected');
    console.log('');
    console.log('The device number ' + DEVICE_ID + ' is NOT recognized by Bestwond.');
    console.log('This is NOT a code issue — the device needs to be re-registered');
    console.log('with Bestwond or the correct device number needs to be found.');
    console.log('');
    console.log('ACTION ITEMS:');
    console.log('  1. Contact your Bestwond supplier:');
    console.log('     - Ask: "Is device ' + DEVICE_ID + ' still registered?"');
    console.log('     - Ask: "Has it been linked to app ' + APP_ID + '?"');
    console.log('     - Ask for the CURRENT device_number if it has changed');
    console.log('');
    console.log('  2. If device list (test #1) returned devices, share those');
    console.log('     device numbers with the supplier to confirm which is yours.');
    console.log('');
    console.log('  3. Once you have the correct device_number, update it:');
    console.log('     - In Vercel: set BESTWOND_DEVICE_ID=<new_number>');
    console.log('     - In dashboard: Settings → Device → update device ID');
    console.log('     - Or run: npx tsx scripts/update-device-id.ts');
  } else if (deviceList.success && !openBox.success) {
    console.log('🔍 Diagnosis: API accepts credentials but box open fails');
    console.log('  → This is the previous "uqkey" issue — device needs to be');
    console.log('    properly linked to the app account by the supplier.');
  } else if (tests.every(t => t.success)) {
    console.log('🔍 Diagnosis: All tests passed — everything is working!');
  } else {
    console.log('🔍 Diagnosis: Mixed results — review individual test outputs above.');
  }
  console.log('');

  // ─── Save report to file ────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      appId: APP_ID,
      appSecret: APP_SECRET.substring(0, 8) + '...',
      deviceId: DEVICE_ID,
    },
    results: tests,
  };
  console.log('── Report saved ──────────────────────────────────────────────────────');
  console.log('Full JSON report saved to: download/bestwond-diagnostic-report.json');
  console.log('');
  console.log('Share this report with your Bestwond supplier for faster support.');
  console.log('');

  // Write report file
  const fs = require('fs');
  const path = require('path');
  const reportDir = path.join(process.cwd(), 'download');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'bestwond-diagnostic-report.json'),
    JSON.stringify(report, null, 2)
  );
}

runDiagnostics().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
