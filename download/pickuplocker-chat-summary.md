# PickupLocker — Project Handoff Summary

> **Last updated:** 2025-03-04  
> **Purpose:** Complete conversation context for continuing development in a new chat session.

---

## Project Overview

**PickupLocker** is a smart locker kiosk system with two delivery targets:

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web App | Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma ORM | Full-stack React |
| Database (local) | SQLite | Conflicts with schema provider |
| Database (Vercel) | PostgreSQL | Required for production |
| Android APK | Bare WebView app | Loads kiosk-lite URL |

- **Production URL:** https://pickuplocker.vercel.app
- **GitHub Repo:** https://github.com/mannnnup-cyber/pickuplocker
- **GitHub PAT:** `[REDACTED_PAT]` (NOT in git repo — removed for push protection)
- **Brand Colors:** Gold `#FFD439` · Black `#111111`

---

## Android APK Details

### Bare Android Build (`/bare-android/`)

| Setting | Value |
|---------|-------|
| Gradle | 8.4 |
| AGP | 8.1.4 |
| JDK | 17 |
| minSdk | 22 |
| compileSdk | 33 |
| targetSdk | 29 (lowered from 33 to fix crash) |
| Orientation | Portrait (fixed from landscape) |

**Keystore:**
- File: `pickup-jamaica.jks`
- Password: `pickup123`
- Alias: `pickup`

**Security — Two-tier PIN system:**
- Staff PIN: `1111`
- Admin PIN: `1234`
- 3 wrong attempts → 5-minute lockout

**WebView Configuration:**
- Custom User-Agent: `PickupKiosk/3.0` (appended to standard WebView UA)
- `setAppCacheEnabled` removed for Android 5.1 compatibility
- Loads `https://pickuplocker.vercel.app/kiosk-lite`

### Capacitor Build (`/android/`)
- Also exists but bare Android is the primary build path

---

## Architecture

### Dual UI Design

| Route | Type | Rendering | Target |
|-------|------|-----------|--------|
| `/kiosk-lite` | Server HTML (ES5) | `route.ts` — raw HTML string | Android 5.x WebView, locker tablets |
| `/` | React SPA | Modern components | Phones, desktop browsers |
| `/pay/[reference]` | React page | Payment flow | All devices |

**Key behavioral differences:**
- **Kiosk-lite:** QR code payment only — no "Pay Here" option (by design for lockers)
- **React SPA:** Has both "Pay Here" + "Pay on Phone" options

### Middleware
- `src/middleware.ts` redirects old Android WebViews (detected by UA) to `/kiosk-lite`
- No server-side device differentiation between locker tablets and phones

---

## Key Files & Paths

```
/home/z/my-project/                          # Next.js project root
├── prisma/schema.prisma                     # Database schema
├── src/
│   ├── app/
│   │   ├── kiosk-lite/route.ts              # Kiosk UI (server-rendered HTML, ES5)
│   │   ├── page.tsx                         # React SPA (modern UI)
│   │   ├── pay/[reference]/page.tsx         # Payment page
│   │   └── api/payments/manual/             # Manual payment endpoint (needs review)
│   ├── lib/bestwond.ts                      # Bestwond locker API integration
│   └── middleware.ts                         # UA-based redirect for old Android
├── bare-android/                            # Bare Android APK project
└── android/                                 # Capacitor Android project
```

---

## Database Schema (Prisma)

### Models

User, Device, Box, BoxLog, Order, Payment, Notification, SmsTemplate, EmailTemplate, Activity, Setting, Location, Courier, CourierTransaction, SavedPaymentMethod, SmsCampaign, ExpressOrder, LockerSync, ManualPayment, GracePeriodExtension

### Enums

| Enum | Values (highlights) |
|------|-------------------|
| UserRole | standard roles |
| OrderStatus | standard statuses |
| PaymentStatus | standard statuses |
| PaymentMethod | includes `MANUAL_OFFICE` |
| BoxStatus | standard statuses |
| DeviceStatus | standard statuses |
| NotificationType | standard types |
| NotificationStatus | standard statuses |
| SubscriptionPlan | standard plans |
| CourierStatus | standard statuses |
| TransactionType | includes `MANUAL_PAYMENT` |

### Manual Payment Fields on Order

- `manuallyPaidAt: DateTime?`
- `manualPaymentGraceUntil: DateTime?`

