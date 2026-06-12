-- ============================================================
-- PICKUP LOCKER - Supabase Database Setup
-- ============================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- This creates ALL tables, enums, indexes, and seed data.
-- ============================================================

-- ============================================================
-- PART 1: DROP EXISTING (run only on fresh setup or if you want to reset)
-- ============================================================
-- Uncomment the lines below if you need to reset everything:

-- DROP TABLE IF EXISTS "grace_period_extensions" CASCADE;
-- DROP TABLE IF EXISTS "manual_payments" CASCADE;
-- DROP TABLE IF EXISTS "locker_syncs" CASCADE;
-- DROP TABLE IF EXISTS "express_orders" CASCADE;
-- DROP TABLE IF EXISTS "sms_campaigns" CASCADE;
-- DROP TABLE IF EXISTS "saved_payment_methods" CASCADE;
-- DROP TABLE IF EXISTS "courier_transactions" CASCADE;
-- DROP TABLE IF EXISTS "couriers" CASCADE;
-- DROP TABLE IF EXISTS "locations" CASCADE;
-- DROP TABLE IF EXISTS "settings" CASCADE;
-- DROP TABLE IF EXISTS "activities" CASCADE;
-- DROP TABLE IF EXISTS "email_templates" CASCADE;
-- DROP TABLE IF EXISTS "sms_templates" CASCADE;
-- DROP TABLE IF EXISTS "notifications" CASCADE;
-- DROP TABLE IF EXISTS "payments" CASCADE;
-- DROP TABLE IF EXISTS "orders" CASCADE;
-- DROP TABLE IF EXISTS "box_logs" CASCADE;
-- DROP TABLE IF EXISTS "boxes" CASCADE;
-- DROP TABLE IF EXISTS "devices" CASCADE;
-- DROP TABLE IF EXISTS "users" CASCADE;

-- DROP TYPE IF EXISTS "TransactionType" CASCADE;
-- DROP TYPE IF EXISTS "CourierStatus" CASCADE;
-- DROP TYPE IF EXISTS "SubscriptionPlan" CASCADE;
-- DROP TYPE IF EXISTS "NotificationStatus" CASCADE;
-- DROP TYPE IF EXISTS "NotificationType" CASCADE;
-- DROP TYPE IF EXISTS "DeviceStatus" CASCADE;
-- DROP TYPE IF EXISTS "BoxStatus" CASCADE;
-- DROP TYPE IF EXISTS "PaymentMethod" CASCADE;
-- DROP TYPE IF EXISTS "PaymentStatus" CASCADE;
-- DROP TYPE IF EXISTS "OrderStatus" CASCADE;
-- DROP TYPE IF EXISTS "UserRole" CASCADE;


-- ============================================================
-- PART 2: CREATE ENUMS
-- ============================================================

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER');

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING',
  'STORED',
  'READY',
  'PICKED_UP',
  'ABANDONED',
  'CANCELLED'
);

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

CREATE TYPE "PaymentMethod" AS ENUM (
  'CASH',
  'CARD',
  'MOBILE_MONEY',
  'ONLINE',
  'MANUAL_OFFICE'
);

CREATE TYPE "BoxStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'OFFLINE');

CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

CREATE TYPE "NotificationType" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'PUSH');

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');

CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'STANDARD', 'PREMIUM');

CREATE TYPE "CourierStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TYPE "TransactionType" AS ENUM (
  'DROP_OFF_PAYMENT',
  'STORAGE_FEE',
  'COURIER_TOPUP',
  'COURIER_TOPUP_CASH',
  'COURIER_DROPOFF',
  'REFUND',
  'ADJUSTMENT',
  'COURIER_PAYMENT',
  'MANUAL_PAYMENT'
);


-- ============================================================
-- PART 3: CREATE TABLES
-- ============================================================

-- -----------------------------------------------------------
-- Users
-- -----------------------------------------------------------
CREATE TABLE "users" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "email" TEXT NOT NULL,
  "username" TEXT,
  "phone" TEXT,
  "name" TEXT,
  "passwordHash" TEXT,
  "pinHash" TEXT,
  "image" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "emailVerified" TIMESTAMP(3),
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  "subscriptionStart" TIMESTAMP(3),
  "subscriptionEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt" TIMESTAMP(3),

  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_username_key" UNIQUE ("username"),
  CONSTRAINT "users_phone_key" UNIQUE ("phone")
);

