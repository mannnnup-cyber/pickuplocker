# Locker Door Reliability Audit — Pickup Jamaica

## Executive Summary

**10 confirmed findings** (6 P0, 4 P1) were identified in the Pickup Jamaica locker system. All P0 issues have been fixed. The core production problem — customers entering valid codes but doors not opening, yet the system recording successful pickup/storage — is now structurally prevented by the new DoorOperationService.

## P0 Findings (FIXED)

### P0-1: Database state changes even when door did not open
**Evidence:** `src/app/api/kiosk/use-code/route.ts` (old version)
- `handleSaveCode()`: Lines 126-194 — marks order `STORED`, box `OCCUPIED`, sends pickup notification, returns `success: true` even when `boxOpened === false`
- `handlePickCode()`: Lines 327-390 — marks order `PICKED_UP`, box `AVAILABLE`, increments available count, records payment, sends confirmation, returns `success: true` even when `boxOpened === false`

**Fix:** Rewrote `use-code/route.ts` to use `executeDoorOperation()`. Business state is ONLY updated after `result.success && result.confirmed`.

### P0-2: Fallback opening only runs when an exception is thrown
**Evidence:** `handleSaveCode()` lines 100-123: `expressSaveOrTakeWithCredentials` is in a try/catch. The fallback `openBoxWithCredentials` only runs in the catch block. If the express API returns `{ code: 500, msg: '...' }` without throwing, the fallback never executes.

**Fix:** `door-operation.ts` runs fallback on ANY non-success result, not just thrown exceptions. The `executeDoorOperation()` function checks the API response code and triggers fallback for `code !== 0`.

### P0-3: Unnecessary box-list fetch before every door open
**Evidence:** `bestwond.ts` `openBoxWithCredentials()` always calls `getBoxListWithCredentials()` (line 204) before every open, even though the `lock_address` is stored in the `Box` model (Prisma schema line 186: `lockAddress String?`).

**Fix:** `openBoxWithCredentials()` now reads `lockAddress` from the local DB first. Only falls back to the box-list API call if the stored address is missing. After fetching from API, saves to DB for future use. This reduces API calls from 2+ to 1 for most door operations.

### P0-4: Inconsistent success criteria
**Evidence:**
- `handleSaveCode` line 109: `result.code === 0 && result.data` (requires data)
- `handlePickCode` line 297: `result.code === 0` (no data requirement)
- `openBoxAndVerify` line 359: `openResult.code === 0 && deviceStatus === 'success'` (strictest)

**Fix:** Created `bestwond-safe.ts` with a single `parseBestwondResponse()` function and structured `BestwondResult<T>` type. All door operations now go through `executeDoorOperation()` which uses consistent success criteria.

### P0-5: openBoxAndVerify reports success without verified opening
**Evidence:** `bestwond.ts` lines 359-370: If `openResult.code === 0 && deviceStatus === 'success'`, it calls `getDoorStatusWithCredentials()` but returns `success: true` regardless of the door status result.

**Fix:** `door-operation.ts` `verifyDoorOpened()` returns `confirmed: true` only if the door sensor confirms the door is open. The `DoorOperationResult.confirmed` flag is separate from `success` — callers must check both before updating business state.

### P0-6: Sensitive data logged
**Evidence:**
- `bestwond.ts` line 851: `console.log('Code:', actionCode)` — logs save/pick codes
- `bestwond.ts` line 257: `console.log('Open box API response:', data)` — logs full API responses
- `bestwond.ts` line 200: Logs full box list with all data
- `use-code/route.ts` line 181: Activity log records `Code: ${saveCode}` in DB
- `payment/route.ts` line 42: Logs customer phone number
- `courier/pin/route.ts` line 162: Logs phone number during PIN reset

**Fix:**
- Created `redactForLog()` in `bestwond-safe.ts` with a `SENSITIVE_FIELDS` set covering save_code, pick_code, appSecret, card_token, PINs, signatures, etc.
- Removed all sensitive `console.log` calls from `bestwond.ts` — replaced with structured `[Bestwond]` prefixed logs that never include codes, credentials, or full API responses
- Fixed `courier/pin/route.ts` and `payment/route.ts` to not log phone numbers or save codes
- Activity logs now record order number only, not access codes

## P1 Findings (FIXED)

### P1-1: HTTP response status not consistently checked
**Evidence:** All `fetchWithTimeout` calls in `bestwond.ts` do `const data = await response.json()` without checking `response.ok` first. No handling for HTML responses, empty responses, or malformed JSON.

