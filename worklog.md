# Pickup Smart Locker System - Worklog

## Project Overview
A Next.js 15 web application for managing smart pickup lockers. The system integrates with:
- **Bestwond API** - Hardware control for locker boxes
- **TextBee API** - SMS notifications for pickup codes
- **DimePay API** - Payment processing for storage fees

---

## Session Summary (Mar 3, 2026) - Latest

### Issues Fixed
1. **Open Box Error (16001601)**
   - Error "Get box info error" from Bestwond API
   - Added logic to fetch correct `lock_address` from box list before opening
   - Added detailed logging for debugging API calls
   - Issue persists - may be device/credential related with Bestwond

2. **Logo Icon**
   - Cropped whitespace from logo image using PIL
   - Adjusted icon size: `h-14 w-14`
   - Text size restored to original: `text-xl`

3. **GitHub Branches**
   - Consolidated `master` and `main` branches
   - Now only using `main` branch

4. **Sync Feedback**
   - Added prominent sync result messages (green/red)
   - Shows actual Bestwond API error messages
   - Better error handling for missing credentials

### New Features Discovered/Documented
1. **Door Detection via Webhooks** ✅
   - Endpoint: `/api/webhooks/bestwond`
   - Handles: `door_opened`, `door_closed`, `order_stored`, `order_picked_up`, `device_online`, `device_offline`
   - Configure Bestwond to send webhooks to: `https://your-domain.com/api/webhooks/bestwond`

2. **Box Logs API**
   - Endpoint: `/api/devices/[id]/logs`
   - Fetch usage history from local DB or Bestwond API
   - UI button: "View Logs" in boxes dialog

3. **Box Sizes from API**
   - Bestwond returns box sizes: S, M, L, XL
   - Displayed in box grid and detail views
   - `lock_address` stored from hardware

### Files Modified This Session
- `/src/lib/bestwond.ts` - Enhanced open box logic with lock_address lookup
- `/src/app/api/lockers/route.ts` - Better error logging
- `/src/app/api/devices/[id]/boxes/route.ts` - Improved sync error handling
- `/src/app/dashboard/page.tsx` - Added box logs UI, sync feedback
- `/src/components/app-sidebar.tsx` - Logo size adjustments
- `/prisma/schema.prisma` - Added BoxLog model, lockAddress field
- `/public/logo-icon.png` - Cropped whitespace

---

## Session Summary (Feb 26, 2026)

### Current State
All systems operational with sample data loaded.

### Database Status
- **Database**: SQLite at `/home/z/my-project/db/custom.db`
- **Schema**: Prisma ORM with complete models for devices, orders, customers, couriers, payments, notifications

### Sample Data Seeded
- **Devices**: 2 lockers
  - Main Lobby Locker (ID: 2100012858) - 24 boxes
  - Office Building Locker (ID: 2100012859) - 36 boxes
- **Couriers**: 3 companies with prepaid accounts
  - Knutsford Express: $5,000 JMD balance
  - ZipMail: $2,500 JMD balance
  - Dirty Hand Designs: $10,000 JMD balance
- **Customers**: 3 users
- **Orders**: 2 sample orders
- **Settings**: 8 system configuration entries

### Brand Implementation
- **Primary Color**: Yellow #FFD439
- **Secondary Color**: Black #111111
- **Heading Font**: Montserrat Bold
- **Body Font**: Roboto Regular
- **Logo**: Using logo-icon.png in sidebar

### UI Pages Available
1. **Homepage** (`/`) - Customer-facing pickup interface
2. **Dashboard** (`/dashboard`) - Admin management panel with tabs:
   - Dashboard - Overview, stats, system status
   - Devices - Manage locker devices, open boxes remotely
   - Orders - Create drop-offs, manage packages
   - Customers - Customer management
   - Couriers - Courier company accounts with prepaid balances
   - Payments - Payment history and tracking
   - SMS & Alerts - Send test SMS, view notification logs
   - Settings - System configuration

### API Routes
- `/api/devices` - Device CRUD operations
- `/api/orders` - Order management
- `/api/customers` - Customer operations
- `/api/couriers` - Courier account management
- `/api/payments` - Payment processing
- `/api/sms` - SMS sending via TextBee
- `/api/pickup` - Customer pickup verification
- `/api/status` - System health check
- `/api/stats` - Dashboard statistics
- `/api/lockers` - Bestwond locker control

