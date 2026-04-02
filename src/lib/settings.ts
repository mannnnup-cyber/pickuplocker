// Settings helper - reads from database with env fallback
import { db } from './db';

// Cache settings in memory for performance
let settingsCache: Record<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Get all settings from database
async function loadSettings(): Promise<Record<string, string>> {
  // Check cache
  if (settingsCache && Date.now() < cacheExpiry) {
    return settingsCache;
  }

  try {
    const settings = await db.setting.findMany();
    settingsCache = {};
    for (const setting of settings) {
      settingsCache[setting.key] = setting.value;
    }
    cacheExpiry = Date.now() + CACHE_TTL;
    return settingsCache;
  } catch (error) {
    console.error('Failed to load settings from database:', error);
    return {};
  }
}

// Get a single setting value with fallback to env var
export async function getSetting(key: string, envKey?: string): Promise<string> {
  const settings = await loadSettings();
  
  // First check database
  if (settings[key]) {
    return settings[key];
  }
  
  // Fallback to environment variable
  if (envKey && process.env[envKey]) {
    return process.env[envKey] || '';
  }
  
  // Try the key directly as env var
  if (process.env[key]) {
    return process.env[key] || '';
  }
  
  return '';
}

// Get Bestwond configuration
export async function getBestwondConfig() {
  const settings = await loadSettings();
  
  return {
    appId: settings['bestwond_appId'] || process.env.BESTWOND_APP_ID || '',
    appSecret: settings['bestwond_appSecret'] || process.env.BESTWOND_APP_SECRET || '',
    deviceId: settings['bestwond_deviceId'] || process.env.BESTWOND_DEVICE_ID || '',
    baseUrl: settings['bestwond_baseUrl'] || process.env.BESTWOND_BASE_URL || 'https://api.bestwond.com',
    enabled: settings['bestwond_enabled'] !== 'false',
  };
}

// Get TextBee configuration
export async function getTextbeeConfig() {
  const settings = await loadSettings();
  
  return {
    apiKey: settings['textbee_apiKey'] || process.env.TEXTBEE_API_KEY || '',
    deviceId: settings['textbee_deviceId'] || process.env.TEXTBEE_DEVICE_ID || '',
    senderName: settings['textbee_senderName'] || 'PickupJA',
    enabled: settings['textbee_enabled'] !== 'false',
  };
}

// Get DimePay configuration
export async function getDimepayConfig() {
  const settings = await loadSettings();
  
  // Check sandbox mode - prefer sandboxMode setting, ignore testMode for clarity
  // sandboxMode = 'false' means LIVE mode
  // sandboxMode = 'true' means SANDBOX mode
  // Legacy 'testMode' is ignored to prevent confusion
  const sandboxMode = settings['dimepay_sandboxMode'] === 'true';
  
  console.log('[DimePay Config] Raw settings:', {
    sandboxMode: settings['dimepay_sandboxMode'],
    testMode: settings['dimepay_testMode'],
    liveClientId: settings['dimepay_live_clientId'] ? 'SET' : 'NOT SET',
    liveSecretKey: settings['dimepay_live_secretKey'] ? 'SET' : 'NOT SET',
    sandboxClientId: settings['dimepay_sandbox_clientId'] ? 'SET' : 'NOT SET',
    sandboxSecretKey: settings['dimepay_sandbox_secretKey'] ? 'SET' : 'NOT SET',
  });
  
  // DimePay uses the same base URL for both sandbox and production
  const baseUrl = 'https://api.dimepay.app';
  
  // Support BOTH credential formats:
  // Format 1: Client ID + Secret Key (ck_test_/ck_live_ prefix) - for SDK integration
  // Format 2: API Key + Merchant ID (sk_ prefix) - for direct API integration
  
  const sandboxClientId = settings['dimepay_sandbox_clientId'] || '';
  const sandboxSecretKey = settings['dimepay_sandbox_secretKey'] || '';
  const liveClientId = settings['dimepay_live_clientId'] || '';
  const liveSecretKey = settings['dimepay_live_secretKey'] || '';
  
  // Old format credentials (API Key + Merchant ID)
  const apiKey = settings['dimepay_apiKey'] || process.env.DIMEPAY_API_KEY || '';
  const merchantId = settings['dimepay_merchantId'] || process.env.DIMEPAY_MERCHANT_ID || '';
  
  // Determine which format to use
  const hasClientCredentials = sandboxMode 
    ? !!(sandboxClientId && sandboxSecretKey)
    : !!(liveClientId && liveSecretKey);
  const hasApiCredentials = !!(apiKey && merchantId);
  
  // Use API key format if those credentials exist, otherwise use client ID format
  const useApiFormat = hasApiCredentials;
  
  const clientId = sandboxMode ? sandboxClientId : liveClientId;
  const secretKey = sandboxMode ? sandboxSecretKey : liveSecretKey;
  
  console.log('[DimePay Config] Effective config:', {
    mode: sandboxMode ? 'SANDBOX' : 'LIVE',
    clientIdSet: !!clientId,
    secretKeySet: !!secretKey,
    clientIdPrefix: clientId ? clientId.substring(0, 12) + '...' : '(none)',
  });
  
  return {
    // Client ID format (for SDK integration) - these are the effective credentials based on mode
    clientId,
    secretKey,
    // Individual credentials for both modes (for debugging/selection)
    sandboxClientId,
    sandboxSecretKey,
    liveClientId,
    liveSecretKey,
    // API Key format (for direct API integration)
    apiKey,
    merchantId,
    // Which format is being used
    useApiFormat,
    hasClientCredentials,
    hasApiCredentials,
    // Common settings
    baseUrl,
    sandboxMode,
    enabled: settings['dimepay_enabled'] !== 'false',
    passFeeToCustomer: settings['dimepay_passFeeToCustomer'] !== 'false',
    passFeeToCourier: settings['dimepay_passFeeToCourier'] === 'true',
    feePercentage: parseFloat(settings['dimepay_feePercentage'] || settings['dimepay_feePercent'] || '2.5'),
    fixedFee: parseFloat(settings['dimepay_fixedFee'] || '30'),
  };
}