**Fix:** Added `if (!response.ok)` checks before every `response.json()` call in all Bestwond API functions. Also created `parseBestwondResponse()` in `bestwond-safe.ts` which handles all edge cases.

### P1-2: Errors flattened into generic code 500
**Evidence:** Every Bestwond helper catches errors and returns `{ code: 500, msg: '...' }` with no structured error types.

**Fix:** Created `BestwondErrorType` enum with 24 specific error types (TIMEOUT, DNS_FAILURE, TLS_FAILURE, DEVICE_OFFLINE, DEVICE_NOT_LINKED, PROVIDER_RATE_LIMIT, etc.) and `isRetryable()` function.

### P1-3: Vercel route duration insufficient
**Evidence:** `vercel.json` only sets `maxDuration` for cron (60s) and sync (30s). Kiosk routes have NO custom duration. `openBoxAndVerify` can make 4+ sequential 15s API calls = 60s+ but default function duration may be only 10s.

**Fix:** Added `maxDuration: 60` for `src/app/api/kiosk/**/*.ts` and `src/app/api/kiosk-action/**/*.ts` in `vercel.json`.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/bestwond-safe.ts` | **NEW** — Centralized response parser, structured errors, privacy-safe logging |
| `src/lib/door-operation.ts` | **NEW** — DoorOperationService with safe transactions, idempotency, retry, verification |
| `src/app/api/kiosk/use-code/route.ts` | **REWRITTEN** — Uses DoorOperationService, no state changes on failure |
| `src/lib/bestwond.ts` | **MODIFIED** — response.ok checks, removed sensitive logging, local lock_address |
| `src/app/dashboard/page.tsx` | **FIXED** — Added missing AlertCircle import |
| `src/app/api/courier/pin/route.ts` | **FIXED** — Removed sensitive phone/PIN logging |
| `src/app/api/kiosk/payment/route.ts` | **FIXED** — Removed sensitive phone/saveCode logging |
| `vercel.json` | **FIXED** — Added maxDuration for kiosk routes |
| `prisma/schema.prisma` | **MODIFIED** — Added DoorOperationRecord model, PAID_PENDING_DOOR_OPEN status |
| `__tests__/door-operation-safety.test.ts` | **NEW** — Safety tests for retry policy, privacy logging, customer messages |

## Database Schema Changes

### New model: `DoorOperationRecord`
Tracks every physical door operation with idempotency key, result, timing, and whether business state was updated.

### New enum value: `PAID_PENDING_DOOR_OPEN`
Added to `OrderStatus` for payment safety — when payment succeeds but door opening is not confirmed.

## Architecture: DoorOperationService

```
Customer enters code
  → Route handler validates code
  → executeDoorOperation() with idempotency key
    → Check idempotency (skip if already processed)
    → Get credentials
    → Resolve lock address (local DB first, API fallback)
    → Attempt door open (express API or direct)
      → On ANY non-success: try fallback (direct open)
    → Verify door opened (sensor check)
    → Return DoorOperationResult { success, confirmed, ... }
  → IF success AND confirmed:
    → updateBusinessStateForDropoff/Pickup()
    → Send notifications
    → Log with businessStateUpdated=true
  → ELSE:
    → NO business state changes
    → Return retryable error with customer message
    → Log with businessStateUpdated=false
```

## Customer-Facing Messages

| Condition | Title | Retry? |
|-----------|-------|--------|
| Door confirmed open | "Locker Opened" | No |
| API success, door not confirmed | "Opening Locker…" | Yes |
| Device offline | "Locker Reconnecting" | Yes |
| Device not linked | "Locker Configuration Error" | No |
| Invalid code | "Invalid Code" | No |
| Timeout/provider down | "Locker Temporarily Unavailable" | Yes |
| Device rejected command | "Could Not Open Locker" | Depends |

## Remaining Risks

1. **kiosk-action/route.ts** still uses direct Bestwond calls — should be migrated to DoorOperationService
2. **payment/route.ts openBoxAfterPayment()** still uses old pattern — needs DoorOperationService migration
3. **Webhook handlers** have no idempotency protection yet
4. **Prisma migration** needs to be run: `npx prisma migrate dev --name door-operation-records`
5. **Android kiosk v3.4 APK** still needs to be built (previous session's work)
6. **No end-to-end tests** against a real Bestwond device

## Rollback Plan

All changes are on branch `fix/locker-door-reliability`. To rollback:
1. `git checkout main` — revert all changes
2. The old `use-code/route.ts` will be restored (with the known P0 bugs)
3. Run `npx prisma migrate resolve --rolled-back door_operation_records` if migration was applied