-- -----------------------------------------------------------
-- Devices
-- -----------------------------------------------------------
CREATE TABLE "devices" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DeviceStatus" NOT NULL DEFAULT 'ONLINE',
  "location" TEXT,
  "totalBoxes" INTEGER NOT NULL DEFAULT 0,
  "availableBoxes" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeat" TIMESTAMP(3),
  "ipAddress" TEXT,
  "firmwareVersion" TEXT,
  "bestwondAppId" TEXT,
  "bestwondAppSecret" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "devices_deviceId_key" UNIQUE ("deviceId")
);

-- -----------------------------------------------------------
-- Boxes
-- -----------------------------------------------------------
CREATE TABLE "boxes" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "boxNumber" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "status" "BoxStatus" NOT NULL DEFAULT 'AVAILABLE',
  "size" TEXT,
  "lockAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "boxes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "boxes_deviceId_boxNumber_key" UNIQUE ("deviceId", "boxNumber"),
  CONSTRAINT "boxes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- -----------------------------------------------------------
-- Box Logs
-- -----------------------------------------------------------
CREATE TABLE "box_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "boxId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "orderNo" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" TEXT,

  CONSTRAINT "box_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "box_logs_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "box_logs_boxId_occurredAt_idx" ON "box_logs"("boxId", "occurredAt");
CREATE INDEX "box_logs_deviceId_occurredAt_idx" ON "box_logs"("deviceId", "occurredAt");

-- -----------------------------------------------------------
-- Couriers
-- -----------------------------------------------------------
CREATE TABLE "couriers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "contactPerson" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "pin" TEXT,
  "pinSetAt" TIMESTAMP(3),
  "pinResetToken" TEXT,
  "pinResetExpires" TIMESTAMP(3),
  "tempPin" TEXT,
  "status" "CourierStatus" NOT NULL DEFAULT 'ACTIVE',
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "autoReload" BOOLEAN NOT NULL DEFAULT false,
  "autoReloadAmount" DOUBLE PRECISION,
  "minBalance" DOUBLE PRECISION,
  "baseRate" DOUBLE PRECISION,
  "storageRate" DOUBLE PRECISION,
  "totalDropOffs" INTEGER NOT NULL DEFAULT 0,
  "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),

  CONSTRAINT "couriers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "couriers_name_key" UNIQUE ("name"),
  CONSTRAINT "couriers_code_key" UNIQUE ("code"),
  CONSTRAINT "couriers_phone_key" UNIQUE ("phone")
);

-- -----------------------------------------------------------
-- Orders
-- -----------------------------------------------------------
CREATE TABLE "orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderNumber" TEXT NOT NULL,
  "trackingCode" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerEmail" TEXT,
  "deviceId" TEXT,
  "boxId" TEXT,
  "boxNumber" INTEGER,
  "courierId" TEXT,
  "courierName" TEXT,
  "courierTracking" TEXT,
  "packageSize" TEXT,
  "packageWeight" DOUBLE PRECISION,
  "packageDescription" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "dropOffAt" TIMESTAMP(3),
  "dropOffBy" TEXT,
  "pickUpAt" TIMESTAMP(3),
  "pickUpBy" TEXT,
  "storageStartAt" TIMESTAMP(3),
  "storageEndAt" TIMESTAMP(3),
  "storageDays" INTEGER NOT NULL DEFAULT 0,
  "storageFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "abandonedAt" TIMESTAMP(3),
  "abandonedReason" TEXT,
  "manuallyPaidAt" TIMESTAMP(3),
  "manualPaymentGraceUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_orderNumber_key" UNIQUE ("orderNumber"),
  CONSTRAINT "orders_trackingCode_key" UNIQUE ("trackingCode"),
  CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- -----------------------------------------------------------
-- Payments
-- -----------------------------------------------------------
CREATE TABLE "payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT,
  "userId" TEXT,
  "type" "TransactionType" NOT NULL DEFAULT 'DROP_OFF_PAYMENT',
  "amount" DOUBLE PRECISION NOT NULL,
  "feeAmount" DOUBLE PRECISION,
  "netAmount" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'JMD',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "customerName" TEXT,
  "customerPhone" TEXT,
  "customerEmail" TEXT,
  "courierId" TEXT,
  "gatewayRef" TEXT,
  "gatewayResponse" TEXT,
  "description" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "payments_type_idx" ON "payments"("type");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- -----------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------
