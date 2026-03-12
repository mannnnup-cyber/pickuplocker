// TextBee SMS Gateway Integration
// Documentation: https://textbee.dev/

import { getTextbeeConfig, getSetting } from './settings';
import prisma from './prisma';

interface TextBeeConfig {
  apiKey: string;
  deviceId: string;
  baseUrl: string;
}

interface SMSMessage {
  to: string;
  message: string;
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  segments?: number;
  estimatedCost?: number;
}

interface BulkSMSResult {
  success: boolean;
  sent: number;
  failed: number;
  results: SMSResult[];
}

// Legacy sync config for backward compatibility (reads from env only)
export function getConfig(): TextBeeConfig {
  return {
    apiKey: process.env.TEXTBEE_API_KEY || '',
    deviceId: process.env.TEXTBEE_DEVICE_ID || '',
    baseUrl: 'https://api.textbee.dev/api/v1/gateway',
  };
}

// Async config that reads from database first
export async function getConfigAsync(): Promise<TextBeeConfig> {
  const settings = await getTextbeeConfig();
  return {
    apiKey: settings.apiKey,
    deviceId: settings.deviceId,
    baseUrl: 'https://api.textbee.dev/api/v1/gateway',
  };
}

// Get signature from settings
async function getSignature(): Promise<string> {
  const signature = await getSetting('sms_signature', 'SMS_SIGNATURE');
  return signature || '- Pickup Jamaica';
}

// Get cost per SMS from settings
async function getCostPerSms(): Promise<number> {
  const costStr = await getSetting('sms_costPerSms', 'SMS_COST_PER_SMS');
  return parseFloat(costStr) || 5;
}

