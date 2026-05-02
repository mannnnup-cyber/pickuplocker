import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Default SMS templates
const DEFAULT_TEMPLATES = [
  {
    key: 'pickup_notification',
    name: 'Pickup Notification',
    description: 'Sent when a package is ready for pickup',
    template: 'Hi {{customerName}}, your package is ready for pickup!\n\nCode: {{trackingCode}}\nLocation: {{location}}\nValid until: {{expiryDate}}\n\nPickup is available 24/7. Bring your code or scan QR at the locker.\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'trackingCode', 'location', 'expiryDate', 'signature']),
  },
  {
    key: 'storage_fee',
    name: 'Storage Fee Notice',
    description: 'Sent when storage fees have accrued',
    template: 'Hi {{customerName}}, your package has been stored for {{storageDays}} days.\n\nStorage fee: \${{fee}} JMD\n\nPlease pick up your package to avoid additional charges.\n\nPay at the locker or contact us for assistance.\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'storageDays', 'fee', 'signature']),
  },
  {
    key: 'pickup_confirmation',
    name: 'Pickup Confirmation',
    description: 'Sent after customer picks up package',
    template: 'Hi {{customerName}}, thank you for using Pickup!\n\nYour package has been successfully collected.\n\nRate your experience: pickupja.com/feedback\n\nWe hope to serve you again!\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'signature']),
  },
  {
    key: 'overdue_reminder',
    name: 'Overdue Reminder',
    description: 'Sent when package is overdue',
    template: 'URGENT: Hi {{customerName}}, your package has been stored for {{storageDays}} days.\n\nCurrent fees: \${{totalFee}} JMD\nDays until disposal: {{daysUntilAbandoned}}\n\nPlease pick up immediately to avoid losing your items.\n\nContact: {{supportPhone}}\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'storageDays', 'totalFee', 'daysUntilAbandoned', 'supportPhone', 'signature']),
  },
  {
    key: 'pre_delivery',
    name: 'Pre-Delivery Alert',
    description: 'Sent when courier notifies of incoming package',
    template: 'Hi {{customerName}}, {{courierName}} has notified us of an incoming package for you.\n\nTracking: {{courierTracking}}\nExpected: {{expectedDate}}\n\nWe\'ll text you when it arrives and is ready for pickup.\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'courierName', 'courierTracking', 'expectedDate', 'signature']),
  },
  {
    key: 'reminder_24h',
    name: '24-Hour Reminder',
    description: 'Sent 24 hours before free storage expires',
    template: 'Hi {{customerName}}, reminder: Your package (Code: {{trackingCode}}) has 1 day of free storage remaining.\n\nPick up tomorrow to avoid storage fees of \${{dailyFee}} JMD/day.\n\nLocation: {{location}}\n\n{{signature}}',
    variables: JSON.stringify(['customerName', 'trackingCode', 'dailyFee', 'location', 'signature']),
  },
];

// GET all templates
export async function GET() {
  try {
    let templates = await prisma.smsTemplate.findMany({
      orderBy: { name: 'asc' }
    });

    // Seed default templates if none exist
    if (templates.length === 0) {
      await prisma.smsTemplate.createMany({
        data: DEFAULT_TEMPLATES
      });
      templates = await prisma.smsTemplate.findMany({
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
        template: t.template,
        variables: t.variables ? JSON.parse(t.variables) : [],
        isActive: t.isActive
      }))
    });
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch templates',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// PUT update template
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, template, name, description, isActive } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Template ID is required'
      }, { status: 400 });
    }

    const updated = await prisma.smsTemplate.update({
      where: { id },
      data: {
        template,
        name,
        description,
        isActive,
        variables: extractVariables(template)
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
    console.error('Failed to update template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update template'
    }, { status: 500 });
  }
}

// POST create custom template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, name, description, template } = body;

    if (!key || !name || !template) {
      return NextResponse.json({
        success: false,
        error: 'Key, name, and template are required'
      }, { status: 400 });
    }

    const created = await prisma.smsTemplate.create({
      data: {
        key,
        name,
        description,
        template,
        variables: extractVariables(template)
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
    console.error('Failed to create template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create template'
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

    await prisma.smsTemplate.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Template deleted'
    });
  } catch (error) {
    console.error('Failed to delete template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete template'
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