CREATE TABLE "notifications" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" "NotificationType" NOT NULL DEFAULT 'SMS',
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "templateKey" TEXT,
  "gatewayRef" TEXT,
  "errorMessage" TEXT,
  "gatewayStatus" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "cost" DOUBLE PRECISION,
  "segments" INTEGER,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "nextRetryAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- -----------------------------------------------------------
-- SMS Templates
-- -----------------------------------------------------------
CREATE TABLE "sms_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" TEXT NOT NULL,
  "variables" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_templates_key_key" UNIQUE ("key")
);

-- -----------------------------------------------------------
-- Email Templates
-- -----------------------------------------------------------
CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "variables" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_templates_key_key" UNIQUE ("key")
);

-- -----------------------------------------------------------
-- Activities
-- -----------------------------------------------------------
CREATE TABLE "activities" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT,
  "orderId" TEXT,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "metadata" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "activities_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- -----------------------------------------------------------
-- Settings
-- -----------------------------------------------------------
CREATE TABLE "settings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settings_key_key" UNIQUE ("key")
);

-- -----------------------------------------------------------
-- Locations
-- -----------------------------------------------------------
CREATE TABLE "locations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------
-- Courier Transactions
-- -----------------------------------------------------------
CREATE TABLE "courier_transactions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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

  CONSTRAINT "courier_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "courier_transactions_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "courier_transactions_courierId_createdAt_idx" ON "courier_transactions"("courierId", "createdAt");

-- -----------------------------------------------------------
-- Saved Payment Methods
-- -----------------------------------------------------------
CREATE TABLE "saved_payment_methods" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "cardToken" TEXT NOT NULL,
  "brand" TEXT,
  "last4" TEXT,
  "expiryMonth" TEXT,
  "expiryYear" TEXT,
  "holderName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "saved_payment_methods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_payment_methods_cardToken_key" UNIQUE ("cardToken"),
  CONSTRAINT "saved_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "saved_payment_methods_userId_idx" ON "saved_payment_methods"("userId");
CREATE INDEX "saved_payment_methods_cardToken_idx" ON "saved_payment_methods"("cardToken");

-- -----------------------------------------------------------
-- SMS Campaigns
-- -----------------------------------------------------------
CREATE TABLE "sms_campaigns" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "targetSegment" TEXT NOT NULL,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_campaigns_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------
-- Express Orders
-- -----------------------------------------------------------
CREATE TABLE "express_orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "express_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "express_orders_orderNo_key" UNIQUE ("orderNo")
);

CREATE INDEX "express_orders_deviceId_status_idx" ON "express_orders"("deviceId", "status");
CREATE INDEX "express_orders_saveCode_idx" ON "express_orders"("saveCode");
CREATE INDEX "express_orders_pickCode_idx" ON "express_orders"("pickCode");

-- -----------------------------------------------------------
-- Locker Syncs
-- -----------------------------------------------------------
CREATE TABLE "locker_syncs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "locker_syncs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "locker_syncs_deviceId_key" UNIQUE ("deviceId")
);

-- -----------------------------------------------------------
-- Manual Payments
-- -----------------------------------------------------------
CREATE TABLE "manual_payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_payments_orderId_key" UNIQUE ("orderId"),
  CONSTRAINT "manual_payments_receiptNumber_key" UNIQUE ("receiptNumber"),
  CONSTRAINT "manual_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "manual_payments_orderId_idx" ON "manual_payments"("orderId");
CREATE INDEX "manual_payments_receiptNumber_idx" ON "manual_payments"("receiptNumber");

-- -----------------------------------------------------------
-- Grace Period Extensions
-- -----------------------------------------------------------
CREATE TABLE "grace_period_extensions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "manualPaymentId" TEXT NOT NULL,
  "previousGraceUntil" TIMESTAMP(3) NOT NULL,
  "newGraceUntil" TIMESTAMP(3) NOT NULL,
  "extensionHours" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "extendedByName" TEXT NOT NULL,
  "extendedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grace_period_extensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grace_period_extensions_manualPaymentId_fkey" FOREIGN KEY ("manualPaymentId") REFERENCES "manual_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "grace_period_extensions_manualPaymentId_idx" ON "grace_period_extensions"("manualPaymentId");
