import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getEmailHistory, getEmailStats, getEmailConfig, isEmailEnabled } from '@/lib/email';

// GET email history and stats
export async function GET() {
  try {
    const [history, stats, config, enabled] = await Promise.all([
      getEmailHistory(50),
      getEmailStats(),
      getEmailConfig(),
      isEmailEnabled()
    ]);

    const isConfigured = !!(config.host && config.user);

    return NextResponse.json({
      success: true,
      history,
      stats,
      config: {
        enabled,
        configured: isConfigured,
        host: config.host,
        user: config.user
      }
    });
  } catch (error) {
    console.error('Failed to fetch email data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch email data'
    }, { status: 500 });
  }
}

// POST send test email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, to, subject, html, templateKey, variables } = body;

    if (action === 'test') {
      // Send test email
      if (!to || !subject || !html) {
        return NextResponse.json({
          success: false,
          error: 'To, subject, and html are required'
        }, { status: 400 });
      }

      const result = await sendEmail(to, subject, html);

      return NextResponse.json(result);
    }

    if (action === 'send_template') {
      // Send using template
      if (!to || !templateKey) {
        return NextResponse.json({
          success: false,
          error: 'To and templateKey are required'
        }, { status: 400 });
      }

      const { sendTemplateEmail } = await import('@/lib/email');
      const result = await sendTemplateEmail(to, templateKey, variables || {});

      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 });

  } catch (error) {
    console.error('Failed to send email:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    }, { status: 500 });
  }
}
