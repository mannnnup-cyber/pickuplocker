-- PickupLocker Database Initialization Script
-- Run this in your Neon SQL Editor to create all tables
-- Then visit https://pickupja.com/api/setup while logged in as admin to seed data

-- Enums
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'STORED', 'READY', 'PICKED_UP', 'ABANDONED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'ONLINE', 'MANUAL_OFFICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BoxStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'PUSH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'STANDARD', 'PREMIUM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CourierStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionType" AS ENUM ('DROP_OFF_PAYMENT', 'STORAGE_FEE', 'COURIER_TOPUP', 'COURIER_TOPUP_CASH', 'COURIER_DROPOFF', 'REFUND', 'ADJUSTMENT', 'COURIER_PAYMENT', 'MANUAL_PAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_username_key" UNIQUE ("username"),
  CONSTRAINT "users_phone_key" UNIQUE ("phone")
);

-- Devices table
CREATE TABLE IF NOT EXISTS "devices" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "devices_deviceId_key" UNIQUE ("deviceId")
);

-- Boxes table
CREATE TABLE IF NOT EXISTS "boxes" (
  "id" TEXT NOT NULL,
  "boxNumber" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "status" "BoxStatus" NOT NULL DEFAULT 'AVAILABLE',
  "size" TEXT,
  "lockAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "boxes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "boxes_deviceId_boxNumber_key" UNIQUE ("deviceId", "boxNumber"),
  CONSTRAINT "boxes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Box logs
CREATE TABLE IF NOT EXISTS "box_logs" (
  "id" TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS "box_logs_boxId_occurredAt_idx" ON "box_logs"("boxId", "occurredAt");
CREATE INDEX IF NOT EXISTS "box_logs_deviceId_occurredAt_idx" ON "box_logs"("deviceId", "occurredAt");

-- Couriers table (must be before orders due to FK)
CREATE TABLE IF NOT EXISTS "couriers" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "couriers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "couriers_name_key" UNIQUE ("name"),
  CONSTRAINT "couriers_code_key" UNIQUE ("code"),
  CONSTRAINT "couriers_phone_key" UNIQUE ("phone")
);

-- Orders table
CREATE TABLE IF NOT EXISTS "orders" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_orderNumber_key" UNIQUE ("orderNumber"),
  CONSTRAINT "orders_trackingCode_key" UNIQUE ("trackingCode"),
  CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Payments table
CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payments_type_idx" ON "payments"("type");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");
CREATE INDEX IF NOT EXISTS "payments_createdAt_idx" ON "payments"("createdAt");

-- Notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
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

-- SMS Templates
CREATE TABLE IF NOT EXISTS "sms_templates" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" TEXT NOT NULL,
  "variables" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_templates_key_key" UNIQUE ("key")
);

-- Email Templates
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "variables" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_templates_key_key" UNIQUE ("key")
);

-- Activities table
CREATE TABLE IF NOT EXISTS "activities" (
  "id" TEXT NOT NULL,
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

-- Settings table
CREATE TABLE IF NOT EXISTS "settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settings_key_key" UNIQUE ("key")
);

-- Locations table
CREATE TABLE IF NOT EXISTS "locations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- Courier Transactions
CREATE TABLE IF NOT EXISTS "courier_transactions" (
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
  CONSTRAINT "courier_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "courier_transactions_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "courier_transactions_courierId_createdAt_idx" ON "courier_transactions"("courierId", "createdAt");

-- Saved Payment Methods
CREATE TABLE IF NOT EXISTS "saved_payment_methods" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "saved_payment_methods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_payment_methods_cardToken_key" UNIQUE ("cardToken"),
  CONSTRAINT "saved_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "saved_payment_methods_userId_idx" ON "saved_payment_methods"("userId");
CREATE INDEX IF NOT EXISTS "saved_payment_methods_cardToken_idx" ON "saved_payment_methods"("cardToken");

-- SMS Campaigns
CREATE TABLE IF NOT EXISTS "sms_campaigns" (
  "id" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_campaigns_pkey" PRIMARY KEY ("id")
);

-- Express Orders
CREATE TABLE IF NOT EXISTS "express_orders" (
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
  CONSTRAINT "express_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "express_orders_orderNo_key" UNIQUE ("orderNo")
);
CREATE INDEX IF NOT EXISTS "express_orders_deviceId_status_idx" ON "express_orders"("deviceId", "status");
CREATE INDEX IF NOT EXISTS "express_orders_saveCode_idx" ON "express_orders"("saveCode");
CREATE INDEX IF NOT EXISTS "express_orders_pickCode_idx" ON "express_orders"("pickCode");

-- Locker Syncs
CREATE TABLE IF NOT EXISTS "locker_syncs" (
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
  CONSTRAINT "locker_syncs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "locker_syncs_deviceId_key" UNIQUE ("deviceId")
);

-- Manual Payments
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
  CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_payments_orderId_key" UNIQUE ("orderId"),
  CONSTRAINT "manual_payments_receiptNumber_key" UNIQUE ("receiptNumber"),
  CONSTRAINT "manual_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "manual_payments_orderId_idx" ON "manual_payments"("orderId");
CREATE INDEX IF NOT EXISTS "manual_payments_receiptNumber_idx" ON "manual_payments"("receiptNumber");

-- Grace Period Extensions
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
  CONSTRAINT "grace_period_extensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grace_period_extensions_manualPaymentId_fkey" FOREIGN KEY ("manualPaymentId") REFERENCES "manual_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "grace_period_extensions_manualPaymentId_idx" ON "grace_period_extensions"("manualPaymentId");
CREATE INDEX IF NOT EXISTS "grace_period_extensions_createdAt_idx" ON "grace_period_extensions"("createdAt");