CREATE INDEX "grace_period_extensions_createdAt_idx" ON "grace_period_extensions"("createdAt");


-- ============================================================
-- PART 4: UPDATED_AT TRIGGER
-- ============================================================
-- Auto-update "updatedAt" on every row change

CREATE OR REPLACE FUNCTION "update_updated_at_column"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables with "updatedAt"
CREATE TRIGGER "users_updatedAt" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "devices_updatedAt" BEFORE UPDATE ON "devices" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "boxes_updatedAt" BEFORE UPDATE ON "boxes" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "orders_updatedAt" BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "payments_updatedAt" BEFORE UPDATE ON "payments" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "sms_templates_updatedAt" BEFORE UPDATE ON "sms_templates" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "email_templates_updatedAt" BEFORE UPDATE ON "email_templates" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "settings_updatedAt" BEFORE UPDATE ON "settings" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "locations_updatedAt" BEFORE UPDATE ON "locations" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "couriers_updatedAt" BEFORE UPDATE ON "couriers" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "saved_payment_methods_updatedAt" BEFORE UPDATE ON "saved_payment_methods" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "sms_campaigns_updatedAt" BEFORE UPDATE ON "sms_campaigns" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "express_orders_updatedAt" BEFORE UPDATE ON "express_orders" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "locker_syncs_updatedAt" BEFORE UPDATE ON "locker_syncs" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();
CREATE TRIGGER "manual_payments_updatedAt" BEFORE UPDATE ON "manual_payments" FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();


-- ============================================================
-- PART 5: SEED DATA
-- ============================================================

