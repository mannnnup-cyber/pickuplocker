import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSms, depositNotificationTemplate, collectionReminderTemplate, overdueNoticeTemplate } from '@/lib/twilio';
import { getFeeSettings } from '@/lib/storage-fee';

// GET /api/parcels - List parcels with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const lockerId = searchParams.get('lockerId');
    const trackingCode = searchParams.get('trackingCode');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (lockerId) where.lockerId = lockerId;
    if (trackingCode) where.trackingCode = { contains: trackingCode };

    const parcels = await db.parcel.findMany({
      where,
      include: {
        customer: true,
        locker: { include: { location: true } },
        storageFees: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(parcels);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/parcels - Deposit a new parcel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackingCode, description, lockerId, customerId, sendNotification } = body;

    if (!trackingCode || !lockerId || !customerId) {
      return NextResponse.json(
        { error: 'Tracking code, locker, and customer are required' },
        { status: 400 }
      );
    }

    // Check locker is available
    const locker = await db.locker.findUnique({ where: { id: lockerId } });
    if (!locker) {
      return NextResponse.json({ error: 'Locker not found' }, { status: 404 });
    }
    if (locker.status !== 'AVAILABLE') {
      return NextResponse.json({ error: 'Locker is not available' }, { status: 400 });
    }

    const settings = await getFeeSettings();

    const result = await db.$transaction(async (tx) => {
      // Create parcel
      const parcel = await tx.parcel.create({
        data: {
          trackingCode,
          description,
          lockerId,
          customerId,
          status: 'DEPOSITED',
        },
        include: {
          customer: true,
          locker: { include: { location: true } },
        },
      });

      // Create initial storage fee record
      await tx.storageFee.create({
        data: {
          parcelId: parcel.id,
          feeType: 'HOURLY',
          amount: 0,
          freeHours: settings.freeHours,
          ratePerHour: settings.ratePerHour,
          startDate: new Date(),
        },
      });

      // Update locker status
      await tx.locker.update({
        where: { id: lockerId },
        data: { status: 'OCCUPIED' },
      });

      return parcel;
    });

    // Send SMS notification (outside transaction)
    if (sendNotification !== false) {
      const customer = result.customer;
      const lockerWithLocation = result.locker;
      if (customer.phone) {
        const message = depositNotificationTemplate({
          customerName: customer.name,
          trackingCode: result.trackingCode,
          lockerNumber: lockerWithLocation.lockerNumber,
          locationName: lockerWithLocation.location.name,
          freeHours: settings.freeHours,
        });

        const smsResult = await sendSms({ to: customer.phone, message });

        await db.smsLog.create({
          data: {
            customerId: customer.id,
            to: customer.phone,
            message,
            type: 'DEPOSIT_NOTIFICATION',
            status: smsResult.success ? 'SENT' : 'FAILED',
            twilioSid: smsResult.sid,
            errorMessage: smsResult.error,
            sentAt: smsResult.success ? new Date() : null,
          },
        });

        // Update parcel status to NOTIFIED
        if (smsResult.success) {
          await db.parcel.update({
            where: { id: result.id },
            data: { status: 'NOTIFIED' },
          });
        }
      }
    }

    const fullParcel = await db.parcel.findUnique({
      where: { id: result.id },
      include: {
        customer: true,
        locker: { include: { location: true } },
        storageFees: true,
      },
    });

    return NextResponse.json(fullParcel, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Tracking code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/parcels - Update parcel (e.g., collect)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'Parcel ID is required' }, { status: 400 });
    }

    const parcel = await db.parcel.findUnique({
      where: { id },
      include: { customer: true, locker: true, storageFees: true },
    });

    if (!parcel) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 });
    }

    if (action === 'collect') {
      // Collect parcel - calculate and charge final fees
      const activeFees = parcel.storageFees.filter(f => f.status === 'ACCUMULATING');
      let totalFee = activeFees.reduce((sum, f) => sum + f.amount, 0);

      const result = await db.$transaction(async (tx) => {
        // End all accumulating fees
        for (const fee of activeFees) {
          await tx.storageFee.update({
            where: { id: fee.id },
            data: {
              status: totalFee > 0 ? 'CHARGED' : 'WAIVED',
              endDate: new Date(),
              chargedAt: totalFee > 0 ? new Date() : undefined,
              amount: totalFee > 0 ? fee.amount : 0,
            },
          });
        }

        // If there's a fee, create payment and charge balance
        if (totalFee > 0 && parcel.customer.balance >= totalFee) {
          const payment = await tx.payment.create({
            data: {
              customerId: parcel.customerId,
              amount: totalFee,
              method: 'BALANCE',
              status: 'COMPLETED',
              description: `Storage fee for parcel ${parcel.trackingCode}`,
            },
          });

          // Link payment to fees and deduct balance
          for (const fee of activeFees) {
            await tx.storageFee.update({
              where: { id: fee.id },
              data: { paymentId: payment.id },
            });
          }
          await tx.customer.update({
            where: { id: parcel.customerId },
            data: { balance: { decrement: totalFee } },
          });
        } else if (totalFee > 0) {
          // Customer doesn't have enough balance - still collect but mark fee as pending
          totalFee = 0; // Don't charge now
        }

        // Update parcel
        const updated = await tx.parcel.update({
          where: { id },
          data: {
            status: 'COLLECTED',
            collectedAt: new Date(),
          },
          include: {
            customer: true,
            locker: { include: { location: true } },
            storageFees: true,
          },
        });

        // Free up the locker
        await tx.locker.update({
          where: { id: parcel.lockerId },
          data: { status: 'AVAILABLE' },
        });

        return updated;
      });

      return NextResponse.json(result);
    }

    if (action === 'sendReminder') {
      // Send collection reminder SMS
      const settings = await getFeeSettings();
      const hoursStored = (Date.now() - new Date(parcel.depositedAt).getTime()) / (1000 * 60 * 60);
      const freeHoursLeft = Math.max(0, Math.round(settings.freeHours - hoursStored));

      const message = collectionReminderTemplate({
        customerName: parcel.customer.name,
        trackingCode: parcel.trackingCode,
        lockerNumber: parcel.locker.lockerNumber,
        freeHoursLeft,
      });

      const smsResult = await sendSms({ to: parcel.customer.phone, message });

      await db.smsLog.create({
        data: {
          customerId: parcel.customerId,
          to: parcel.customer.phone,
          message,
          type: 'COLLECTION_REMINDER',
          status: smsResult.success ? 'SENT' : 'FAILED',
          twilioSid: smsResult.sid,
          errorMessage: smsResult.error,
          sentAt: smsResult.success ? new Date() : null,
        },
      });

      if (smsResult.success) {
        await db.parcel.update({
          where: { id },
          data: { status: 'REMINDED' },
        });
      }

      return NextResponse.json({ success: smsResult.success, smsResult });
    }

    if (action === 'markOverdue') {
      await db.parcel.update({
        where: { id },
        data: { status: 'OVERDUE' },
      });

      // Send overdue SMS
      const activeFees = parcel.storageFees.filter(f => f.status === 'ACCUMULATING');
      const currentFee = activeFees.reduce((sum, f) => sum + f.amount, 0).toFixed(2);

      const message = overdueNoticeTemplate({
        customerName: parcel.customer.name,
        trackingCode: parcel.trackingCode,
        lockerNumber: parcel.locker.lockerNumber,
        currentFee,
      });

      const smsResult = await sendSms({ to: parcel.customer.phone, message });

      await db.smsLog.create({
        data: {
          customerId: parcel.customerId,
          to: parcel.customer.phone,
          message,
          type: 'OVERDUE_NOTICE',
          status: smsResult.success ? 'SENT' : 'FAILED',
          twilioSid: smsResult.sid,
          errorMessage: smsResult.error,
          sentAt: smsResult.success ? new Date() : null,
        },
      });

      return NextResponse.json({ success: true, smsResult });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
