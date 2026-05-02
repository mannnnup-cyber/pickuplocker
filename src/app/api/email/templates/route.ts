import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Default email templates
const DEFAULT_TEMPLATES = [
  {
    key: 'pickup_notification',
    name: 'Pickup Notification',
    description: 'Sent when a package is ready for pickup',
    subject: 'Your package is ready for pickup! 📦',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #2563eb; margin: 0;">📦 Pickup Jamaica</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333;">Great news! Your package is ready for pickup.</p>
    
    <div style="background-color: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your Pickup Code:</p>
      <p style="margin: 0; font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 5px;">{{trackingCode}}</p>
    </div>
    
    <table style="width: 100%; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 14px;">📍 Location:</td>
        <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: bold;">{{location}}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 14px;">⏰ Valid Until:</td>
        <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: bold;">{{expiryDate}}</td>
      </tr>
    </table>
    
    <div style="background-color: #fef3c7; border-radius: 5px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        <strong>📍 How to Pick Up:</strong><br>
        1. Visit the locker location<br>
        2. Enter your code on the keypad or scan your QR code<br>
        3. Collect your package from the opened compartment
      </p>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      Pickup is available 24/7. Bring your code or QR code to the locker.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Questions? Contact us at support@pickupja.com<br>
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName', 'trackingCode', 'location', 'expiryDate']),
  },
  {
    key: 'storage_fee',
    name: 'Storage Fee Notice',
    description: 'Sent when storage fees have accrued',
    subject: 'Storage Fee Notice - Action Required 💰',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #dc2626; margin: 0;">💰 Storage Fee Notice</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333;">Your package has been stored for <strong>{{storageDays}} days</strong>.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Current Storage Fee:</p>
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #dc2626;">\${{fee}} JMD</p>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      Please pick up your package as soon as possible to avoid additional charges.
    </p>
    
    <div style="background-color: #f0f9ff; border-radius: 5px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #1e40af;">
        <strong>Payment Options:</strong><br>
        • Pay at the locker when picking up<br>
        • Contact us for online payment options
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Questions? Contact us at support@pickupja.com<br>
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName', 'storageDays', 'fee']),
  },
  {
    key: 'pickup_confirmation',
    name: 'Pickup Confirmation',
    description: 'Sent after customer picks up package',
    subject: 'Thank you for using Pickup! ✅',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #16a34a; margin: 0;">✅ Pickup Successful!</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333;">Thank you for using Pickup Jamaica! Your package has been successfully collected.</p>
    
    <div style="background-color: #f0fdf4; border-radius: 5px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 18px; color: #16a34a;">We hope to serve you again! 🎉</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://pickupja.com/feedback" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Rate Your Experience</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Questions? Contact us at support@pickupja.com<br>
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName']),
  },
  {
    key: 'overdue_reminder',
    name: 'Overdue Reminder',
    description: 'Sent when package is overdue',
    subject: 'URGENT: Package Overdue - Action Required ⚠️',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #dc2626; margin: 0;">⚠️ URGENT NOTICE</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333; font-weight: bold;">Your package has been stored for {{storageDays}} days and is now overdue.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <table style="width: 100%;">
        <tr>
          <td style="padding: 5px 0; color: #666; font-size: 14px;">Current Fees:</td>
          <td style="padding: 5px 0; color: #dc2626; font-size: 18px; font-weight: bold; text-align: right;">\${{totalFee}} JMD</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666; font-size: 14px;">Days Until Disposal:</td>
          <td style="padding: 5px 0; color: #dc2626; font-size: 18px; font-weight: bold; text-align: right;">{{daysUntilAbandoned}} days</td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: #fef3c7; border-radius: 5px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        <strong>⚠️ Important:</strong><br>
        Packages not collected within 30 days may be disposed of or donated. Please pick up your package immediately to avoid losing your items.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-size: 14px; color: #666;">
        Need help? Contact us:<br>
        <strong>{{supportPhone}}</strong> or <strong>support@pickupja.com</strong>
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName', 'storageDays', 'totalFee', 'daysUntilAbandoned', 'supportPhone']),
  },
  {
    key: 'pre_delivery',
    name: 'Pre-Delivery Alert',
    description: 'Sent when courier notifies of incoming package',
    subject: 'Incoming Package Alert from {{courierName}} 📨',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #8b5cf6; margin: 0;">📨 Package On The Way!</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333;"><strong>{{courierName}}</strong> has notified us of an incoming package for you.</p>
    
    <div style="background-color: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <table style="width: 100%;">
        <tr>
          <td style="padding: 5px 0; color: #666; font-size: 14px;">Courier Tracking:</td>
          <td style="padding: 5px 0; color: #333; font-size: 14px; font-weight: bold; text-align: right;">{{courierTracking}}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666; font-size: 14px;">Expected Arrival:</td>
          <td style="padding: 5px 0; color: #333; font-size: 14px; font-weight: bold; text-align: right;">{{expectedDate}}</td>
        </tr>
      </table>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      We'll send you a notification with your pickup code as soon as your package arrives and is ready for collection.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Questions? Contact us at support@pickupja.com<br>
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName', 'courierName', 'courierTracking', 'expectedDate']),
  },
  {
    key: 'reminder_24h',
    name: '24-Hour Reminder',
    description: 'Sent 24 hours before free storage expires',
    subject: 'Reminder: Free storage ending soon ⏰',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #f59e0b; margin: 0;">⏰ Reminder</h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Hi <strong>{{customerName}}</strong>,</p>
    
    <p style="font-size: 16px; color: #333;">Your package (Code: <strong>{{trackingCode}}</strong>) has <strong>1 day</strong> of free storage remaining.</p>
    
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        Pick up tomorrow to avoid storage fees of <strong>\${{dailyFee}} JMD/day</strong>.
      </p>
    </div>
    
    <table style="width: 100%; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 14px;">📍 Location:</td>
        <td style="padding: 10px 0; color: #333; font-size: 14px; font-weight: bold;">{{location}}</td>
      </tr>
    </table>
    
    <div style="background-color: #f0f9ff; border-radius: 5px; padding: 15px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #1e40af;">
        Pickup is available 24/7 at your convenience!
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Questions? Contact us at support@pickupja.com<br>
      Powered by Pickup Jamaica
    </p>
  </div>
</body>
</html>`,
    variables: JSON.stringify(['customerName', 'trackingCode', 'dailyFee', 'location']),
  },
];

// GET all email templates
export async function GET() {
  try {
    let templates = await prisma.emailTemplate.findMany({
      orderBy: { name: 'asc' }
    });

    // Seed default templates if none exist
    if (templates.length === 0) {
      await prisma.emailTemplate.createMany({
        data: DEFAULT_TEMPLATES
      });
      templates = await prisma.emailTemplate.findMany({
        orderBy: { name: 'asc' }
      });
    }

    return NextResponse.json({
      success: true,
      templates: templates.map(t => ({
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        subject: t.subject,
        body: t.body,
        variables: t.variables ? JSON.parse(t.variables) : [],
        isActive: t.isActive
      }))
    });
  } catch (error) {
    console.error('Failed to fetch email templates:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch email templates',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// PUT update template
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, subject, body: templateBody, name, description, isActive } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Template ID is required'
      }, { status: 400 });
    }

    const updated = await prisma.emailTemplate.update({
      where: { id },
      data: {
        subject,
        body: templateBody,
        name,
        description,
        isActive,
        variables: extractVariables(`${subject} ${templateBody}`)
      }
    });

    return NextResponse.json({
      success: true,
      template: {
        ...updated,
        variables: updated.variables ? JSON.parse(updated.variables) : []
      }
    });
  } catch (error) {
    console.error('Failed to update email template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update email template'
    }, { status: 500 });
  }
}

// POST create custom template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, name, description, subject, body: templateBody } = body;

    if (!key || !name || !subject || !templateBody) {
      return NextResponse.json({
        success: false,
        error: 'Key, name, subject, and body are required'
      }, { status: 400 });
    }

    const created = await prisma.emailTemplate.create({
      data: {
        key,
        name,
        description,
        subject,
        body: templateBody,
        variables: extractVariables(`${subject} ${templateBody}`)
      }
    });

    return NextResponse.json({
      success: true,
      template: {
        ...created,
        variables: created.variables ? JSON.parse(created.variables) : []
      }
    });
  } catch (error) {
    console.error('Failed to create email template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create email template'
    }, { status: 500 });
  }
}

// DELETE template
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Template ID is required'
      }, { status: 400 });
    }

    await prisma.emailTemplate.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Email template deleted'
    });
  } catch (error) {
    console.error('Failed to delete email template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete email template'
    }, { status: 500 });
  }
}

// Helper to extract {{variables}} from template
function extractVariables(template: string): string {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return JSON.stringify(variables);
}
