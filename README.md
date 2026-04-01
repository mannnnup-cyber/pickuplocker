# PICKUP - Smart Locker System

A modern, production-ready smart locker management system for package drop-off and pickup, built with Next.js 16, TypeScript, and Tailwind CSS.

## 🚀 Features

### Core Functionality
- **📦 Self-Service Drop-off** - Customers can buy drop-off codes and deposit packages 24/7
- **📤 Package Pickup** - Recipients collect packages using pickup codes
- **🚚 Courier Integration** - Couriers can drop off packages with prepaid balance
- **💰 DimePay Integration** - Secure payment processing via DimePay gateway
- **📧 Email Notifications** - Automatic confirmation emails with save codes
- **📱 SMS Notifications** - Pickup reminders via TextBee SMS gateway

### New Features (Latest Update)
- **Two-Option Payment Flow** - Users can pay on current device or scan QR with another device
- **"Open Locker" Button** - Immediately open locker after successful payment
- **Email Capture** - Optional email field for receiving save codes via email
- **Customer Record Creation** - Automatic customer creation during payment flow
- **Fee Transparency** - Detailed fee logging for DimePay transactions
- **Unused Credits Tracking** - Dashboard shows paid but unused drop-off credits
- **Courier PIN System** - Couriers can set their own PIN via web dashboard for kiosk login
- **PIN Management UI** - Admin can send temporary PINs, reset PINs, and view PIN status
- **Unified Transactions View** - All monetary transactions in one place with filtering

## 🏗️ Technology Stack

### Core Framework
- **Next.js 16** - App Router with server components
- **TypeScript 5** - End-to-end type safety
- **Tailwind CSS 4** - Utility-first styling

### UI Components
- **shadcn/ui** - Accessible component library
- **Lucide React** - Consistent iconography
- **Framer Motion** - Smooth animations

### Backend & Database
- **Prisma ORM** - Type-safe database operations
- **SQLite/PostgreSQL** - Flexible database support
- **NextAuth.js** - Authentication system

### Integrations
- **DimePay Web SDK** - Payment processing
- **TextBee** - SMS notifications
- **Bestwond API** - Hardware locker control
- **Nodemailer** - Email notifications

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── kiosk/         # Kiosk endpoints (payment, orders, codes)
│   │   ├── webhooks/      # DimePay, Bestwond, TextBee webhooks
│   │   └── ...            # Other API routes
│   ├── pay/[reference]/   # Mobile payment page
│   ├── dashboard/         # Admin dashboard
│   └── page.tsx           # Kiosk UI
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── lib/                  # Core libraries
│   ├── bestwond.ts       # Locker hardware API
│   ├── dimepay.ts        # Payment SDK
│   ├── textbee.ts        # SMS gateway
│   ├── email.ts          # Email client
│   └── settings.ts       # Configuration management
└── prisma/
    └── schema.prisma     # Database schema
```

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="file:./dev.db"

# DimePay (Payment Gateway)
DIMEPAY_LIVE_CLIENT_ID="ck_..."
DIMEPAY_LIVE_SECRET_KEY="sk_..."
DIMEPAY_SANDBOX_CLIENT_ID="ck_test_..."
DIMEPAY_SANDBOX_SECRET_KEY="sk_test_..."
DIMEPAY_SANDBOX_MODE="false"

# TextBee (SMS)
TEXTBEE_API_KEY="..."
TEXTBEE_DEVICE_ID="..."

# Email (Nodemailer)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_USER="your@email.com"
EMAIL_PASSWORD="app-password"
EMAIL_ENABLED="true"

# Bestwond (Locker Hardware)
BESTWOND_APP_ID="..."
BESTWOND_APP_SECRET="..."
BESTWOND_DEVICE_ID="2100018247"
```

### Database Settings

Settings can be configured via the admin dashboard or directly in the database:

| Key | Description | Default |
|-----|-------------|---------|
| `dimepay_passFeeToCustomer` | Pass DimePay fee to customer | `true` |
| `dimepay_feePercentage` | Percentage fee | `2.5` |
| `dimepay_fixedFee` | Fixed fee in JMD | `30` |
| `textbee_enabled` | Enable SMS notifications | `true` |
| `email_enabled` | Enable email notifications | `false` |

## 🎯 User Flows

### Customer Drop-off Flow

