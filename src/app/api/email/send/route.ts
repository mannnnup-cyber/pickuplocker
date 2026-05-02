import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendTemplateEmail, verifyEmailConfig, isEmailEnabled } from '@/lib/email';

// POST send an email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, html, text, templateKey, variables } = body;

    // Check if email is enabled
    const enabled = await isEmailEnabled();
    if (!enabled) {
      return NextResponse.json({
        success: false,
        error: 'Email notifications are disabled. Enable them in settings.'
      }, { status: 400 });
    }

    let result;

    if (templateKey) {
      // Send using template
      if (!to || !variables) {
        return NextResponse.json({
          success: false,
          error: 'To and variables are required for template emails'
        }, { status: 400 });
      }
      result = await sendTemplateEmail(to, templateKey, variables);
    } else {
      // Send direct email
      if (!to || !subject || !html) {
        return NextResponse.json({
          success: false,
          error: 'To, subject, and html are required'
        }, { status: 400 });
      }
      result = await sendEmail(to, subject, html, text);
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'Email sent successfully'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Failed to send email:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    }, { status: 500 });
  }
}

// GET verify email configuration
export async function GET() {
  try {
    const result = await verifyEmailConfig();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Email configuration is valid',
        details: result.details
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify email config'
    }, { status: 500 });
  }
}
