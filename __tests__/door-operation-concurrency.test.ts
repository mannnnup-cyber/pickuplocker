/**
 * Door Operation Concurrency & Idempotency Tests
 *
 * Verifies the ATOMIC INSERT-first lock pattern:
 * - Only ONE request sends the physical Bestwond command
 * - Concurrent requests return cached/in-progress results
 * - Deterministic idempotency keys
 * - State machine transitions
 * - UNKNOWN state prevents blind re-sends
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Shared state via vi.hoisted (executed before vi.mock hoisting)
// ============================================

const {
  getRecordStore,
  getOpenCount,
  setOpenDelay,
  resetState,
} = vi.hoisted(() => {
  let physicalOpenCallCount = 0;
  let physicalOpenDelay = 100;
  const recordStore = new Map<string, any>();

  return {
    getRecordStore: () => recordStore,
    getOpenCount: () => physicalOpenCallCount,
    setOpenDelay: (ms: number) => { physicalOpenDelay = ms; },
    resetState: () => {
      physicalOpenCallCount = 0;
      physicalOpenDelay = 100;
      recordStore.clear();
    },
    incrementOpenCount: () => { physicalOpenCallCount++; },
    getOpenDelay: () => physicalOpenDelay,
  };
});

// Also need increment and delay getter in hoisted
const { incrementOpenCount, getOpenDelay } = vi.hoisted(() => {
  // These are stubs — the real logic is in the closure above
  // But we can't reference the same closure, so let's use a different approach
  return {
    incrementOpenCount: () => {},
    getOpenDelay: () => 100,
  };
});

// Actually, let's use a simpler approach: a single hoisted module with all state
const state = vi.hoisted(() => {
  let openCount = 0;
  let openDelay = 100;
  const store = new Map<string, any>();

  return {
    store,
    get openCount() { return openCount; },
    set openCount(v: number) { openCount = v; },
    get openDelay() { return openDelay; },
    set openDelay(v: number) { openDelay = v; },
    incrementOpen() { openCount++; },
    reset() {
      openCount = 0;
      openDelay = 100;
      store.clear();
    },
  };
});

// ============================================
// Mocks
// ============================================

vi.mock('@/lib/db', () => ({
  db: {
    doorOperationRecord: {
      create: async (args: { data: any }) => {
        const key = args.data.idempotencyKey;
        if (state.store.has(key)) {
          const err = new Error(`Unique constraint failed on the fields: (\`idempotencyKey\`)`);
          (err as any).code = 'P2002';
          throw err;
        }
        const record = {
          ...args.data,
          id: args.data.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.store.set(key, record);
        return record;
      },
      findUnique: async (args: { where: { idempotencyKey: string } }) => {
        return state.store.get(args.where.idempotencyKey) || null;
      },
      update: async (args: { where: { id: string }; data: any }) => {
        for (const [key, record] of state.store.entries()) {
          if (record.id === args.where.id) {
            const updated = { ...record, ...args.data, updatedAt: new Date() };
            state.store.set(key, updated);
            return updated;
          }
        }
        throw new Error('Record not found');
      },
      delete: async (args: { where: { id: string } }) => {
        for (const [key, record] of state.store.entries()) {
          if (record.id === args.where.id) {
            state.store.delete(key);
            return record;
          }
        }
        throw new Error('Record not found');
      },
    },
    box: {
      findUnique: async () => ({ lockAddress: '0101' }),
      update: async () => {},
    },
    device: {
      findFirst: async () => null,
    },
  },
}));

vi.mock('@/lib/bestwond', () => ({
  openBoxWithCredentials: async (_d: string, _b: number, _c: any) => {
    state.incrementOpen();
    await new Promise(r => setTimeout(r, state.openDelay));
    return { code: 0, data: { status: 'open' }, msg: '' };
  },
  expressSaveOrTakeWithCredentials: async () => {
    state.incrementOpen();
    await new Promise(r => setTimeout(r, state.openDelay));
    return { code: 0, data: { status: 'open', box_name: '1' }, msg: '' };
  },
  getBoxListWithCredentials: async () => ({
    code: 0, data: [{ box_name: '1', lock_address: '0101' }],
  }),
  getDoorStatusWithCredentials: async () => ({
    code: 0, data: { status: 'open', door_open: true },
  }),
  getDeviceStatusWithCredentials: async () => ({
    code: 0, data: { status: 'on' },
  }),
  getCredentialsForDevice: async () => ({
    appId: 'test-app-id', appSecret: 'test-app-secret', baseUrl: 'https://api.bestwond.com',
  }),
}));

vi.mock('@/lib/bestwond-safe', () => ({
  isRetryable: (errorType: string) => new Set([
    'TIMEOUT', 'DNS_FAILURE', 'TLS_FAILURE', 'DEVICE_OFFLINE',
    'PROVIDER_UNAVAILABLE', 'PROVIDER_RATE_LIMIT', 'NETWORK_ERROR',
    'DOOR_NOT_CONFIRMED', 'VERCEL_TIMEOUT',
  ]).has(errorType),
  logDoorOperation: (_e: any) => {},
  redactForLog: (d: any) => d,
  failureFromError: (e: any) => ({
    errorType: 'NETWORK_ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  parseBestwondResponse: async () => ({ errorType: 'UNKNOWN', message: 'mock' }),
}));

// Import AFTER mocks
import { executeDoorOperation, deriveIdempotencyKey } from '@/lib/door-operation';

beforeEach(() => { state.reset(); });

// ============================================
// 1. Deterministic Idempotency Keys
// ============================================

describe('1. Deterministic Idempotency Keys', () => {
  it('pickup: same orderId → same key (no timestamp)', () => {
    const k1 = deriveIdempotencyKey({ orderId: 'o1', orderNo: 'A', deviceId: 'd1', deviceNumber: '1001', action: 'pickup' });
    const k2 = deriveIdempotencyKey({ orderId: 'o1', orderNo: 'A', deviceId: 'd1', deviceNumber: '1001', action: 'pickup' });
    expect(k1).toBe('pickup:o1');
    expect(k1).toBe(k2);
  });

  it('dropoff: key is dropoff:{orderId}', () => {
    expect(deriveIdempotencyKey({ orderId: 'o2', orderNo: 'B', deviceId: 'd1', deviceNumber: '1001', action: 'dropoff' }))
      .toBe('dropoff:o2');
  });

  it('payment-pickup: key is payment-pickup:{orderId}', () => {
    expect(deriveIdempotencyKey({ orderId: 'o3', orderNo: 'C', deviceId: 'd1', deviceNumber: '1001', action: 'payment-pickup' }))
      .toBe('payment-pickup:o3');
  });

  it('courier-dropoff: key is courier-dropoff:{orderId}', () => {
    expect(deriveIdempotencyKey({ orderId: 'o4', orderNo: 'D', deviceId: 'd1', deviceNumber: '1001', action: 'courier-dropoff' }))
      .toBe('courier-dropoff:o4');
  });

  it('admin-open: different requestId → different key (allows repeated opens)', () => {
    const k1 = deriveIdempotencyKey({ orderId: 'a1', orderNo: 'X', deviceId: 'dev', deviceNumber: '1001', boxId: 'b1', action: 'admin-open', requestId: 'r1' });
    const k2 = deriveIdempotencyKey({ orderId: 'a1', orderNo: 'X', deviceId: 'dev', deviceNumber: '1001', boxId: 'b1', action: 'admin-open', requestId: 'r2' });
    expect(k1).not.toBe(k2);
  });

  it('explicit idempotencyKey overrides derived', () => {
    expect(deriveIdempotencyKey({ orderId: 'o1', orderNo: 'A', deviceId: 'd1', deviceNumber: '1001', action: 'pickup', idempotencyKey: 'custom' }))
      .toBe('custom');
  });
});

// ============================================
// 2. Concurrent — only ONE hardware command
// ============================================

describe('2. Concurrent Idempotency — Only ONE Hardware Command', () => {
  it('two concurrent pickup requests send only ONE physical open', async () => {
    state.openDelay = 200;
    const opts = { orderId: 'c1', orderNo: 'C1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const };
    const [r1, r2] = await Promise.all([executeDoorOperation(opts), executeDoorOperation(opts)]);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(state.openCount).toBe(1);
  });

  it('three concurrent requests still send only ONE physical open', async () => {
    state.openDelay = 300;
    const opts = { orderId: 'c2', orderNo: 'C2', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'dropoff' as const };
    const [r1, r2, r3] = await Promise.all([executeDoorOperation(opts), executeDoorOperation(opts), executeDoorOperation(opts)]);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();
    expect(state.openCount).toBe(1);
  });
});

// ============================================
// 3. Sequential — cached result
// ============================================

describe('3. Sequential Requests — Cached Result', () => {
  it('second request returns cached result without hardware command', async () => {
    state.openDelay = 50;
    const opts = { orderId: 's1', orderNo: 'S1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const };
    const r1 = await executeDoorOperation(opts);
    const callsAfterFirst = state.openCount;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
    const r2 = await executeDoorOperation(opts);
    expect(state.openCount).toBe(callsAfterFirst);
    expect(r2.owned).toBe(false);
  });
});

// ============================================
// 4. IN_PROGRESS handling
// ============================================

describe('4. IN_PROGRESS — No Duplicate Hardware Command', () => {
  it('concurrent request does not send duplicate command', async () => {
    state.openDelay = 500;
    const opts = { orderId: 'ip1', orderNo: 'IP1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const };
    const [r1, r2] = await Promise.all([executeDoorOperation(opts), executeDoorOperation(opts)]);
    expect(state.openCount).toBe(1);
    expect(r1.owned || r2.owned).toBe(true);
  });
});

// ============================================
// 5. UNKNOWN state — no blind re-send
// ============================================

describe('5. UNKNOWN State — Prevents Blind Re-send', () => {
  it('UNKNOWN record prevents retry without reconciliation', async () => {
    state.store.set('pickup:u1', {
      id: 'rec-u1', idempotencyKey: 'pickup:u1', operationId: 'door-crash-1',
      action: 'pickup', orderId: 'u1', status: 'UNKNOWN', deviceId: 'dev',
      boxId: null, boxNumber: 1, lockAddress: '0101',
      success: true, confirmed: false, retryable: false,
      errorType: 'DOOR_NOT_CONFIRMED', startedAt: new Date(), completedAt: new Date(),
      durationMs: 5000, apiCalls: 1, attempts: 1, businessStateUpdated: false,
      providerCode: null, message: 'Crash after command sent', resultJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await executeDoorOperation({ orderId: 'u1', orderNo: 'U1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const });
    expect(state.openCount).toBe(0);
    expect(result.owned).toBe(false);
    expect(result.status).toBe('UNKNOWN');
  });
});

// ============================================
// 6. FAILED + retryable → retry
// ============================================

describe('6. FAILED + Retryable → Retry Ownership', () => {
  it('retryable FAILED allows retry with safe ownership', async () => {
    state.store.set('pickup:rt1', {
      id: 'rec-rt1', idempotencyKey: 'pickup:rt1', operationId: 'door-fail-1',
      action: 'pickup', orderId: 'rt1', status: 'FAILED', deviceId: 'dev',
      boxId: null, boxNumber: 1, lockAddress: '0101',
      success: false, confirmed: false, retryable: true,
      errorType: 'DEVICE_OFFLINE', startedAt: new Date(), completedAt: new Date(),
      durationMs: 2000, apiCalls: 1, attempts: 1, businessStateUpdated: false,
      providerCode: null, message: 'Device offline', resultJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await executeDoorOperation({ orderId: 'rt1', orderNo: 'RT1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const });
    expect(state.openCount).toBe(1);
    expect(result.owned).toBe(true);
  });

  it('non-retryable FAILED does NOT allow retry', async () => {
    state.store.set('pickup:nr1', {
      id: 'rec-nr1', idempotencyKey: 'pickup:nr1', operationId: 'door-noretry-1',
      action: 'pickup', orderId: 'nr1', status: 'FAILED', deviceId: 'dev',
      boxId: null, boxNumber: 1, lockAddress: '0101',
      success: false, confirmed: false, retryable: false,
      errorType: 'DEVICE_NOT_LINKED', startedAt: new Date(), completedAt: new Date(),
      durationMs: 1000, apiCalls: 1, attempts: 1, businessStateUpdated: false,
      providerCode: null, message: 'Device not linked', resultJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await executeDoorOperation({ orderId: 'nr1', orderNo: 'NR1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const });
    expect(state.openCount).toBe(0);
    expect(result.owned).toBe(false);
    expect(result.success).toBe(false);
  });
});

// ============================================
// 7. Business state invariant
// ============================================

describe('7. Business State Invariant', () => {
  it('executeDoorOperation NEVER sets businessStateUpdated=true', async () => {
    state.openDelay = 50;
    const result = await executeDoorOperation({ orderId: 'b1', orderNo: 'B1', deviceId: 'dev', deviceNumber: '1001', boxNumber: 1, action: 'pickup' as const });
    expect(result.businessStateUpdated).toBe(false);
  });
});
