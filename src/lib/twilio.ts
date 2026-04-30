// Twilio SMS Service for Pickup Locker Notifications
// This module handles all SMS communication via Twilio

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber ||
      accountSid === 'ACxxxxxxxxxxxxxxxxxxxx' ||
      authToken === 'xxxxxxxxxxxxxxxxxxxxxxxx') {
    return null;
  }
  return { accountSid, authToken, phoneNumber };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export interface SendSmsParams {
  to: string;
  message: string;
}

export interface SmsResult {
  success: boolean;
  sid?: string;
  error?: string;
  simulated?: boolean;
}

export async function sendSms({ to, message }: SendSmsParams): Promise<SmsResult> {
  const config = getTwilioConfig();

  // If Twilio is not configured, simulate the SMS
  if (!config) {
    console.log(`[SMS SIMULATION] To: ${to}, Message: ${message}`);
    return {
      success: true,
      sid: `SIM_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      simulated: true,
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: to,
      From: config.phoneNumber,
      Body: message,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `Twilio error: ${response.status}`,
      };
    }

    return {
      success: true,
      sid: data.sid,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to send SMS',
    };
  }
}

// ─── SMS Message Templates ───

export function depositNotificationTemplate(params: {
  customerName: string;
  trackingCode: string;
  lockerNumber: string;
  locationName: string;
  freeHours: number;
}): string {
  return `Hi ${params.customerName}! Your package (${params.trackingCode}) has been deposited in locker ${params.lockerNumber} at ${params.locationName}. You have ${params.freeHours} hours of free storage. Please collect it soon!`;
}

export function collectionReminderTemplate(params: {
  customerName: string;
  trackingCode: string;
  lockerNumber: string;
  freeHoursLeft: number;
}): string {
  return `Reminder: ${params.customerName}, your package (${params.trackingCode}) in locker ${params.lockerNumber} has ${params.freeHoursLeft} hours of free storage left. After that, storage fees will apply. Collect it now!`;
}

export function overdueNoticeTemplate(params: {
  customerName: string;
  trackingCode: string;
  lockerNumber: string;
  currentFee: string;
}): string {
  return `OVERDUE NOTICE: ${params.customerName}, your package (${params.trackingCode}) in locker ${params.lockerNumber} has exceeded the free storage period. Current storage fee: $${params.currentFee}. Please collect your package or fees will continue to accrue.`;
}

export function feeChargedTemplate(params: {
  customerName: string;
  trackingCode: string;
  amount: string;
  newBalance: string;
}): string {
  return `Storage Fee Charged: ${params.customerName}, a storage fee of $${params.amount} has been charged for package ${params.trackingCode}. Your remaining balance: $${params.newBalance}.`;
}

export function feeWarningTemplate(params: {
  customerName: string;
  trackingCode: string;
  estimatedFee: string;
}): string {
  return `Fee Warning: ${params.customerName}, your package ${params.trackingCode} is approaching the end of free storage. Estimated fee if not collected: $${params.estimatedFee}. Collect now to avoid charges!`;
}
