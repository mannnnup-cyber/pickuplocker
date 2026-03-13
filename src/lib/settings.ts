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
  
  return {
    apiKey: settings['dimepay_apiKey'] || process.env.DIMEPAY_API_KEY || '',
    merchantId: settings['dimepay_merchantId'] || process.env.DIMEPAY_MERCHANT_ID || '',
    baseUrl: settings['dimepay_baseUrl'] || process.env.DIMEPAY_BASE_URL || 'https://api.dimepay.io',
    enabled: settings['dimepay_enabled'] !== 'false',
    passFeeToCustomer: settings['dimepay_passFeeToCustomer'] !== 'false',
    passFeeToCourier: settings['dimepay_passFeeToCourier'] === 'true',
    feePercentage: parseFloat(settings['dimepay_feePercentage'] || '2.5'),
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

// Get email configuration
export async function getEmailConfig() {
  const settings = await loadSettings();
  
  return {
    enabled: settings['email_enabled'] === 'true',
    host: settings['email_host'] || process.env.EMAIL_HOST || '',
    port: parseInt(settings['email_port'] || '587'),
    secure: settings['email_secure'] === 'true',
    user: settings['email_user'] || process.env.EMAIL_USER || '',
    password: settings['email_password'] || process.env.EMAIL_PASSWORD || '',
    fromEmail: settings['email_fromEmail'] || process.env.EMAIL_FROM_EMAIL || 'noreply@pickupja.com',
    fromName: settings['email_fromName'] || process.env.EMAIL_FROM_NAME || 'Pickup Jamaica',
  };
}

// Clear cache when settings are updated
export function clearSettingsCache() {
  settingsCache = null;
  cacheExpiry = 0;
}
