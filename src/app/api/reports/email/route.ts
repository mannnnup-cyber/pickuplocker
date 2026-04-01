import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';

/**
 * Email Report API
 * 
 * Sends automated email reports to administrators
 * - Daily summary at 6 PM
 * - Weekly summary on Monday morning
 * - Monthly summary on the 1st of each month
 */

// Create email transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

// Generate HTML email body
function generateEmailHTML(report: {
  type: string;
  summary: {
    newOrders: number;
    pickedUpOrders: number;
    pendingOrders: number;
    totalRevenue: number;
    orderTrend: number;
    pickupTrend: number;
    revenueTrend: number;
  };
  revenue: {
    total: number;
    cash: number;
    online: number;
    paymentsCount: number;
    averagePayment: number;
  };
  storageUtilization: Array<{
    name: string;
    totalBoxes: number;
    usedBoxes: number;
    utilizationPercent: number;
  }>;
  abandonedPackages: {
    count: number;
    orders: Array<{
      orderNumber: string;
      customerName: string;
      daysStored: number;
      storageFee: number;
    }>;
  };
}) {
  const trendIcon = (trend: number) => trend >= 0 ? '📈' : '📉';
  const trendColor = (trend: number) => trend >= 0 ? '#22c55e' : '#ef4444';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
    .header { background: #FFD439; padding: 20px; text-align: center; }
    .header h1 { margin: 0; color: #111; }
    .content { padding: 20px; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
    .metric-card { background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 24px; font-weight: bold; color: #111; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .trend { font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #111; border-bottom: 2px solid #FFD439; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; }
    .warning { background: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Pickup Locker ${report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report</h1>
  </div>
  
  <div class="content">
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${report.summary.newOrders}</div>
        <div class="metric-label">New Orders</div>
        <div class="trend" style="color: ${trendColor(report.summary.orderTrend)}">
          ${trendIcon(report.summary.orderTrend)} ${Math.abs(report.summary.orderTrend)}%
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${report.summary.pickedUpOrders}</div>
        <div class="metric-label">Picked Up</div>
        <div class="trend" style="color: ${trendColor(report.summary.pickupTrend)}">
          ${trendIcon(report.summary.pickupTrend)} ${Math.abs(report.summary.pickupTrend)}%
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-value">$${report.revenue.total.toLocaleString()}</div>
        <div class="metric-label">Revenue (JMD)</div>
        <div class="trend" style="color: ${trendColor(report.summary.revenueTrend)}">
          ${trendIcon(report.summary.revenueTrend)} ${Math.abs(report.summary.revenueTrend)}%
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${report.summary.pendingOrders}</div>
        <div class="metric-label">Pending Pickup</div>
      </div>
    </div>

    <div class="section">
      <h2>💰 Revenue Breakdown</h2>
      <table>
        <tr>
          <th>Payment Method</th>
          <th>Amount</th>
          <th>Transactions</th>
        </tr>
        <tr>
          <td>Cash</td>
          <td>$${report.revenue.cash.toLocaleString()} JMD</td>
          <td>-</td>
        </tr>
        <tr>
          <td>Online (DimePay)</td>
          <td>$${report.revenue.online.toLocaleString()} JMD</td>
          <td>${report.revenue.paymentsCount}</td>
        </tr>
        <tr style="font-weight: bold;">
          <td>Total</td>
          <td>$${report.revenue.total.toLocaleString()} JMD</td>
          <td>${report.revenue.paymentsCount}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 14px;">Average payment: $${report.revenue.averagePayment.toFixed(2)} JMD</p>
    </div>

    <div class="section">
      <h2>📮 Storage Utilization</h2>
      <table>
        <tr>
          <th>Device</th>
          <th>Used</th>
          <th>Total</th>
          <th>Utilization</th>
        </tr>
        ${report.storageUtilization.map(d => `
          <tr>
            <td>${d.name}</td>
            <td>${d.usedBoxes}</td>
            <td>${d.totalBoxes}</td>
            <td>${d.utilizationPercent}%</td>
          </tr>
        `).join('')}
      </table>
    </div>

    ${report.abandonedPackages.count > 0 ? `
      <div class="warning">
        <h2>⚠️ At-Risk Packages (${report.abandonedPackages.count})</h2>
        <p>Packages stored for 25+ days that may be abandoned:</p>
        <table>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Days</th>
            <th>Fee</th>
          </tr>
          ${report.abandonedPackages.orders.slice(0, 5).map(o => `
            <tr>
              <td>${o.orderNumber}</td>
              <td>${o.customerName}</td>
              <td>${o.daysStored}</td>
              <td>$${o.storageFee}</td>
            </tr>
          `).join('')}
        </table>
        ${report.abandonedPackages.orders.length > 5 ? `<p>...and ${report.abandonedPackages.orders.length - 5} more</p>` : ''}
      </div>
    ` : ''}

    <div class="footer">
      <p>Generated by Pickup Smart Locker System</p>
      <p>Dashboard: ${process.env.NEXTAUTH_URL || 'https://pickuplocker.vercel.app'}/dashboard</p>
    </div>
  </div>
</body>
</html>
  `;
}

// GET - Send email report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'daily';
    const secret = searchParams.get('secret');
    const testEmail = searchParams.get('test');
    
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET || 'pickup-cron-2024';
    if (secret !== cronSecret && !testEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return NextResponse.json({
        success: false,
        error: 'Email not configured. Set EMAIL_USER and EMAIL_PASSWORD environment variables.',
      }, { status: 500 });
    }

    // Fetch report data
    const reportRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/reports/daily?type=${type}`);
    const reportData = await reportRes.json();
    
    if (!reportData.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate report data',
      }, { status: 500 });
    }

    const report = reportData.data;

    // Determine recipients
    const adminEmails = testEmail 
      ? [testEmail]
      : await getAdminEmails();

    if (adminEmails.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No admin email addresses configured',
      }, { status: 500 });
    }

    // Create transporter
    const transporter = createTransporter();

    // Generate email
    const subject = `📦 Pickup ${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${new Date().toLocaleDateString()}`;
    const html = generateEmailHTML(report);

    // Send email
    const info = await transporter.sendMail({
      from: `"Pickup Locker System" <${process.env.EMAIL_USER}>`,
      to: adminEmails.join(', '),
      subject,
      html,
    });

    // Log activity
    await db.activity.create({
      data: {
        action: 'EMAIL_REPORT_SENT',
        description: `${type} report sent to ${adminEmails.length} recipients`,
        metadata: JSON.stringify({
          type,
          recipients: adminEmails,
          messageId: info.messageId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      recipients: adminEmails,
    });

  } catch (error) {
    console.error('Email report error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email report',
    }, { status: 500 });
  }
}

// Get admin email addresses from database
async function getAdminEmails(): Promise<string[]> {
  try {
    const admins = await db.user.findMany({
      where: {
        role: 'ADMIN',
        isActive: true,
        email: { not: null },
      },
      select: { email: true },
    });
    
    const settingEmail = await db.setting.findUnique({
      where: { key: 'notifications_adminEmail' },
    });

    const emails = admins.map(a => a.email).filter(Boolean) as string[];
    
    if (settingEmail?.value) {
      emails.push(...settingEmail.value.split(',').map(e => e.trim()));
    }

    if (emails.length === 0 && process.env.ADMIN_EMAIL) {
      emails.push(process.env.ADMIN_EMAIL);
    }

    return [...new Set(emails)];
  } catch (error) {
    console.error('Failed to get admin emails:', error);
    return process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [];
  }
}