### Required Environment Variables (API Credentials)
```env
BESTWOND_APP_ID=""      # Bestwond locker hardware API
BESTWOND_APP_SECRET=""
TEXTBEE_API_KEY=""      # SMS notifications
TEXTBEE_DEVICE_ID=""
DIMEPAY_API_KEY=""      # Payment processing
DIMEPAY_MERCHANT_ID=""
```

---

## Previous Work History

### GitHub Repository
- **URL**: https://github.com/mannnnup-cyber/pickuplocker
- **Main branch**: main (master merged and deleted)
- **Status**: All code pushed to main branch

### Completed Tasks
1. Merged master branch into main
2. Added missing UI features (Couriers, SMS & Alerts tabs)
3. Migrated from PostgreSQL to SQLite for local development
4. Removed DIRECT_DATABASE_URL requirement
5. Fixed seed script for SQLite compatibility
6. Implemented brand guidelines
7. Updated sidebar logo to icon version
8. Verified all UI pages are functional

---

## Session Summary (Current - DimePay Features Implementation)

### DimePay Payment Features Implemented
1. **Storage Fee Payment with QR Codes**
   - Orders with storage fees now have "Pay Online" option
   - Generates DimePay payment link and QR code
   - Customer can scan QR code to pay storage fee
   - On payment completion, webhook opens the locker box automatically

2. **Courier Prepaid Account Top-up via DimePay**
   - Couriers can top-up their prepaid accounts online
   - Generates payment QR code for courier to scan and pay
   - Webhook automatically credits the courier account on successful payment

3. **Fee Pass-through Options**
   - Settings for passing DimePay transaction fees to customers
   - `dimepay_passFeeToCustomer` - Pass fee to customers (default: true)
   - `dimepay_passFeeToCourier` - Pass fee to couriers (default: false)
   - Fee structure: 2.5% + $30 JMD fixed

4. **Updated API Endpoints**
   - `/api/payments` - Added actions: `storage_fee`, `courier_topup`, `calculate_fee`
   - `/api/webhooks/dimepay` - Handles both storage fee and courier top-up payments
   - `/api/settings` - Added DimePay fee configuration options

5. **UI Updates**
   - Orders tab: "Pay Online" button in dropdown menu for orders with storage fees
   - Couriers tab: "Top-up via DimePay" button in courier card footer
   - Payment QR Code dialogs for both features

### Files Modified
- `/src/lib/dimepay.ts` - Added QR code generation, fee calculation, specialized payment functions
- `/src/app/api/payments/route.ts` - Added storage fee and courier top-up payment creation
- `/src/app/api/webhooks/dimepay/route.ts` - Added courier top-up handling
- `/src/app/api/settings/route.ts` - Added fee pass-through settings
- `/src/app/dashboard/page.tsx` - Added payment UI components

### Operational Improvements Added

1. **Automated Reports**
   - `/api/reports/daily` - Generate daily/weekly/monthly reports with orders, revenue, utilization
   - `/api/reports/email` - Send HTML email reports to admins
   - Includes trend comparisons with previous periods

2. **Abandoned Package Workflow**
   - `/api/cron/abandoned` - Automated escalation cron job
   - Day 3-7: First reminder SMS
   - Day 8-14: Second reminder
   - Day 15-24: Final warning
   - Day 25-29: Abandoned notice
   - Day 30+: Auto-mark as ABANDONED

3. **Box Size Recommendations**
   - `/src/lib/box-sizing.ts` - Package dimension to box size matching
   - Box sizes: S, M, L, XL with dimensions and pricing
   - Storage fee calculation with tiered pricing

4. **Bulk Operations**
   - `/api/bulk` - Batch operations API
   - Bulk SMS to customers
   - Bulk status updates
   - Bulk export (CSV/JSON)
   - Bulk fee recalculation
   - Bulk mark as ready

5. **Bulk SMS Marketing**
   - `/api/sms/marketing` - Marketing campaign API
   - Customer segmentation: all, active, inactive, pending pickup, courier
   - Campaign tracking with SmsCampaign model
   - Message personalization with {name} variable
   - Marketing tab in SMS dashboard

6. **SMS Delivery Receipts**
   - `/api/webhooks/textbee` - TextBee webhook handler
   - Track sent, delivered, failed, undelivered status
   - Update notification records with delivery status
   - Activity logging for delivery events

---

## Next Steps
1. Add API credentials for production use:
   - Bestwond: https://www.bestwond.com/
   - TextBee: https://textbee.dev/
   - DimePay: Contact for API access
2. Set up production database (PostgreSQL recommended)
3. Configure domain and SSL
4. Deploy to Vercel or preferred hosting

---