// Calculate SMS segments (160 chars per segment, 153 if using concatenation)
function calculateSegments(message: string): number {
  const length = message.length;
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

// Process template with variables
function processTemplate(template: string, variables: Record<string, string | number>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return processed;
}

// Get system user for notifications
async function getSystemUser() {
  let systemUser = await prisma.user.findFirst({
    where: { email: 'system@pickupja.com' }
  });
  
  if (!systemUser) {
    try {
      systemUser = await prisma.user.create({
        data: {
          email: 'system@pickupja.com',
          name: 'System',
          role: 'ADMIN',
        }
      });
    } catch {
      systemUser = await prisma.user.findFirst({
        where: { email: 'system@pickupja.com' }
      });
    }
  }
  
  return systemUser;
}

// Save notification to database
async function saveNotification(
  phone: string,
  message: string,
  success: boolean,
  messageId?: string,
  error?: string,
  templateKey?: string,
  cost?: number,
  segments?: number
) {
  try {
    const systemUser = await getSystemUser();
    if (!systemUser) return;

    await prisma.notification.create({
      data: {
        userId: systemUser.id,
        type: 'SMS',
        status: success ? 'SENT' : 'FAILED',
        recipient: phone,
        message: message,
        templateKey: templateKey || null,
        gatewayRef: messageId || null,
        errorMessage: error || null,
        sentAt: success ? new Date() : null,
        cost: cost || null,
        segments: segments || null,
      }
    });
  } catch (err) {
    console.error('Failed to save notification:', err);
  }
}

// Send SMS using a template
export async function sendTemplateSMS(
  phone: string,
  templateKey: string,
  variables: Record<string, string | number>
): Promise<SMSResult> {
  const config = await getConfigAsync();
  const signature = await getSignature();
  const costPerSms = await getCostPerSms();
  
  if (!config.apiKey || !config.deviceId) {
    return { success: false, error: 'TextBee not configured' };
  }

  // Get template from database
  const template = await prisma.smsTemplate.findUnique({
    where: { key: templateKey }
  });

  if (!template) {
    return { success: false, error: `Template '${templateKey}' not found` };
  }

  // Add signature to variables
  const allVariables = { ...variables, signature };
  
  // Process template
  const message = processTemplate(template.template, allVariables);
  
  // Clean phone number
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  
  try {
    const response = await fetch(`${config.baseUrl}/devices/${config.deviceId}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        recipients: [cleanPhone],
        message: message,
      }),
    });

    const data = await response.json();
    
    const segments = calculateSegments(message);
    const cost = segments * costPerSms;
    
    if (response.ok && data.data?.success) {
      // Save to database
      await saveNotification(phone, message, true, data.data?.smsBatchId, undefined, templateKey, cost, segments);
      
      return {
        success: true,
        messageId: data.data?.smsBatchId,
        segments,
        estimatedCost: cost,
      };
    } else {
      const errorMsg = data.message || data.error || data.data?.message || 'Failed to send SMS';
      await saveNotification(phone, message, false, undefined, errorMsg, templateKey, cost, segments);
      
      return {
        success: false,
        error: errorMsg,
        segments,
        estimatedCost: cost,
      };
    }
  } catch (error) {
    console.error('TextBee sendSMS error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

/**
 * Send a single SMS message
 * @param phoneNumber - Recipient phone number
 * @param message - Message content
 * @param skipSignature - If true, don't auto-append signature (for templates that already include it)
 */
export async function sendSMS(phoneNumber: string, message: string, skipSignature: boolean = false): Promise<SMSResult> {
  const config = await getConfigAsync();
  const signature = await getSignature();
  const costPerSms = await getCostPerSms();
  
  if (!config.apiKey) {
    return { success: false, error: 'TextBee API key not configured' };
  }
  
  if (!config.deviceId) {
    return { success: false, error: 'TextBee Device ID not configured. Connect your phone in TextBee dashboard to get the Device ID.' };
  }

  // Append signature if not already present and skipSignature is false
  let finalMessage = message;
  if (!skipSignature && !message.includes(signature) && !message.includes('{{signature}}')) {
    finalMessage = `${message}\n\n${signature}`;
  }

  // Clean phone number (remove dashes, spaces, etc.)
  const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
  
  const segments = calculateSegments(finalMessage);
  const cost = segments * costPerSms;
  
  try {
    const response = await fetch(`${config.baseUrl}/devices/${config.deviceId}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        recipients: [cleanPhone],
        message: finalMessage,
      }),
    });

    const data = await response.json();
    
    if (response.ok && data.data?.success) {
      // Save to database
      await saveNotification(phoneNumber, finalMessage, true, data.data?.smsBatchId, undefined, undefined, cost, segments);
      
      return {
        success: true,
        messageId: data.data?.smsBatchId,
        segments,
        estimatedCost: cost,
      };
    } else {
      const errorMsg = data.message || data.error || data.data?.message || 'Failed to send SMS';
      await saveNotification(phoneNumber, finalMessage, false, undefined, errorMsg, undefined, cost, segments);
      
      return {
        success: false,
        error: errorMsg,
        segments,
        estimatedCost: cost,
      };
    }
  } catch (error) {
    console.error('TextBee sendSMS error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

/**
 * Send bulk SMS messages
 */
export async function sendBulkSMS(messages: SMSMessage[]): Promise<BulkSMSResult> {
  const config = await getConfigAsync();
  
  if (!config.apiKey || !config.deviceId) {
    return {
      success: false,
      sent: 0,
      failed: messages.length,
      results: messages.map(() => ({ 
        success: false, 
        error: 'TextBee not configured' 
      })),
    };
  }

  // Group by phone number and send
  const results: SMSResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    const result = await sendSMS(msg.to, msg.message);
    results.push(result);
    if (result.success) sent++;
    else failed++;
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    success: failed === 0,
    sent,
    failed,
    results,
  };
}

/**
 * Send pickup code notification (uses template)
 */
export async function sendPickupNotification(
  phone: string, 
  customerName: string,
  trackingCode: string,
  location: string,
  expiryDate: string
): Promise<SMSResult> {
  return sendTemplateSMS(phone, 'pickup_notification', {
    customerName,
    trackingCode,
    location,
    expiryDate,
  });
}

/**
 * Send storage fee notification (uses template)
 */
export async function sendStorageFeeNotification(
  phone: string,
  customerName: string,
  storageDays: number,
  fee: number
): Promise<SMSResult> {
  return sendTemplateSMS(phone, 'storage_fee', {
    customerName,
    storageDays,
    fee,
  });
}

/**
 * Send pickup confirmation (uses template)
 */
export async function sendPickupConfirmation(
  phone: string,
  customerName: string
): Promise<SMSResult> {
  return sendTemplateSMS(phone, 'pickup_confirmation', {
    customerName,
  });
}

/**
 * Send overdue reminder (uses template)
 */
export async function sendOverdueReminder(
  phone: string,
  customerName: string,
  storageDays: number,
  totalFee: number,
  daysUntilAbandoned: number
): Promise<SMSResult> {
  return sendTemplateSMS(phone, 'overdue_reminder', {
    customerName,
    storageDays,
    totalFee,
    daysUntilAbandoned,
    supportPhone: '876-XXX-XXXX',
  });
}

/**
 * Get device status (check if phone is connected)
 */
export async function getDeviceStatus(): Promise<{ 
  success: boolean; 
  online?: boolean; 
  error?: string;
  status?: number;
  details?: Record<string, unknown>;
}> {
  const config = await getConfigAsync();
  
  if (!config.apiKey) {
    return { success: false, error: 'TextBee API key not configured' };
  }
  
  if (!config.deviceId) {
    return { success: false, error: 'Device ID not configured' };
  }

  try {
    // TextBee API: List all devices and find ours
    const response = await fetch(`${config.baseUrl}/devices`, {
      method: 'GET',
      headers: {
        'x-api-key': config.apiKey,
      },
    });

    const data = await response.json();
    
    if (response.ok && data.data) {
      // Find our device in the list
      const devices = data.data;
      const ourDevice = devices.find((d: { _id: string }) => d._id === config.deviceId);
      
      if (ourDevice) {
        // Device is considered online if:
        // 1. Device exists and is enabled
        // 2. OR has recent activity (within 2 hours)
        // TextBee queues SMS anyway, so even if phone sleeps, messages will be delivered
        const isEnabled = ourDevice.enabled === true;
        const lastUpdate = new Date(ourDevice.updatedAt).getTime();
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const hasRecentActivity = lastUpdate > twoHoursAgo;
        const isOnline = isEnabled || hasRecentActivity;
        
        return {
          success: true,
          online: isOnline,
          details: {
            brand: ourDevice.brand,
            model: ourDevice.model,
            sentSMSCount: ourDevice.sentSMSCount,
            receivedSMSCount: ourDevice.receivedSMSCount,
            lastUpdate: ourDevice.updatedAt,
            enabled: ourDevice.enabled,
          },
        };
      } else {
        return {
          success: false,
          error: 'Device not found in account',
        };
      }
    } else {
      return {
        success: false,
        status: response.status,
        error: data.message || data.error || `HTTP ${response.status}`,
        details: data,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get device status',
    };
  }
}

// Export default client
const TextBeeClient = {
  sendSMS,
  sendBulkSMS,
  sendTemplateSMS,
  sendPickupNotification,
  sendStorageFeeNotification,
  sendPickupConfirmation,
  sendOverdueReminder,
  getDeviceStatus,
};

export default TextBeeClient;
