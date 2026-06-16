-- Add MANUAL_OFFICE to PaymentMethod enum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MANUAL_OFFICE';

-- Add MANUAL_PAYMENT to TransactionType enum
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'MANUAL_PAYMENT';

-- Add manual payment tracking fields to orders table
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manuallyPaidAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manualPaymentGraceUntil" TIMESTAMP(3);

-- Create manual_payments table
CREATE TABLE IF NOT EXISTS "manual_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "method" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffId" TEXT,
    "notes" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "graceUntil" TIMESTAMP(3) NOT NULL,
    "openBoxNow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id")
);

-- Create grace_period_extensions table
CREATE TABLE IF NOT EXISTS "grace_period_extensions" (
    "id" TEXT NOT NULL,
    "manualPaymentId" TEXT NOT NULL,
    "previousGraceUntil" TIMESTAMP(3) NOT NULL,
    "newGraceUntil" TIMESTAMP(3) NOT NULL,
    "extensionHours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "extendedByName" TEXT NOT NULL,
    "extendedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grace_period_extensions_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "manual_payments_orderId_key" ON "manual_payments"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "manual_payments_receiptNumber_key" ON "manual_payments"("receiptNumber");

-- Create indexes
CREATE INDEX IF NOT EXISTS "manual_payments_orderId_idx" ON "manual_payments"("orderId");
CREATE INDEX IF NOT EXISTS "manual_payments_receiptNumber_idx" ON "manual_payments"("receiptNumber");
CREATE INDEX IF NOT EXISTS "grace_period_extensions_manualPaymentId_idx" ON "grace_period_extensions"("manualPaymentId");
CREATE INDEX IF NOT EXISTS "grace_period_extensions_createdAt_idx" ON "grace_period_extensions"("createdAt");

-- Add foreign keys
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grace_period_extensions" ADD CONSTRAINT "grace_period_extensions_manualPaymentId_fkey"
    FOREIGN KEY ("manualPaymentId") REFERENCES "manual_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
