import { NextRequest, NextResponse } from 'next/server';

// WhatsApp Business API integration (via Twilio or Meta)
// For now, this generates WhatsApp links as a fallback

interface WhatsAppMessage {
  to: string;
  message: string;
}

// Generate WhatsApp click-to-chat link
function generateWhatsAppLink(phone: string, message: string): string {
  // Clean phone number (remove dashes, spaces, add country code if needed)
  let cleanPhone = phone.replace(/[-\s]/g, '');
  if (!cleanPhone.startsWith('1') && !cleanPhone.startsWith('+')) {
    // Assume Jamaica country code if not present
    cleanPhone = '1' + cleanPhone;
  }
  cleanPhone = cleanPhone.replace('+', '');
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

// Send WhatsApp message (placeholder for actual API integration)
async function sendWhatsAppMessage(phone: string, message: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const config = {
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioWhatsAppNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  };

  // If Twilio is configured, use the API
  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioWhatsAppNumber) {
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            From: `whatsapp:${config.twilioWhatsAppNumber}`,
            To: `whatsapp:${phone}`,
            Body: message,
          }),
        }
      );

      const data = await response.json();
      
      if (response.ok) {
        return { success: true, data };
      } else {
        return { success: false, error: data.message || 'Failed to send WhatsApp message' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'WhatsApp API error' };
    }
  }

  // Fallback: Generate WhatsApp link
  const whatsappLink = generateWhatsAppLink(phone, message);
  return { 
    success: true, 
    data: { 
      link: whatsappLink,
      note: 'Twilio not configured. Use the link to send via WhatsApp manually.' 
    } 
  };
}

// POST /api/whatsapp - Send WhatsApp message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, phone, data } = body;

    let message: string;
    let targetPhone: string;

    switch (action) {
      case 'send':
        if (!phone || !body.message) {
          return NextResponse.json({
            success: false,
            error: 'Phone and message are required',
          }, { status: 400 });
        }
        return NextResponse.json(await sendWhatsAppMessage(phone, body.message));

      case 'pickup_notification':
        if (!data?.phone || !data?.customerName || !data?.trackingCode) {
          return NextResponse.json({
            success: false,
            error: 'Phone, customerName, and trackingCode are required',
          }, { status: 400 });
        }
        message = `Hi ${data.customerName}! 📦

Your package is ready for pickup at ${data.location || 'Pickup Locker'}.

*Pickup Code:* ${data.trackingCode}

📍 Location: UTech Campus, Kingston
⏰ Available 24/7

Just enter your code at the locker to retrieve your item. Valid for ${data.expiryDays || 3} days.

Thank you for using Pickup! 🙏`;
        
        targetPhone = data.phone;
        break;

      case 'storage_fee':
        if (!data?.phone || !data?.customerName || !data?.storageDays) {
          return NextResponse.json({
            success: false,
            error: 'Phone, customerName, and storageDays are required',
          }, { status: 400 });
        }
        message = `Hi ${data.customerName}! 📦

Your package has been stored for ${data.storageDays} days.

*Storage Fee:* $${data.fee || 0} JMD

Please pick up your item soon. After 30 days, items may be considered abandoned.

Visit the locker with your pickup code to retrieve your item.

Thank you! 🙏`;
        
        targetPhone = data.phone;
        break;

      case 'overdue_reminder':
        if (!data?.phone || !data?.customerName) {
          return NextResponse.json({
            success: false,
            error: 'Phone and customerName are required',
          }, { status: 400 });
        }
        message = `⚠️ URGENT: Hi ${data.customerName}!

Your package has been in the locker for ${data.storageDays} days.

*Total Storage Fee:* $${data.totalFee || 0} JMD

Please pick up within ${data.daysUntilAbandoned || 7} days or your item may be abandoned.

Reply to arrange pickup or contact support.

Thank you! 🙏`;
        
        targetPhone = data.phone;
        break;

      case 'support':
        if (!phone) {
          return NextResponse.json({
            success: false,
            error: 'Phone is required',
          }, { status: 400 });
        }
        message = `Hi! 👋

Thank you for contacting Pickup Support.

How can we help you today?

Options:
1️⃣ Pickup code issues
2️⃣ Storage fee inquiry
3️⃣ Delivery request
4️⃣ Other

Please reply with your question and we'll assist you shortly!`;
        
        targetPhone = phone;
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: send, pickup_notification, storage_fee, overdue_reminder, support',
        }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(targetPhone, message);
    return NextResponse.json(result);

  } catch (error) {
    console.error('WhatsApp API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/whatsapp - Generate WhatsApp link
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const message = searchParams.get('message') || 'Hello! I need help with my pickup.';

    if (!phone) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required',
      }, { status: 400 });
    }

    const link = generateWhatsAppLink(phone, message);
    
    return NextResponse.json({
      success: true,
      data: { link },
    });
  } catch (error) {
    console.error('WhatsApp link error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