```
1. Kiosk → DROP-OFF → Buy a Drop-off Code
2. Select box size (S: $150, M: $200, L: $300, XL: $400)
3. Enter phone number (+ optional email)
4. Choose payment method:
   
   Option A: PAY HERE
   └── Redirect to DimePay on this device
   └── Complete payment
   └── Return to success page
   
   Option B: PAY ON YOUR PHONE
   └── Show QR code on kiosk
   └── Scan with phone → Pay on phone
   └── Kiosk polls for completion
   └── Shows "Deposit Now" when paid

5. Payment success → Show save code
6. "OPEN LOCKER NOW" button → Box opens immediately
7. Place package → Close door → Done!
8. Recipient receives pickup code via SMS/email
```

### Alternate: Use Existing Save Code

```
1. Kiosk → DROP-OFF → I have a Drop-off Code
2. Enter 6-digit save code
3. Box opens → Place package → Close door
4. Recipient receives pickup code via SMS
```

### Package Pickup Flow

```
1. Kiosk → PICKUP
2. Enter 6-digit pickup code (received via SMS)
3. If storage fee applies → Pay via DimePay
4. Box opens → Collect package → Done!
```

### Courier Flow

```
1. Kiosk → DROP-OFF → I'm a Courier
2. Enter phone number + PIN
3. Enter sender name (optional)
4. Select box size
5. Enter recipient phone
6. Balance deducted → Box opens
7. Place package → Close door → Recipient gets SMS
```

### Courier PIN Setup Flow

```
1. Admin creates courier account (name, phone)
2. Admin sends temporary PIN via dashboard (SMS sent to courier)
3. Courier visits /courier/pin or uses link from admin
4. Courier enters phone number
5. Courier enters temporary PIN (received via SMS)
6. Courier sets new 4-digit PIN
7. Courier confirms new PIN
8. PIN is now active for kiosk login
```

**PIN Status Indicators:**
- 🟢 Green: PIN set and active
- 🟡 Yellow: Temporary PIN sent, awaiting setup
- 🔴 Red: No PIN set

## 🔌 API Endpoints

### Kiosk APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kiosk/payment` | POST | Create drop-off payment |
| `/api/kiosk/payment` | GET | Check payment status |
| `/api/kiosk/order` | POST | Create courier order |
| `/api/kiosk/use-code` | POST | Use save/pick code |

### Courier PIN APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/courier/pin` | GET | Check courier PIN status by phone or courierId |
| `/api/courier/pin` | POST | Set new PIN (validates temp PIN first) |
| `/api/courier/pin` | PUT | Send/reset temporary PIN via SMS |

### Transactions API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transactions` | GET | List all transactions with filtering |
| `/api/transactions` | GET | Returns summary statistics |

**Transaction Categories:**
- `all` - All transactions
- `payment_in` - Customer payments (drop-off, storage fees)
- `courier` - Courier account transactions (top-ups, deductions)
- `payout` - Refunds and payouts

**Query Parameters:**
- `category` - Filter by category
- `type` - Filter by transaction type
- `status` - Filter by status (PENDING, COMPLETED, FAILED)
- `startDate` / `endDate` - Date range filter

### Webhook Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/webhooks/dimepay` | DimePay payment callbacks |
| `/api/webhooks/bestwond` | Locker hardware events |
| `/api/webhooks/textbee` | SMS delivery status |

### Debug Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/debug/dimepay` | View DimePay configuration |
| `/api/debug/boxes` | View box availability |

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Docker

```bash
# Build
docker build -t pickup-locker .

# Run
docker run -p 3000:3000 pickup-locker
```

## 🧪 Development

```bash
# Install dependencies
npm install

# Setup database
npx prisma db push
npx prisma db seed

# Start development server
npm run dev
```

### Test Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Pickup@2024` |
| Operator | `operator` | `Operator@2024` |

## 📊 Box Pricing (JMD)

| Size | Price | Description |
|------|-------|-------------|
| S | $150 | Phones, letters, small items |
| M | $200 | Shoes, books, clothing |
| L | $300 | Larger packages |
| XL | $400 | Bulky items |

## 🔒 Security

- All payments processed via DimePay's secure gateway
- Save/pick codes are 6-digit random codes
- Storage fees apply after 3 free days
- Abandoned packages handled after 30 days

## 📝 License

Private project for Dirty Hand Designs.

---

Built with ❤️ for Pickup Jamaica. Smart Locker System 📦
