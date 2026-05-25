# Task: Build Manual Payment System with 24-Hour Grace Period

## Summary

All 7 subtasks completed successfully. The build passes cleanly.

## Files Modified

### 1. `prisma/schema.prisma`
- Added `ManualPayment` model with fields: id, orderId (unique), amount, originalAmount, discount, discountReason, method, staffName, staffId, notes, receiptNumber (unique), graceUntil, openBoxNow, timestamps
- Added to Order model: `manuallyPaidAt` (DateTime?), `manualPaymentGraceUntil` (DateTime?), `manualPayment` (ManualPayment? back-relation)
- Note: Used `orderId @unique` on ManualPayment for 1:1 relation; Order's `manualPayment` is a virtual back-relation (no separate FK column needed on Order)

### 2. `src/app/api/payments/manual/route.ts` (NEW)
- POST endpoint to record manual payments (CASH, CARD, BANK_TRANSFER, OTHER)
- Validates order exists, not already picked up, no active grace period
- Generates receipt number (RCP-YYYYMMDD-XXXX)
- Calculates 24-hour grace period
- Optionally opens box via Bestwond API
- Creates ManualPayment, Payment, and Activity records
- Sends SMS notification to customer
- If box opened immediately, marks order as PICKED_UP and updates box/device

### 3. `src/app/api/kiosk/use-code/route.ts` (MODIFIED)
- Added manual payment grace period check in `handlePickCode`
- New variables: `feeOwed` and `graceExpired`
- If within grace period: feeOwed = 0 (no payment needed)
- If grace expired: recalculates fee from manuallyPaidAt
- Payment recording uses `feeOwed` instead of `storageFee`
- Order update uses `feeOwed > 0 ? feeOwed : storageFee` for storageFee field
- Response includes `graceExpired` flag and appropriate messages

### 4. `src/app/api/cron/auto-charge/route.ts` (MODIFIED)
- Added grace period check after existing payment check
- Skips auto-charge if manually paid and within grace period
- Allows auto-charge to proceed if grace period expired

### 5. `src/app/api/payments/manual/extend-grace/route.ts` (NEW)
- POST endpoint to extend grace period by 1-168 hours
- Validates order exists, has manual payment, not picked up
- Updates both Order and ManualPayment records
- Creates activity log with extension details

## Schema Design Note
The Prisma relation between Order and ManualPayment uses `orderId @unique` on ManualPayment as the owning side. Order's `manualPayment` field is a virtual back-relation. This avoids the Prisma error where both sides specify `fields` and `references`. The ManualPayment is found via `db.manualPayment.findUnique({ where: { orderId: order.id } })`.

## Build Result
✅ `npx prisma generate` - success
✅ `npx next build` - success (no errors)