// Get storage fee settings
export async function getStorageSettings() {
  const settings = await loadSettings();
  
  return {
    freeDays: parseInt(settings['storage_freeDays'] || '3'),
    tier1Fee: parseInt(settings['storage_tier1Fee'] || '100'),
    tier2Fee: parseInt(settings['storage_tier2Fee'] || '150'),
    tier3Fee: parseInt(settings['storage_tier3Fee'] || '200'),
    maxDays: parseInt(settings['storage_maxDays'] || '30'),
  };
}

// Get business settings
export async function getBusinessSettings() {
  const settings = await loadSettings();
  
  return {
    brandName: settings['business_brandName'] || 'Pickup',
    location: settings['business_location'] || 'UTech Campus',
    partners: settings['business_partners'] || 'Dirty Hand Designs + 876OnTheGo',
    phone: settings['business_phone'] || '876-XXX-XXXX',
    email: settings['business_email'] || 'support@pickupja.com',
  };
}

// Get notification settings
export async function getNotificationSettings() {
  const settings = await loadSettings();
  
  return {
    smsEnabled: settings['notifications_smsEnabled'] !== 'false',
    emailEnabled: settings['notifications_emailEnabled'] === 'true',
    whatsappEnabled: settings['notifications_whatsappEnabled'] === 'true',
    pickupReminderHours: parseInt(settings['notifications_pickupReminder'] || '24'),
    abandonedWarningDays: parseInt(settings['notifications_abandonedWarning'] || '25'),
  };
}

// Get email configuration (Resend)
export async function getEmailConfig() {
  const settings = await loadSettings();
  
  return {
    enabled: settings['email_enabled'] === 'true',
    // Resend settings
    apiKey: settings['resend_apiKey'] || process.env.RESEND_API_KEY || '',
    fromEmail: settings['resend_fromEmail'] || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    fromName: settings['resend_fromName'] || process.env.RESEND_FROM_NAME || 'Pickup Jamaica',
    // Legacy SMTP settings (kept for reference)
    host: settings['email_host'] || process.env.EMAIL_HOST || '',
    port: parseInt(settings['email_port'] || '587'),
    secure: settings['email_secure'] === 'true',
    user: settings['email_user'] || process.env.EMAIL_USER || '',
    password: settings['email_password'] || process.env.EMAIL_PASSWORD || '',
  };
}

// Get Resend configuration
export async function getResendConfig() {
  const settings = await loadSettings();
  
  return {
    apiKey: settings['resend_apiKey'] || process.env.RESEND_API_KEY || '',
    fromEmail: settings['resend_fromEmail'] || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    fromName: settings['resend_fromName'] || process.env.RESEND_FROM_NAME || 'Pickup Jamaica',
    enabled: settings['email_enabled'] === 'true',
  };
}

// Clear cache when settings are updated
export function clearSettingsCache() {
  settingsCache = null;
  cacheExpiry = 0;
}
