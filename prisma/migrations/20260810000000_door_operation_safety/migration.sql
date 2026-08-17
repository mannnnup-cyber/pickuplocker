-- Door Operation Safety Migration
-- 1. Add PAID_PENDING_DOOR_OPEN to OrderStatus enum
-- 2. Create DoorOperationRecord table for idempotency + audit

-- Alter OrderStatus enum to add PAID_PENDING_DOOR_OPEN
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID_PENDING_DOOR_OPEN';

-- Create DoorOperationRecord table
CREATE TABLE "door_operation_records" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderId" TEXT,
    "deviceId" TEXT NOT NULL,
    "boxId" TEXT,
    "boxNumber" INTEGER,
    "lockAddress" TEXT,
    "success" BOOLEAN NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "retryable" BOOLEAN NOT NULL,
    "errorType" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "apiCalls" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL,
    "businessStateUpdated" BOOLEAN NOT NULL DEFAULT false,
    "providerCode" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "door_operation_records_pkey" PRIMARY KEY ("id")
);

-- Unique constraints for idempotency and operation tracking
CREATE UNIQUE CONSTRAINT "door_operation_records_idempotencyKey_key" ON "door_operation_records"("idempotencyKey");
CREATE UNIQUE CONSTRAINT "door_operation_records_operationId_key" ON "door_operation_records"("operationId");

-- Indexes for common query patterns
CREATE INDEX "door_operation_records_orderId_idx" ON "door_operation_records"("orderId");
CREATE INDEX "door_operation_records_deviceId_createdAt_idx" ON "door_operation_records"("deviceId", "createdAt");
CREATE INDEX "door_operation_records_action_createdAt_idx" ON "door_operation_records"("action", "createdAt");
CREATE INDEX "door_operation_records_success_confirmed_idx" ON "door_operation_records"("success", "confirmed");
