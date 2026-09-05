-- Door Operation Safety Migration
-- 1. Add PAID_PENDING_DOOR_OPEN to OrderStatus enum
-- 2. Create DoorOperationRecord table for idempotency + audit
-- State machine: PENDING → IN_PROGRESS → SUCCEEDED | FAILED | UNKNOWN
-- The UNIQUE constraint on idempotencyKey is used as an atomic lock.
-- INSERT first (IN_PROGRESS), then execute hardware, then UPDATE to terminal state.

-- Alter OrderStatus enum to add PAID_PENDING_DOOR_OPEN
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID_PENDING_DOOR_OPEN';

-- Create DoorOperationRecord table
CREATE TABLE "door_operation_records" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deviceId" TEXT NOT NULL,
    "boxId" TEXT,
    "boxNumber" INTEGER,
    "lockAddress" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "errorType" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "businessStateUpdated" BOOLEAN NOT NULL DEFAULT false,
    "providerCode" INTEGER,
    "message" TEXT,
    "resultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "door_operation_records_pkey" PRIMARY KEY ("id")
);

-- Unique constraints for idempotency and operation tracking
-- These are the ATOMIC LOCK: INSERT with idempotencyKey fails if another
-- request already claimed this operation. This prevents the race condition
-- where two concurrent requests both pass findUnique() and send duplicate
-- physical hardware commands.
CREATE UNIQUE INDEX "door_operation_records_idempotencyKey_key" ON "door_operation_records"("idempotencyKey");
CREATE UNIQUE INDEX "door_operation_records_operationId_key" ON "door_operation_records"("operationId");

-- Indexes for common query patterns
CREATE INDEX "door_operation_records_orderId_idx" ON "door_operation_records"("orderId");
CREATE INDEX "door_operation_records_deviceId_createdAt_idx" ON "door_operation_records"("deviceId", "createdAt");
CREATE INDEX "door_operation_records_action_createdAt_idx" ON "door_operation_records"("action", "createdAt");
CREATE INDEX "door_operation_records_success_confirmed_idx" ON "door_operation_records"("success", "confirmed");
CREATE INDEX "door_operation_records_status_idx" ON "door_operation_records"("status");
CREATE INDEX "door_operation_records_status_createdAt_idx" ON "door_operation_records"("status", "createdAt");