-- -----------------------------------------------------------
-- 5a. Device
-- -----------------------------------------------------------
INSERT INTO "devices" ("id", "deviceId", "name", "location", "description", "totalBoxes", "availableBoxes", "status")
VALUES (
  'device1',
  '2100018247',
  'Pickup Locker - Jamaica',
  'Jamaica',
  'Primary smart locker in Jamaica',
  36,
  28,
  'ONLINE'
) ON CONFLICT ("deviceId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "location" = EXCLUDED."location",
  "totalBoxes" = EXCLUDED."totalBoxes",
  "availableBoxes" = EXCLUDED."availableBoxes";

-- -----------------------------------------------------------
-- 5b. Boxes (36 boxes)
-- -----------------------------------------------------------
INSERT INTO "boxes" ("id", "boxNumber", "deviceId", "status", "size")
SELECT
  'box' || i,
  i,
  'device1',
  CASE WHEN i <= 28 THEN 'AVAILABLE'::"BoxStatus" ELSE 'OCCUPIED'::"BoxStatus" END,
  CASE WHEN i <= 10 THEN 'S' WHEN i <= 20 THEN 'M' WHEN i <= 30 THEN 'L' ELSE 'XL' END
FROM generate_series(1, 36) AS i
ON CONFLICT ("deviceId", "boxNumber") DO NOTHING;

-- -----------------------------------------------------------
-- 5c. Admin User
-- Password: pickup2024 | PIN: 1234
-- -----------------------------------------------------------
INSERT INTO "users" ("id", "email", "username", "name", "passwordHash", "pinHash", "role", "isActive")
VALUES (
  'user_admin',
  'admin@pickupja.com',
  'admin',
  'Admin User',
  '$2b$10$xozbNS5hXKKr2.BO16/3oO9XOE0FH3ftXKF6/aWgw7ZoS78L4KvQy',
  '$2b$10$4mNcnZfH.CGCfV4o/Er/5u/Ck91v4WoZgbZ/myn7W3nBrhfnCdPty',
  'ADMIN',
  true
) ON CONFLICT ("email") DO UPDATE SET
  "username" = EXCLUDED."username",
  "passwordHash" = EXCLUDED."passwordHash",
  "pinHash" = EXCLUDED."pinHash",
  "role" = EXCLUDED."role";

-- -----------------------------------------------------------
-- 5d. Staff User
-- PIN: 1111
-- -----------------------------------------------------------
INSERT INTO "users" ("id", "email", "username", "name", "pinHash", "role", "isActive")
VALUES (
  'user_staff1',
  'staff1@pickupja.com',
  'staff1',
  'Staff Member',
  '$2b$10$Dvb.0Zh0nIt.St9zFJx7IOV3/VgJ8TAfVuHYeDkPDPFm03Fkjz6xG',
  'OPERATOR',
  true
) ON CONFLICT ("email") DO UPDATE SET
  "username" = EXCLUDED."username",
  "pinHash" = EXCLUDED."pinHash",
  "role" = EXCLUDED."role";

-- -----------------------------------------------------------
-- 5e. Operator User
-- Password: operator2024 | PIN: 5678
-- -----------------------------------------------------------
INSERT INTO "users" ("id", "email", "username", "name", "passwordHash", "pinHash", "role", "isActive")
VALUES (
  'user_operator',
  'operator@pickupja.com',
  'operator',
  'Operator User',
  '$2b$10$sw8YE2t1wZ6KIb3yVMgAmOkQqwiw5TQwcbcyefyWOIn/Lw3aKjPnm',
  '$2b$10$NO5/YPKWKiq9UO5HTTa9NuVj3HXfx84Dd3Ytor8o/aWrLgcLbJMIW',
  'OPERATOR',
  true
) ON CONFLICT ("email") DO UPDATE SET
  "username" = EXCLUDED."username",
  "passwordHash" = EXCLUDED."passwordHash",
  "pinHash" = EXCLUDED."pinHash",
  "role" = EXCLUDED."role";

-- -----------------------------------------------------------
-- 5f. Sample Customers
-- -----------------------------------------------------------
INSERT INTO "users" ("id", "email", "name", "phone", "role", "isActive")
VALUES (
  'customer1',
  'john.brown@email.com',
  'John Brown',
  '876-555-0101',
  'CUSTOMER',
  true
) ON CONFLICT ("email") DO NOTHING;

INSERT INTO "users" ("id", "email", "name", "phone", "role", "isActive")
VALUES (
  'customer2',
  'sarah.jones@email.com',
  'Sarah Jones',
  '876-555-0202',
  'CUSTOMER',
  true
) ON CONFLICT ("email") DO NOTHING;

-- -----------------------------------------------------------
-- 5g. Couriers
-- -----------------------------------------------------------
INSERT INTO "couriers" ("id", "name", "code", "contactPerson", "phone", "email", "address", "status", "balance", "creditLimit", "autoReload", "autoReloadAmount", "minBalance", "totalDropOffs", "totalSpent")
VALUES (
  'courier1',
  'Knutsford Express',
  'KE',
  'John Smith',
  '876-555-1000',
  'logistics@knutsford.com',
  'Kingston, Jamaica',
  'ACTIVE',
  5000,
  10000,
  true,
  2000,
  1000,
  45,
  15000
) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "couriers" ("id", "name", "code", "contactPerson", "phone", "email", "address", "status", "balance", "creditLimit", "autoReload", "totalDropOffs", "totalSpent")
VALUES (
  'courier2',
  'ZipMail',
  'ZM',
  'Jane Doe',
  '876-555-2000',
  'support@zipmail.com',
  'New Kingston, Jamaica',
  'ACTIVE',
  2500,
  5000,
  false,
  23,
  8500
) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "couriers" ("id", "name", "code", "contactPerson", "phone", "email", "address", "status", "balance", "creditLimit", "autoReload", "autoReloadAmount", "minBalance", "totalDropOffs", "totalSpent")
VALUES (
  'courier3',
  'Dirty Hand Designs',
  'DH',
  'Mark Brown',
  '876-555-3000',
  'info@dirtyhanddesigns.com',
  'UTech Campus, Kingston',
  'ACTIVE',
  10000,
  20000,
  true,
  5000,
  2000,
  120,
  45000
) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "couriers" ("id", "name", "code", "contactPerson", "phone", "email", "address", "status", "balance", "creditLimit", "autoReload", "autoReloadAmount", "minBalance", "totalDropOffs", "totalSpent")
VALUES (
  'courier4',
  '876OnTheGo',
  '876',
  '876OnTheGo Team',
  '876-555-4000',
  'info@876onthego.com',
  'Kingston, Jamaica',
  'ACTIVE',
  7500,
  15000,
  true,
  3000,
  1500,
  85,
  32000
) ON CONFLICT ("code") DO NOTHING;

-- -----------------------------------------------------------
-- 5h. Sample Orders
-- -----------------------------------------------------------
INSERT INTO "orders" ("id", "orderNumber", "trackingCode", "customerId", "customerName", "customerPhone", "deviceId", "boxNumber", "status", "storageStartAt", "storageDays", "storageFee")
VALUES (
  'order1',
  'DH-20250115-001',
  '123456',
  'customer1',
  'John Brown',
  '876-555-0101',
  'device1',
  5,
  'STORED',
  NOW() - INTERVAL '2 days',
  2,
  0
) ON CONFLICT ("orderNumber") DO NOTHING;

INSERT INTO "orders" ("id", "orderNumber", "trackingCode", "customerId", "customerName", "customerPhone", "deviceId", "boxNumber", "status", "storageStartAt", "storageDays", "storageFee", "courierName", "courierId")
VALUES (
  'order2',
  'DH-20250114-003',
  '789012',
  'customer2',
  'Sarah Jones',
  '876-555-0202',
  'device1',
  12,
  'STORED',
  NOW() - INTERVAL '5 days',
  5,
  200,
  'Knutsford Express',
  'courier1'
) ON CONFLICT ("orderNumber") DO NOTHING;

-- -----------------------------------------------------------
-- 5i. System Settings
-- -----------------------------------------------------------
INSERT INTO "settings" ("key", "value", "description") VALUES
  ('free_storage_days', '3', 'Number of free storage days'),
  ('tier1_fee', '100', 'Daily fee for days 4-7 (JMD)'),
  ('tier2_fee', '150', 'Daily fee for days 8-14 (JMD)'),
  ('tier3_fee', '200', 'Daily fee for days 15-30 (JMD)'),
  ('max_storage_days', '30', 'Maximum storage days before abandoned'),
  ('brand_name', 'Pickup', 'Brand name for display'),
  ('contact_phone', '876-XXX-XXXX', 'Contact phone number'),
  ('contact_email', 'support@pickupja.com', 'Contact email address')
ON CONFLICT ("key") DO NOTHING;

-- -----------------------------------------------------------
-- 5j. SMS Templates
-- -----------------------------------------------------------
INSERT INTO "sms_templates" ("key", "name", "description", "template", "variables", "isActive") VALUES
  (
    'pickup_notification',
    'Pickup Notification',
    'Sent when a package is stored in the locker',
    'Hi {{customerName}}! Your package is ready for pickup.

Tracking Code: {{trackingCode}}
Location: {{location}}
Free pickup until: {{expiryDate}}

Visit pickupja.com and enter your code to collect.

{{signature}}',
    '["customerName","trackingCode","location","expiryDate","signature"]',
    true
  ),
  (
    'pickup_confirmation',
    'Pickup Confirmation',
    'Sent when customer picks up their package',
    'Hi {{customerName}}! You have successfully picked up your package. Thank you for using Pickup!

{{signature}}',
    '["customerName","signature"]',
    true
  ),
  (
    'storage_fee',
    'Storage Fee Notice',
    'Sent when storage fee applies',
    'Hi {{customerName}}, your package has been stored for {{storageDays}} days. Storage fee: JMD ${{fee}}. Please pay when picking up.

{{signature}}',
    '["customerName","storageDays","fee","signature"]',
    true
  ),
  (
    'overdue_reminder',
    'Overdue Reminder',
    'Sent when package is approaching abandonment',
    'Hi {{customerName}}, your package has been stored for {{storageDays}} days. Total fee: JMD ${{totalFee}}. Please pick up within {{daysUntilAbandoned}} days to avoid abandonment. Contact {{supportPhone}} for help.

{{signature}}',
    '["customerName","storageDays","totalFee","daysUntilAbandoned","supportPhone","signature"]',
    true
  )
ON CONFLICT ("key") DO NOTHING;


-- ============================================================
-- PART 6: VERIFICATION QUERIES
-- ============================================================
-- Run these after to confirm everything was created:

-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT count(*) FROM users;
-- SELECT count(*) FROM devices;
-- SELECT count(*) FROM boxes;
-- SELECT count(*) FROM couriers;
-- SELECT count(*) FROM settings;
-- SELECT count(*) FROM sms_templates;
