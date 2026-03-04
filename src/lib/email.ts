// Email Notification System using Nodemailer
import nodemailer from 'nodemailer';
import { getSetting } from './settings';
import prisma from './prisma';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
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
  const host = await getSetting('email_host', 'EMAIL_HOST');
  const portStr = await getSetting('email_port', 'EMAIL_PORT');
  const secureStr = await getSetting('email_secure', 'EMAIL_SECURE');
  const user = await getSetting('email_user', 'EMAIL_USER');
  const password = await getSetting('email_password', 'EMAIL_PASSWORD');
  const fromEmail = await getSetting('email_fromEmail', 'EMAIL_FROM_EMAIL');
  const fromName = await getSetting('email_fromName', 'EMAIL_FROM_NAME');

  return {
    host: host || 'smtp.gmail.com',
    port: parseInt(portStr) || 587,
    secure: secureStr === 'true',
    user: user || '',
    password: password || '',
    fromEmail: fromEmail || 'noreply@pickupja.com',
    fromName: fromName || 'Pickup Jamaica',
  };
}

// Check if email is enabled
export async function isEmailEnabled(): Promise<boolean> {
  const enabled = await getSetting('email_enabled', 'EMAIL_ENABLED');
  return enabled === 'true';
}

// Create transporter
async function createTransporter() {
  const config = await getEmailConfig();

  if (!config.user || !config.password) {
    throw new Error('Email not configured. Please set email user and password in settings.');
  }

  // Port 465 = SSL (secure: true), Port 587 = STARTTLS (secure: false)
  const isSecurePort = config.port === 465;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecurePort, // true for 465, false for 587
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });
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
      return { success: false, error: 'Email notifications are disabled' };
    }

    const config = await getEmailConfig();
    const transporter = await createTransporter();

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    // Save to database
    await saveEmailNotification(to, subject, html, true, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
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
    
    if (!config.user || !config.password) {
      return {
        success: false,
        error: 'Email user or password not configured',
      };
    }

    const transporter = await createTransporter();
    await transporter.verify();
    
    return {
      success: true,
      details: {
        host: config.host,
        port: config.port,
        user: config.user,
        fromEmail: config.fromEmail,
      },
    };
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
  verifyEmailConfig,
  isEmailEnabled,
  getEmailConfig,
  getEmailHistory,
  getEmailStats,
};

export default EmailClient;
