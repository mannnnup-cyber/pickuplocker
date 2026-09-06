/**
 * Regression test for the `openBoxWithCredentials` lockAddress ReferenceError.
 *
 * Background:
 *   On 2026-09-05, a controlled DHD courier dropoff test failed in production
 *   with the message:
 *     "Express failed, fallback threw: lockAddress is not defined"
 *   Root cause: src/lib/bestwond.ts openBoxWithCredentials() declared
 *   `defaultLockAddress` but never declared `lockAddress`. When the DB
 *   lookup succeeded (which it does for production boxes that have a
 *   stored lockAddress), the assignment to the undeclared `lockAddress`
 *   threw a ReferenceError, which propagated up through door-operation.ts
 *   and was misclassified as errorType=NETWORK_ERROR.
 *
 * These tests verify:
 *   1. The function does NOT throw "lockAddress is not defined" when the
 *      DB has a stored lockAddress (this was the production-failure case).
 *   2. The function uses the DB-stored lockAddress (e.g., "0105" for box 5)
 *      when present — and passes it through to the underlying fetch.
 *   3. The function falls back to the Bestwond box-list API when the DB
 *      has no stored lockAddress.
 *   4. The function uses the default derived lockAddress when neither DB
 *      nor API provides one.
 *   5. The function does NOT introduce an extra Bestwond API call when the
 *      DB has a stored lockAddress (the hot path).
 *   6. Box 5's lockAddress cannot be accidentally substituted for box 7's
 *      lockAddress (i.e., the function uses the correct box's stored value).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Shared mutable test state — captures the params passed to the
// underlying fetch so we can assert on which lock_address was used.
// ============================================

const testState = vi.hoisted(() => {
  let lastFetchUrl: string | null = null;
  let lastFetchBody: any = null;
  let fetchCallCount = 0;
  let boxListCallCount = 0;
  // Per-box DB rows, keyed by boxNumber. Each value is the lockAddress
  // (or null/undefined if not stored).
  let dbBoxes: Map<number, string | null> = new Map();
  // Per-device DB rows, keyed by deviceId (the Bestwond device_number string).
  let dbDevices: Map<string, string> = new Map();
  // What the Bestwond box-list API returns for each device.
  let apiBoxList: Map<string, Array<{ box_name: string; lock_address: string }>> = new Map();

  return {
    getLastFetchUrl: () => lastFetchUrl,
    getLastFetchBody: () => lastFetchBody,
    getFetchCallCount: () => fetchCallCount,
    getBoxListCallCount: () => boxListCallCount,
    setDbBox: (boxNumber: number, lockAddress: string | null) => dbBoxes.set(boxNumber, lockAddress),
    setDbDevice: (deviceId: string, internalId: string) => dbDevices.set(deviceId, internalId),
    setApiBoxList: (deviceId: string, boxes: Array<{ box_name: string; lock_address: string }>) => apiBoxList.set(deviceId, boxes),
    getDbBox: (boxNumber: number) => dbBoxes.get(boxNumber),
    getDbDevice: (deviceId: string) => dbDevices.get(deviceId),
    getApiBoxList: (deviceId: string) => apiBoxList.get(deviceId),
    reset: () => {
      lastFetchUrl = null;
      lastFetchBody = null;
      fetchCallCount = 0;
      boxListCallCount = 0;
      dbBoxes = new Map();
      dbDevices = new Map();
      apiBoxList = new Map();
    },
    recordFetch: (url: string, body: any) => {
      lastFetchUrl = url;
      lastFetchBody = body;
      fetchCallCount++;
      // Distinguish box-list calls from open calls by URL path.
      if (url.includes('/api/iot/device/box/list/')) {
        boxListCallCount++;
      }
    },
  };
});

// ============================================
// Mocks for '@/lib/db' and global.fetch
// ============================================

vi.mock('@/lib/db', () => ({
  db: {
    device: {
      findFirst: async (args: any) => {
        const internalId = testState.getDbDevice(args.where.deviceId);
        return internalId ? { id: internalId } : null;
      },
    },
    box: {
      findFirst: async (args: any) => {
        // The real query is by deviceId + boxNumber. We only need the
        // lockAddress field. We model device internalId <-> deviceNumber
        // mapping via the dbDevices map (keyed by deviceNumber).
        const lockAddress = testState.getDbBox(args.where.boxNumber);
        // If the test setup explicitly set the lockAddress to null, return
        // a box with null lockAddress (treat as "stored but empty"). If
        // undefined (key wasn't set), return null box (no row found).
        if (lockAddress === undefined) return null;
        return { lockAddress };
      },
      updateMany: async () => ({ count: 1 }),
    },
  },
}));

// Mock global.fetch — capture all outbound calls. Returns
// Bestwond-shaped responses appropriate to the endpoint:
//   - /api/iot/device/box/list/ → { code:0, msg:'...', data: [<boxes from testState>] }
//   - /api/iot/open/box/        → { code:0, msg:'...', data: { status:'success' } }
//   - any other URL             → generic success response
const originalFetch = global.fetch;
beforeEach(() => {
  testState.reset();
  (global as any).fetch = vi.fn(async (url: string, options: any) => {
    testState.recordFetch(url, options?.body ? JSON.parse(options.body) : null);

    if (url.includes('/api/iot/device/box/list/')) {
      // Extract device_number from the request body
      const body = options?.body ? JSON.parse(options.body) : {};
      const deviceNumber = body.device_number;
      const boxes = testState.getApiBoxList(deviceNumber) || [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, msg: 'Operation successful', data: boxes }),
        text: async () => JSON.stringify({ code: 0, msg: 'Operation successful', data: boxes }),
      } as Response;
    }

    // Default: any other endpoint returns a generic Bestwond success response
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'Operation successful', data: { status: 'success' } }),
      text: async () => JSON.stringify({ code: 0, msg: 'Operation successful', data: { status: 'success' } }),
    } as Response;
  });
});

afterEach(() => {
  (global as any).fetch = originalFetch;
});

// ============================================
// Import the function under test AFTER mocks are set up.
// ============================================
import { openBoxWithCredentials } from '@/lib/bestwond';

// ============================================
// Helpers
// ============================================

const CREDENTIALS = {
  appId: 'test-app-id',
  appSecret: 'test-app-secret',
  baseUrl: 'https://api.bestwond.com',
};

/** Set up a DB where box 5 has lockAddress 0105 (the production-failure scenario). */
function setupBox5InDb() {
  testState.setDbDevice('2100018247', 'device1');
  testState.setDbBox(5, '0105');
}

