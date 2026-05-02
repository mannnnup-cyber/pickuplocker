# Vercel Environment Variables Setup Guide

## Current Status
The System Status panel on the dashboard shows connection status for all services. Currently showing:
- **Database**: Offline (environment variables not set on Vercel)
- **Bestwond Lockers**: Warning (API credentials need verification)
- **DimePay**: Configured
- **TextBee SMS**: Not configured

## Setup Instructions for Vercel

### Step 1: Go to Vercel Dashboard
1. Navigate to: https://vercel.com/dashboard
2. Select the **pickuplocker** project
3. Go to **Settings** → **Environment Variables**

### Step 2: Add the following Environment Variables

Copy and paste each variable:

```
DATABASE_URL=postgresql://postgres:Pickuplockpro@db.fncqazlddawrheoboxbd.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
```

```
DIRECT_DATABASE_URL=postgresql://postgres:Pickuplockpro@db.fncqazlddawrheoboxbd.supabase.co:5432/postgres?sslmode=require
```

```
BESTWOND_BASE_URL=https://api.bestwond.com
```

```
BESTWOND_APP_ID=bw_57c12404463d11e
```

```
BESTWOND_APP_SECRET=57c12512463d11eeb63500163e198b20
```

```
BESTWOND_DEVICE_ID=2100012858
```

```
DIMEPAY_API_KEY=sk_zPS5d7zPpXxcTEAecP5TUO3ZJHbOW
```

```
DIMEPAY_MERCHANT_ID=m9yCMgXfdeDjRto
```

```
DIMEPAY_CLIENT_KEY=ck_rdq-r7tqOqdZ-MoY4cdkBbC2-CFj2
```

```
DIMEPAY_BASE_URL=https://api.dimepay.io
```

```
NEXTAUTH_SECRET=dirtyhand_secret_key_2025
```

```
NEXTAUTH_URL=https://pickuplocker.vercel.app
```

```
APP_NAME=Pickup
```

```
STORAGE_FREE_DAYS=3
```

```
STORAGE_FEE_TIER1=100
```

```
STORAGE_FEE_TIER2=150
```

```
STORAGE_FEE_TIER3=200
```

```
ABANDONED_DAYS=30
```

```
CURRENCY=JMD
```

### Step 3: Optional - TextBee SMS Configuration
If you have TextBee credentials:

```
TEXTBEE_API_KEY=your_actual_textbee_api_key
```

```
TEXTBEE_DEVICE_ID=your_actual_textbee_device_id
```

### Step 4: Redeploy
After adding all environment variables:
1. Go to **Deployments** tab
2. Click the **...** menu on the latest deployment
3. Select **Redeploy**

## Important Notes

### Database Connection
- **DATABASE_URL** uses port **6543** with `pgbouncer=true` for connection pooling
- This is required for Vercel serverless functions
- **DIRECT_DATABASE_URL** uses port **5432** for migrations

### Supabase Connection Pooling
If the pooling URL doesn't work, you can also try the Supabase Pooler URL format:
```
postgresql://postgres.fncqazlddawrheoboxbd:Pickuplockpro@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Check your Supabase dashboard → Settings → Database → Connection Pooling for the exact URL.

## Verify Setup
After redeployment, visit:
- https://pickuplocker.vercel.app/api/status - Check all services are online
- https://pickuplocker.vercel.app/dashboard - View the System Status panel
