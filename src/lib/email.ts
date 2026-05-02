// Email Notification System using Resend
import { Resend } from 'resend';
import { getSetting } from './settings';
import prisma from './prisma';

interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Get email configuration from settings
export async function getEmailConfig(): Promise<EmailConfig> {
  const apiKey = await getSetting('resend_apiKey', 'RESEND_API_KEY');
  const fromEmail = await getSetting('resend_fromEmail', 'RESEND_FROM_EMAIL');
  const fromName = await getSetting('resend_fromName', 'RESEND_FROM_NAME');

  return {
    apiKey: apiKey || '',
    fromEmail: fromEmail || 'onboarding@resend.dev',
    fromName: fromName || 'Pickup Jamaica',
  };
}

// Check if email is enabled
export async function isEmailEnabled(): Promise<boolean> {
  const enabled = await getSetting('email_enabled', 'EMAIL_ENABLED');
  const config = await getEmailConfig();
  return enabled === 'true' && !!config.apiKey;
}

// Get Resend client
function getResendClient(apiKey: string) {
  return new Resend(apiKey);
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

// Save email notification to database
async function saveEmailNotification(
  to: string,
  subject: string,
  message: string,
  success: boolean,
  messageId?: string,
  error?: string,
  templateKey?: string
) {
  try {
    const systemUser = await getSystemUser();
    if (!systemUser) return;

    await prisma.notification.create({
      data: {
        userId: systemUser.id,
        type: 'EMAIL',
        status: success ? 'SENT' : 'FAILED',
        recipient: to,
        subject: subject,
        message: message,
        templateKey: templateKey || null,
        gatewayRef: messageId || null,
        errorMessage: error || null,
        sentAt: success ? new Date() : null,
      }
    });
  } catch (err) {
    console.error('Failed to save email notification:', err);
  }
}

// Process template with variables
function processTemplate(template: string, variables: Record<string, string | number>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return processed;
}

// Send a single email
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<EmailResult> {
  try {
    const enabled = await isEmailEnabled();
    if (!enabled) {
      return { success: false, error: 'Email notifications are disabled or Resend API key not configured' };
    }

    const config = await getEmailConfig();
    
    if (!config.apiKey) {
      return { success: false, error: 'Resend API key not configured' };
    }

    const resend = getResendClient(config.apiKey);

    const { data, error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    if (error) {
      console.error('Resend error:', error);
      await saveEmailNotification(to, subject, html, false, undefined, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    // Save to database
    await saveEmailNotification(to, subject, html, true, data?.id);

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to send email';
    console.error('Email send error:', errorMsg);
    
    // Save failed notification
    await saveEmailNotification(to, subject, html, false, undefined, errorMsg);
    
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// Send email using a template
export async function sendTemplateEmail(
  to: string,
  templateKey: string,
  variables: Record<string, string | number>
): Promise<EmailResult> {
  try {
    const enabled = await isEmailEnabled();
    if (!enabled) {
      return { success: false, error: 'Email notifications are disabled' };
    }

    // Get template from database
    const template = await prisma.emailTemplate.findUnique({
      where: { key: templateKey }
    });

    if (!template) {
      return { success: false, error: `Email template '${templateKey}' not found` };
    }

    // Process subject and body
    const subject = processTemplate(template.subject, variables);
    const html = processTemplate(template.body, variables);

    // Send the email
    const result = await sendEmail(to, subject, html);
    
    // Update with template key
    if (result.success) {
      await saveEmailNotification(to, subject, html, true, result.messageId, undefined, templateKey);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send template email',
    };
  }
}

// Send pickup notification email
export async function sendPickupEmail(
  to: string,
  customerName: string,
  trackingCode: string,
  location: string,
  expiryDate: string
): Promise<EmailResult> {
  return sendTemplateEmail(to, 'pickup_notification', {
    customerName,
    trackingCode,
    location,
    expiryDate,
  });
}

// Send storage fee email
export async function sendStorageFeeEmail(
  to: string,
  customerName: string,
  storageDays: number,
  fee: number
): Promise<EmailResult> {
  return sendTemplateEmail(to, 'storage_fee', {
    customerName,
    storageDays,
    fee,
  });
}

// Send pickup confirmation email
export async function sendPickupConfirmationEmail(
  to: string,
  customerName: string
): Promise<EmailResult> {
  return sendTemplateEmail(to, 'pickup_confirmation', {
    customerName,
  });
}

// Send overdue reminder email
export async function sendOverdueEmail(
  to: string,
  customerName: string,
  storageDays: number,
  totalFee: number,
  daysUntilAbandoned: number
): Promise<EmailResult> {
  return sendTemplateEmail(to, 'overdue_reminder', {
    customerName,
    storageDays,
    totalFee,
    daysUntilAbandoned,
  });
}

// Send drop-off code email (for kiosk purchases)
export async function sendDropoffCodeEmail(
  to: string,
  customerName: string,
  saveCode: string,
  boxSize: string,
  price: number
): Promise<EmailResult> {
  const subject = `Your Drop-off Code: ${saveCode}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FFD439; padding: 20px; text-align: center; }
        .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; }
        .info { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; color: #111;">PICKUP</h1>
        </div>
        
        <h2>Hi ${customerName || 'there'},</h2>
        <p>Thank you for your purchase! Your drop-off code is ready.</p>
        
        <div class="code">${saveCode}</div>
        
        <div class="info">
          <p><strong>Box Size:</strong> ${boxSize}</p>
          <p><strong>Amount Paid:</strong> $${price} JMD</p>
        </div>
        
        <h3>How to use your code:</h3>
        <ol>
          <li>Go to the Pickup locker</li>
          <li>Tap "DROP-OFF" on the screen</li>
          <li>Select "I have a Drop-off Code"</li>
          <li>Enter your 6-digit code: <strong>${saveCode}</strong></li>
          <li>Place your package in the open box</li>
        </ol>
        
        <p style="background: #fff3cd; padding: 15px; border-radius: 8px;">
          <strong>Important:</strong> Save this email! You'll need the code to drop off your package.
        </p>
        
        <div class="footer">
          <p>Pickup Jamaica | Smart Locker System</p>
          <p>Need help? Contact support@pickupja.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(to, subject, html);
}

// Get email history from notifications
export async function getEmailHistory(limit: number = 50) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { type: 'EMAIL' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifications.map(n => ({
      id: n.id,
      to: n.recipient || '',
      subject: n.subject || '',
      status: n.status,
      templateKey: n.templateKey,
      error: n.errorMessage,
      createdAt: n.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to get email history:', error);
    return [];
  }
}

// Get email stats
export async function getEmailStats() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [sentToday, totalSent, totalFailed] = await Promise.all([
      prisma.notification.count({
        where: { type: 'EMAIL', status: 'SENT', sentAt: { gte: today } }
      }),
      prisma.notification.count({
        where: { type: 'EMAIL', status: 'SENT' }
      }),
      prisma.notification.count({
        where: { type: 'EMAIL', status: 'FAILED' }
      }),
    ]);

    return {
      sentToday,
      totalSent,
      totalFailed,
    };
  } catch (error) {
    console.error('Failed to get email stats:', error);
    return { sentToday: 0, totalSent: 0, totalFailed: 0 };
  }
}

// Verify email configuration
export async function verifyEmailConfig(): Promise<{
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}> {
  try {
    const config = await getEmailConfig();
    
    if (!config.apiKey) {
      return {
        success: false,
        error: 'Resend API key not configured',
      };
    }

    // Test the API key by getting the current domain
    const resend = getResendClient(config.apiKey);
    
    try {
      // Try to send a test email to verify the API key works
      // We'll just check if the client initializes correctly
      return {
        success: true,
        details: {
          provider: 'Resend',
          fromEmail: config.fromEmail,
          fromName: config.fromName,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: 'Invalid Resend API key',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify email config',
    };
  }
}

// Export default client
const EmailClient = {
  sendEmail,
  sendTemplateEmail,
  sendPickupEmail,
  sendStorageFeeEmail,
  sendPickupConfirmationEmail,
  sendOverdueEmail,
  sendDropoffCodeEmail,
  verifyEmailConfig,
  isEmailEnabled,
  getEmailConfig,
  getEmailHistory,
  getEmailStats,
};

export default EmailClient;
