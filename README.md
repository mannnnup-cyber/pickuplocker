# PICKUP - Smart Locker System

A modern, production-ready smart locker management system for package drop-off and pickup, built with Next.js 16, TypeScript, and Tailwind CSS. Deployed at UTech Campus, Jamaica — a joint venture by **Dirty Hand Designs (DHD)** and **876OnTheGo**.

## 🚀 Features

### Core Functionality
- **📦 Self-Service Drop-off** — Customers can buy drop-off codes and deposit packages 24/7
- **📤 Package Pickup** — Recipients collect packages using pickup codes
- **🚚 Courier Integration** — Couriers can drop off packages with prepaid balance
- **💰 DimePay Integration** — Secure payment processing via DimePay gateway
- **📧 Email Notifications** — Automatic confirmation emails with save codes
- **📱 SMS Notifications** — Pickup reminders via TextBee SMS gateway
- **🎟️ Manual Payments** — In-office cash/card payment recording with 24h grace periods
- **📧 Staff/Courier Invitations** — Email-based account creation for staff and couriers

### Kiosk App (Android APK)
- **📱 Bare WebView Kiosk** — Full-screen Android app wrapping the kiosk web UI
- **🔒 Two-Tier PIN Security** — Staff PIN (basic access) vs Admin PIN (full access), invisible admin layer
- **🔄 In-App Updates** — Check, download, and install APK updates directly from the kiosk (v3.3+)
- **🛡️ White Screen Watchdog** — Health monitoring detects frozen WebViews and auto-recovers
- **📴 Offline Fallback** — Branded offline page with auto-reconnect every 10 seconds
- **🔐 Screenshot Prevention** — Payment security via `FLAG_SECURE`
- **☀️ Screen Always-On** — Configurable 24/7 display for kiosk deployments
- **🔋 Auto-Start on Boot** — BootReceiver launches the app after device restart
- **📶 TLS 1.2 Support** — Backward compatibility for Android 5.1 devices
- **🎨 Brightness Control** — In-app brightness adjustment without leaving kiosk mode

### Payment Features
- **Two-Option Payment Flow** — Users can pay on current device or scan QR with another device
- **"Open Locker" Button** — Immediately open locker after successful payment
- **Email Capture** — Optional email field for receiving save codes via email
- **Customer Record Creation** — Automatic customer creation during payment flow
- **Fee Transparency** — Detailed fee logging for DimePay transactions
- **Unused Credits Tracking** — Dashboard shows paid but unused drop-off credits

### Courier Features
- **Courier PIN System** — Couriers can set their own PIN via web dashboard for kiosk login
- **PIN Management UI** — Admin can send temporary PINs, reset PINs, and view PIN status
- **Prepaid Balance** — Couriers maintain a balance for automatic deduction at drop-off

### Admin Features
- **📊 Unified Transactions View** — All monetary transactions in one place with filtering
- **📈 Reports & Stats** — Daily reports, order summaries, revenue tracking
- **🔧 Device Management** — Configure locker hardware, initialize boxes, set credentials
- **👥 User Management** — Staff and courier accounts with role-based access
- **⚡ Grace Period Extensions** — Extend manual payment grace periods with audit trail

## 🏗️ Technology Stack

### Core Framework
- **Next.js 16** — App Router with server components
- **TypeScript 5** — End-to-end type safety
- **Tailwind CSS 4** — Utility-first styling

### UI Components
- **shadcn/ui** — Accessible component library
- **Lucide React** — Consistent iconography
- **Framer Motion** — Smooth animations

### Backend & Database
- **Prisma ORM** — Type-safe database operations
- **PostgreSQL** (production) / **SQLite** (local dev)
- **NextAuth.js** — Authentication system with JWT sessions

### Integrations
- **DimePay Web SDK** — Payment processing
- **TextBee** — SMS notifications
- **Bestwond API** — Hardware locker control (SHA512 signed, 15s timeout)
- **Nodemailer** — Email notifications

### Android Kiosk
- **Bare WebView** (v2+) — Pure Java Android app, no Capacitor dependency
- **Capacitor** (v1, deprecated) — Legacy build still available
- **minSdk 22** (Android 5.1), **targetSdk 29** (Android 10)

### Deployment
- **Vercel** — Primary hosting for web app
- **Docker** — Alternative deployment option

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── kiosk/         # Kiosk endpoints (payment, orders, codes)
│   │   ├── webhooks/      # DimePay, Bestwond, TextBee webhooks
│   │   ├── app-version/   # In-app update version info & APK download
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
│   ├── locker-alloc.ts   # Locker allocation engine
│   ├── box-sizing.ts     # Box size recommendations & tiered storage fees
│   └── settings.ts       # Configuration management
└── prisma/
    └── schema.prisma     # Database schema (21 models)

bare-android/              # Android kiosk app (v2+)
├── app/src/main/
│   ├── java/com/pickupjamaica/kiosk/
│   │   ├── MainActivity.java    # Full WebView kiosk with in-app updates
│   │   └── BootReceiver.java    # Auto-start on device boot
│   ├── assets/
│   │   └── offline.html         # Branded offline fallback page
│   └── res/xml/
│       ├── file_paths.xml       # FileProvider paths for APK install
│       └── network_security_config.xml

scripts/                  # Build & utility scripts (30+)
releases/                 # APK release archive
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

### In-App Update Configuration

The kiosk app checks for updates via `/api/app-version`. Update settings are stored in `app-version.json` at the project root:

```json
{
  "version": "3.3",
  "versionCode": 7,
  "apkUrl": "https://pickuplocker.vercel.app/api/app-version/download",
  "checksum": "sha256:...",
  "changelog": "What's new in this version",
  "minVersion": "3.0",
  "forceUpdate": false
}
```

