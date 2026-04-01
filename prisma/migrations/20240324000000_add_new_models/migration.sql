-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DROP_OFF_PAYMENT', 'STORAGE_FEE', 'COURIER_TOPUP', 'COURIER_TOPUP_CASH', 'COURIER_DROPOFF', 'REFUND', 'ADJUSTMENT', 'COURIER_PAYMENT');

-- AlterTable - Add new fields to payments
ALTER TABLE "payments" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'DROP_OFF_PAYMENT';
ALTER TABLE "payments" ADD COLUMN "feeAmount" DOUBLE PRECISION;
ALTER TABLE "payments" ADD COLUMN "netAmount" DOUBLE PRECISION;
ALTER TABLE "payments" ADD COLUMN "customerName" TEXT;
ALTER TABLE "payments" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "payments" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "payments" ADD COLUMN "courierId" TEXT;
ALTER TABLE "payments" ADD COLUMN "description" TEXT;
ALTER TABLE "payments" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable - Add new fields to couriers
ALTER TABLE "couriers" ADD COLUMN "pin" TEXT;
ALTER TABLE "couriers" ADD COLUMN "pinSetAt" TIMESTAMP(3);
ALTER TABLE "couriers" ADD COLUMN "pinResetToken" TEXT;
ALTER TABLE "couriers" ADD COLUMN "pinResetExpires" TIMESTAMP(3);
ALTER TABLE "couriers" ADD COLUMN "tempPin" TEXT;
ALTER TABLE "couriers" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "couriers" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable - Add new fields to boxes
ALTER TABLE "boxes" ADD COLUMN "lockAddress" TEXT;

-- CreateTable - BoxLog
CREATE TABLE "box_logs" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderNo" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "box_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable - CourierTransaction
CREATE TABLE "courier_transactions" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable - ExpressOrder
CREATE TABLE "express_orders" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "boxName" TEXT,
    "boxSize" TEXT NOT NULL,
    "saveCode" TEXT NOT NULL,
    "pickCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "saveTime" TIMESTAMP(3),
    "pickTime" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "courierName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "express_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable - LockerSync
CREATE TABLE "locker_syncs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "deviceOnline" BOOLEAN NOT NULL DEFAULT false,
    "totalBoxes" INTEGER NOT NULL DEFAULT 0,
    "availableBoxes" INTEGER NOT NULL DEFAULT 0,
    "usedBoxes" INTEGER NOT NULL DEFAULT 0,
    "boxesUpdated" INTEGER NOT NULL DEFAULT 0,
    "ordersSynced" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locker_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "express_orders_orderNo_key" ON "express_orders"("orderNo");

-- CreateIndex
CREATE INDEX "box_logs_boxId_occurredAt_idx" ON "box_logs"("boxId", "occurredAt");

-- CreateIndex
CREATE INDEX "box_logs_deviceId_occurredAt_idx" ON "box_logs"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "courier_transactions_courierId_createdAt_idx" ON "courier_transactions"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "express_orders_deviceId_status_idx" ON "express_orders"("deviceId", "status");

-- CreateIndex
CREATE INDEX "express_orders_saveCode_idx" ON "express_orders"("saveCode");

-- CreateIndex
CREATE INDEX "express_orders_pickCode_idx" ON "express_orders"("pickCode");

-- CreateIndex
CREATE UNIQUE INDEX "locker_syncs_deviceId_key" ON "locker_syncs"("deviceId");

-- CreateIndex
CREATE INDEX "payments_type_idx" ON "payments"("type");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- AddForeignKey
ALTER TABLE "box_logs" ADD CONSTRAINT "box_logs_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_transactions" ADD CONSTRAINT "courier_transactions_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
