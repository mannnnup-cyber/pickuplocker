-- Dirty Hand Designs - Smart Locker Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'STORED', 'READY', 'PICKED_UP', 'ABANDONED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'ONLINE');
CREATE TYPE "BoxStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'OFFLINE');
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');
CREATE TYPE "NotificationType" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'PUSH');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'STANDARD', 'PREMIUM');

-- Users table
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "password" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" TIMESTAMP(3),
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- Devices table
CREATE TABLE "devices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");

-- Boxes table
CREATE TABLE "boxes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "boxNumber" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "BoxStatus" NOT NULL DEFAULT 'AVAILABLE',
    "size" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "boxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "boxes_deviceId_boxNumber_key" ON "boxes"("deviceId", "boxNumber");

-- Orders table
CREATE TABLE "orders" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "orderNumber" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "deviceId" TEXT,
    "boxId" TEXT,
    "boxNumber" INTEGER,
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
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE UNIQUE INDEX "orders_trackingCode_key" ON "orders"("trackingCode");

-- Payments table
CREATE TABLE "payments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JMD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "gatewayRef" TEXT,
    "gatewayResponse" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- Notifications table
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SMS',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Activities table
CREATE TABLE "activities" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT,
    "orderId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- Settings table
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- Locations table
CREATE TABLE "locations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
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

-- Add foreign key constraints
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default admin user
INSERT INTO "users" ("id", "email", "name", "role", "isActive") VALUES 
('admin_001', 'admin@dirtyhand.com', 'Admin User', 'ADMIN', true);

-- Insert sample devices
INSERT INTO "devices" ("id", "deviceId", "name", "location", "status", "totalBoxes", "availableBoxes", "description") VALUES 
('device_001', '2100012858', 'Main Lobby Locker', 'Kingston Mall', 'ONLINE', 24, 18, 'Primary locker at Kingston Mall entrance'),
('device_002', '2100012859', 'Office Building Locker', 'New Kingston', 'ONLINE', 36, 12, 'Locker for business district deliveries');

-- Insert boxes for device 1
INSERT INTO "boxes" ("id", "boxNumber", "deviceId", "status", "size")
SELECT 
    'box_1_' || i::text,
    i,
    'device_001',
    CASE WHEN i <= 18 THEN 'AVAILABLE'::"BoxStatus" ELSE 'OCCUPIED'::"BoxStatus" END,
    CASE WHEN i <= 8 THEN 'S' WHEN i <= 16 THEN 'M' WHEN i <= 20 THEN 'L' ELSE 'XL' END
FROM generate_series(1, 24) AS i;

-- Insert boxes for device 2
INSERT INTO "boxes" ("id", "boxNumber", "deviceId", "status", "size")
SELECT 
    'box_2_' || i::text,
    i,
    'device_002',
    CASE WHEN i <= 12 THEN 'AVAILABLE'::"BoxStatus" ELSE 'OCCUPIED'::"BoxStatus" END,
    CASE WHEN i <= 12 THEN 'S' WHEN i <= 24 THEN 'M' WHEN i <= 30 THEN 'L' ELSE 'XL' END
FROM generate_series(1, 36) AS i;

-- Insert sample customers
INSERT INTO "users" ("id", "email", "name", "phone", "role") VALUES 
('cust_001', 'john.brown@email.com', 'John Brown', '876-555-0101', 'CUSTOMER'),
('cust_002', 'sarah.jones@email.com', 'Sarah Jones', '876-555-0202', 'CUSTOMER'),
('cust_003', 'michael.davis@email.com', 'Michael Davis', '876-555-0303', 'CUSTOMER');

-- Insert sample orders
INSERT INTO "orders" ("id", "orderNumber", "trackingCode", "customerId", "customerName", "customerPhone", "deviceId", "boxId", "boxNumber", "status", "storageDays", "storageFee", "courierName", "storageStartAt") VALUES 
('order_001', 'DH-20250115-001', '123456', 'cust_001', 'John Brown', '876-555-0101', 'device_001', 'box_1_5', 5, 'STORED', 2, 0, NULL, NOW() - INTERVAL '2 days'),
('order_002', 'DH-20250114-003', '789012', 'cust_002', 'Sarah Jones', '876-555-0202', 'device_002', 'box_2_12', 12, 'STORED', 5, 200, 'Knutsford Express', NOW() - INTERVAL '5 days'),
('order_003', 'DH-20250113-002', '345678', 'cust_003', 'Michael Davis', '876-555-0303', 'device_001', 'box_1_3', 3, 'READY', 8, 550, NULL, NOW() - INTERVAL '8 days');

-- Insert default settings
INSERT INTO "settings" ("key", "value", "description") VALUES 
('storage_free_days', '3', 'Number of free storage days'),
('storage_tier1_rate', '100', 'Daily rate for days 4-7 (JMD)'),
('storage_tier2_rate', '150', 'Daily rate for days 8-14 (JMD)'),
('storage_tier3_rate', '200', 'Daily rate for days 15-30 (JMD)'),
('abandoned_days', '30', 'Days after which items are considered abandoned'),
('currency', 'JMD', 'Default currency'),
('business_name', 'Dirty Hand Designs', 'Business name');

COMMIT;