| Field | Description |
|-------|-------------|
| `version` | Latest APK version name |
| `versionCode` | Integer version code (kiosk compares this with its own) |
| `apkUrl` | Direct URL to download the APK |
| `checksum` | SHA-256 hash prefixed with `sha256:` for verification |
| `changelog` | Human-readable description of changes |
| `minVersion` | Minimum supported version (informational) |
| `forceUpdate` | If `true`, shows a blocking dialog until update is installed |

To deploy an update:
1. Build the new APK
2. Place it in `/releases/` or upload to your CDN
3. Update `app-version.json` with the new version info
4. Redeploy (or POST to `/api/app-version` to update in-place)

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

### In-App Update Flow

```
1. App checks /api/app-version on startup (30s delay) and every 4 hours
2. Server returns { version, versionCode, apkUrl, checksum, forceUpdate }
3. If versionCode > current app versionCode → Update available
4. Staff can check via menu: 5-tap → Device Code → "Check for Updates"
5. Admin can install via menu: 5-tap → Admin Code → "Install Update"
6. Download progress shown with MB counter
7. SHA-256 checksum verified (if provided)
8. Android install prompt appears → User confirms → App updates
9. BootReceiver auto-launches the updated app after install
```

## 📱 Kiosk App Details

### Accessing the Settings Menu
1. Tap the top-left corner of the screen **5 times within 3 seconds**
2. Enter a device code (Staff or Admin PIN)
3. Staff PIN → basic menu | Admin PIN → full menu

### Staff Menu Options
- WiFi Settings
- Screen Orientation (Portrait / Landscape / Auto)
- Screen Brightness
- Reload Kiosk
- Check for Updates
- Close App

### Admin Menu Options
- Open Backend Panel
- Change Server URL
- Change Device Code (Staff)
- Change Admin Code
- Check for Updates / Install Update
- Clear App Data & Cache
- WiFi Settings
- Screen Orientation
- Screen Brightness
- Toggle Screen Always-On
- Reload Kiosk
- Close App

### Default PINs
| Level | Default | Purpose |
|-------|---------|---------|
| Staff | `1111` | Basic device settings |
| Admin | `1234` | Full settings + backend access |

⚠️ **Change default PINs immediately** after first deployment. Three wrong attempts = 5 minute lockout.

### APK Release History

| Version | Code | Key Changes |
|---------|------|-------------|
| v3.3 | 7 | In-app update system, version checking, APK download & install |
| v3.2 | 6 | Two-tier PIN security, brightness control, health monitoring |
| v3.1 | 5 | BootReceiver, offline fallback page, network recovery |
| v3.0 | 4 | Bare WebView rewrite, screenshot prevention, immersive mode |
| v2.1 | 3 | Kiosk mode improvements, URL whitelisting |
| v2.0 | 2 | Initial bare Android build |

## 🔌 API Endpoints

### Kiosk APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kiosk/payment` | POST | Create drop-off payment |
| `/api/kiosk/payment` | GET | Check payment status |
| `/api/kiosk/payment-status` | GET | Poll payment completion |
| `/api/kiosk/order` | POST | Create courier order |
| `/api/kiosk/use-code` | POST | Use save/pick code |

### In-App Update APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/app-version` | GET | Check latest version info |
| `/api/app-version` | POST | Update version config (admin) |
| `/api/app-version/download` | GET | Download the latest APK file |

### Courier PIN APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/courier/pin` | GET | Check courier PIN status by phone or courierId |
| `/api/courier/pin` | POST | Set new PIN (validates temp PIN first) |
| `/api/courier/pin` | PUT | Send/reset temporary PIN via SMS |

### Payment APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments` | GET | List payments |
| `/api/payments/create` | POST | Create payment |
| `/api/payments/manual` | POST | Record manual payment |
| `/api/payments/manual/extend-grace` | POST | Extend grace period |
| `/api/payments/unused-credits` | GET | List unused credits |

### Transactions API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transactions` | GET | List all transactions with filtering |

**Transaction Categories:** `all`, `payment_in`, `courier`, `payout`

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
| `/api/health` | Health check |
| `/api/diagnostics` | Full system diagnostics |

## 📊 Box Pricing (JMD)

| Size | Price | Dimensions | Description |
|------|-------|-----------|-------------|
| S | $150 | 25×20×15cm | Phones, letters, small items |
| M | $200 | 35×30×25cm | Shoes, books, clothing |
| L | $300 | 50×40×35cm | Larger packages |
| XL | $400 | 70×50×45cm | Bulky items |

### Storage Fees
- **First 3 days**: Free
- **Days 4-10**: Base rate per day
- **Days 11-17**: 1.5× base rate
- **Days 18+**: 2× base rate
- **Abandoned**: After 30 days

## 🔒 Security

- All payments processed via DimePay's secure gateway
- Save/pick codes are 6-digit random codes
- Screenshot prevention (`FLAG_SECURE`) on kiosk app
- Two-tier PIN system with lockout after 3 failed attempts
- APK updates verified via SHA-256 checksum
- Bestwond API requests signed with SHA512
- Storage fees apply after 3 free days
- Abandoned packages handled after 30 days

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

### Building the Android APK

```bash
# First time or after manifest changes: full Gradle build
cd bare-android
./gradlew assembleRelease

# After that, quick DEX injection build:
./scripts/build-apk.sh

# Output: /download/PickupJamaica-kiosk-v3.3.apk
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

## 📝 License

Private project for Dirty Hand Designs.
