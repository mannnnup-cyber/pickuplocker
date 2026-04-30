import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSms, isTwilioConfigured } from '@/lib/twilio';

// GET /api/sms - List SMS logs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (type) where.type = type;
    if (status) where.status = status;

    const smsLogs = await db.smsLog.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      logs: smsLogs,
      twilioConfigured: isTwilioConfigured(),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/sms - Send custom SMS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, message, type } = body;

    if (!customerId || !message) {
      return NextResponse.json(
        { error: 'Customer ID and message are required' },
        { status: 400 }
      );
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const smsResult = await sendSms({ to: customer.phone, message });

    const log = await db.smsLog.create({
      data: {
        customerId,
        to: customer.phone,
        message,
        type: type || 'CUSTOM',
        status: smsResult.success ? 'SENT' : 'FAILED',
        twilioSid: smsResult.sid,
        errorMessage: smsResult.error,
        sentAt: smsResult.success ? new Date() : null,
      },
      include: { customer: true },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/sms - Bulk send reminders
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'sendBulkReminders') {
      // Find all parcels that are deposited/notified but not collected
      const activeParcels = await db.parcel.findMany({
        where: { status: { in: ['DEPOSITED', 'NOTIFIED', 'REMINDED'] } },
        include: { customer: true, locker: { include: { location: true } } },
      });

      const results = [];
      for (const parcel of activeParcels) {
        const settings = await db.storageFee.findFirst({
          where: { parcelId: parcel.id, status: 'ACCUMULATING' },
        });

        const hoursStored = (Date.now() - new Date(parcel.depositedAt).getTime()) / (1000 * 60 * 60);
        const freeHours = settings?.freeHours || 24;
        const freeHoursLeft = Math.max(0, Math.round(freeHours - hoursStored));
        const ratePerHour = settings?.ratePerHour || 0.5;

        let message: string;
        let smsType: string;

        if (freeHoursLeft <= 0) {
          // Overdue
          const fee = Math.abs(freeHoursLeft) * ratePerHour;
          message = `OVERDUE: ${parcel.customer.name}, your package ${parcel.trackingCode} in locker ${parcel.locker.lockerNumber} has exceeded free storage. Current fee: $${fee.toFixed(2)}. Please collect!`;
          smsType = 'OVERDUE_NOTICE';

          await db.parcel.update({
            where: { id: parcel.id },
            data: { status: 'OVERDUE' },
          });
        } else if (freeHoursLeft <= 2) {
          // Approaching limit
          message = `Urgent: ${parcel.customer.name}, your package ${parcel.trackingCode} in locker ${parcel.locker.lockerNumber} has only ${freeHoursLeft}h of free storage left!`;
          smsType = 'FEE_WARNING';
        } else {
          // Standard reminder
          message = `Reminder: ${parcel.customer.name}, your package ${parcel.trackingCode} is in locker ${parcel.locker.lockerNumber} at ${parcel.locker.location.name}. ${freeHoursLeft}h of free storage remaining.`;
          smsType = 'COLLECTION_REMINDER';
        }

        const smsResult = await sendSms({ to: parcel.customer.phone, message });

        const log = await db.smsLog.create({
          data: {
            customerId: parcel.customerId,
            to: parcel.customer.phone,
            message,
            type: smsType,
            status: smsResult.success ? 'SENT' : 'FAILED',
            twilioSid: smsResult.sid,
            errorMessage: smsResult.error,
            sentAt: smsResult.success ? new Date() : null,
          },
        });

        results.push({
          parcelId: parcel.id,
          trackingCode: parcel.trackingCode,
          smsSuccess: smsResult.success,
          simulated: smsResult.simulated,
        });
      }

      return NextResponse.json({ sent: results.length, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