/** Set up a DB where box 7 has lockAddress 0107. */
function setupBox7InDb() {
  testState.setDbDevice('2100018247', 'device1');
  testState.setDbBox(7, '0107');
}

// ============================================
// Tests
// ============================================

describe('openBoxWithCredentials — lockAddress regression (ReferenceError fix)', () => {

  it('does NOT throw "lockAddress is not defined" when DB has stored lockAddress', async () => {
    // This is the production-failure case: DB has box 5's lockAddress = '0105'.
    setupBox5InDb();

    let thrownError: Error | null = null;
    try {
      const result = await openBoxWithCredentials('2100018247', 5, CREDENTIALS);
      // If we got here, no ReferenceError was thrown.
      expect(result.code).toBe(0);
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).toBeNull();
    // Explicit assertion: no "lockAddress is not defined" error.
    if (thrownError) {
      expect(thrownError.message).not.toContain('lockAddress is not defined');
    }
  });

  it('uses the DB-stored lockAddress "0105" for box 5 (not the default "0105")', async () => {
    setupBox5InDb();

    await openBoxWithCredentials('2100018247', 5, CREDENTIALS);

    const body = testState.getLastFetchBody();
    expect(body).not.toBeNull();
    expect(body.lock_address).toBe('0105');
  });

  it('uses the DB-stored lockAddress "010a" for box 10 (would have been "010a" by default too)', async () => {
    testState.setDbDevice('2100018247', 'device1');
    testState.setDbBox(10, '010a');

    await openBoxWithCredentials('2100018247', 10, CREDENTIALS);

    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('010a');
  });

  it('does NOT call the Bestwond box-list API when DB has a stored lockAddress (hot path)', async () => {
    // The fix should NOT introduce an extra API call. The pre-bug intent was
    // that when the DB has a stored lockAddress, we skip the box-list fetch.
    setupBox5InDb();

    await openBoxWithCredentials('2100018247', 5, CREDENTIALS);

    // We should make exactly 1 fetch — the open/box call. NOT 2 (which would
    // include a box-list fetch).
    expect(testState.getFetchCallCount()).toBe(1);
    expect(testState.getBoxListCallCount()).toBe(0);

    // The single fetch should be to /api/iot/open/box/, not /api/iot/device/box/list/
    expect(testState.getLastFetchUrl()).toContain('/api/iot/open/box/');
    expect(testState.getLastFetchUrl()).not.toContain('/api/iot/device/box/list/');
  });

  it('falls back to Bestwond box-list API when DB has no stored lockAddress', async () => {
    // DB has no stored lockAddress for box 99. API should be called.
    testState.setDbDevice('2100018247', 'device1');
    // No setDbBox for box 99 — simulates a box row with no lockAddress.
    testState.setApiBoxList('2100018247', [
      { box_name: '99', lock_address: '0199' },
    ]);

    await openBoxWithCredentials('2100018247', 99, CREDENTIALS);

    // We should make 2 fetches: box-list + open/box.
    expect(testState.getFetchCallCount()).toBe(2);
    expect(testState.getBoxListCallCount()).toBe(1);

    // The open/box call should use the API-derived lockAddress.
    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('0199');
  });

  it('falls back to default derived lockAddress when neither DB nor API provides one', async () => {
    // DB has no box row; API returns an empty box list.
    testState.setDbDevice('2100018247', 'device1');
    testState.setApiBoxList('2100018247', []);

    await openBoxWithCredentials('2100018247', 7, CREDENTIALS);

    // Should still have called open/box with the default derived address.
    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('0107');
  });

  it('uses the correct box\'s lockAddress — box 5 cannot be accidentally substituted for box 7', async () => {
    // Both boxes have stored lockAddresses in the DB. Calling for box 7
    // must use box 7's lockAddress (0107), NOT box 5's (0105).
    testState.setDbDevice('2100018247', 'device1');
    testState.setDbBox(5, '0105');
    testState.setDbBox(7, '0107');

    await openBoxWithCredentials('2100018247', 7, CREDENTIALS);

    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('0107');
    expect(body.lock_address).not.toBe('0105');
  });

  it('correctly handles a box whose DB lockAddress is null (treats as not stored, falls through to API)', async () => {
    // A box row exists but lockAddress is null. Should fall through to API.
    testState.setDbDevice('2100018247', 'device1');
    testState.setDbBox(11, null); // null = stored but empty
    testState.setApiBoxList('2100018247', [
      { box_name: '11', lock_address: '010b' },
    ]);

    await openBoxWithCredentials('2100018247', 11, CREDENTIALS);

    // Should have called the box-list API (because DB returned null lockAddress).
    expect(testState.getBoxListCallCount()).toBe(1);
    // Should use the API value, not the default.
    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('010b');
  });

  it('correctly handles a box whose DB row does not exist (device found, box not found)', async () => {
    // DB has the device but no box row for box 99. Should fall through to API.
    testState.setDbDevice('2100018247', 'device1');
    // No setDbBox(99, ...) — box row doesn't exist.
    testState.setApiBoxList('2100018247', [
      { box_name: '99', lock_address: '0199' },
    ]);

    await openBoxWithCredentials('2100018247', 99, CREDENTIALS);

    expect(testState.getBoxListCallCount()).toBe(1);
    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('0199');
  });

  it('correctly handles a device that is not in the DB (falls through to API)', async () => {
    // Device not found in DB. Should fall through to API.
    // No setDbDevice — device row doesn't exist.
    testState.setApiBoxList('unknown-device-999', [
      { box_name: '3', lock_address: '0103' },
    ]);

    await openBoxWithCredentials('unknown-device-999', 3, CREDENTIALS);

    expect(testState.getBoxListCallCount()).toBe(1);
    const body = testState.getLastFetchBody();
    expect(body.lock_address).toBe('0103');
  });

  it('returns 401 when credentials are not configured', async () => {
    const result = await openBoxWithCredentials('2100018247', 5, {
      appId: '',
      appSecret: '',
      baseUrl: 'https://api.bestwond.com',
    });
    expect(result.code).toBe(401);
    // Should NOT have called fetch.
    expect(testState.getFetchCallCount()).toBe(0);
  });

  it('regression: the production failure scenario (box 5 with DB lockAddress 0105) does not crash AND makes exactly 1 Bestwond API call', async () => {
    // Combined regression: the bug caused BOTH a ReferenceError AND an extra
    // box-list API call (the catch block at line 228-232 fell through to
    // the box-list fetch). After the fix, the happy path is 1 fetch total.
    setupBox5InDb();

    const result = await openBoxWithCredentials('2100018247', 5, CREDENTIALS);

    expect(result.code).toBe(0);
    expect(testState.getFetchCallCount()).toBe(1);
    expect(testState.getBoxListCallCount()).toBe(0);
    expect(testState.getLastFetchBody().lock_address).toBe('0105');
  });
});