### ManualPayment Model

Tracks in-office payments with grace period details.

### GracePeriodExtension Model

Audit log for grace period extensions (who extended, why, when).

### Migration

`20240325000000_add_manual_payment/migration.sql`

---

## Previous Issues Fixed

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Vercel build failed with 93 errors | 25 files emptied in commit `2ca70e3`; restored from commit `0303178` |
| 2 | APK crash on launch | `targetSdk` 33 → 29 |
| 3 | Wrong screen orientation | Landscape → Portrait |
| 4 | Unsigned APK | Created keystore + used `apksigner` |
| 5 | `setAppCacheEnabled` crash on Android 5.1 | Removed deprecated API call |
| 6 | JDK 17 path not found | Fixed PATH configuration |
| 7 | GitHub PAT had no scopes | Regenerated with proper scopes |

---

## Manual Payment System

**Status: Database DONE · API/UI PENDING**

### Business Logic (Approved)

1. Staff looks up order by reference/pickup code
2. Staff confirms outstanding amount
3. Staff records payment (cash / card / etc.) — `MANUAL_OFFICE` method
4. Same pickup code is reused after payment
5. Staff chooses:
   - **"Open Now"** — staff opens box immediately via Bestwond API
   - **"Open Later"** — 24-hour grace period; code unblocked at kiosk
6. After 24 hours: code re-blocked, new fees accrue
7. Staff can extend grace period with reason → audit logged via `GracePeriodExtension`

### Implementation Checklist

| Item | Status |
|------|--------|
| ManualPayment database table | ✅ Done |
| GracePeriodExtension model | ✅ Done |
| `POST /api/payments/manual` endpoint | ⚠️ Files exist, need review |
| Dashboard UI with Manual Payment modal | ❌ Pending |
| Receipt generation | ❌ Pending |
| SMS confirmation with grace period expiry time | ❌ Pending |
| Cron job protection — skip manually paid orders | ❌ Pending |

---

## 8-Step Production Fix Plan

**All steps PENDING.**

1. **Login page, DimePay webhook, error pages** — foundational pages missing
2. **Seed DB with admin user, remove hardcoded credentials** — security risk
3. **Auth middleware on `/api/settings`** — currently unprotected
4. **Auth on other admin routes** — no auth enforcement
5. **Float → Decimal money types** — floating-point precision issues
6. **Rate limiting** — no protection against abuse
7. **Remove `ignoreBuildErrors`** — masking TypeScript errors
8. **Refactor dashboard + indexes** — performance & maintainability

---

## Unsolved Issues

### Critical

- **PostgreSQL on Vercel configuration** — not fully set up/verified
- **Local dev SQLite/PostgreSQL conflict** — `schema.prisma` says `postgresql` provider but `.env` points to SQLite file; causes confusion and potential data loss
- **Hardcoded credentials** — admin login still uses hardcoded values

### Architecture

- **Next.js 16 deprecates `middleware.ts`** — should migrate to "proxy" approach; not addressed
- **APK doesn't differentiate locker tablets from phones** — always loads kiosk-lite regardless
- **Kiosk-lite only shows QR payment** — no "Pay Here" option (by design for lockers, but awkward if APK runs on phones)
- **No server-side device differentiation** — locker vs phone routing is purely client-side

### Recent Discussion: Device Detection

The APK always loads `/kiosk-lite` regardless of device type. The bare Android app sends `PickupKiosk/3.0` in the User-Agent, but the server doesn't read or act on it.

**Options discussed:**
1. **Keep APK locker-only** — simplest; phones use browser
2. **Make dual-purpose** — detect phone vs tablet in APK, load different routes
3. **Add "Pay Here" to kiosk-lite** — makes kiosk-lite work for both contexts

**Status:** Awaiting user decision.

---

## Quick-Reference Commands

```bash
# Next.js dev server
cd /home/z/my-project && npm run dev

# Prisma
npx prisma generate
npx prisma db push
npx prisma migrate dev

# Bare Android APK build
cd /home/z/my-project/bare-android && ./gradlew assembleRelease

# Sign APK
apksigner sign --ks pickup-jamaica.jks --ks-pass pass:pickup123 --ks-key-alias pickup --key-pass pass:pickup123 --out app-signed.apk app-release-unsigned.apk

# Git push
git add . && git commit -m "message" && git push origin main
```

---
