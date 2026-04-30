import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateStorageFee, getFeeSettings, processAutoCharges } from '@/lib/storage-fee';
import { sendSms, feeChargedTemplate, feeWarningTemplate } from '@/lib/twilio';

// GET /api/fees - List fees with calculations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const parcelId = searchParams.get('parcelId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (parcelId) where.parcelId = parcelId;

    const fees = await db.storageFee.findMany({
      where,
      include: {
        parcel: {
          include: {
            customer: true,
            locker: { include: { location: true } },
          },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate current amounts for accumulating fees
    const feesWithCalculations = fees.map(fee => {
      if (fee.status === 'ACCUMULATING' && fee.parcel) {
        const calculation = calculateStorageFee({
          depositedAt: fee.parcel.depositedAt,
          freeHours: fee.freeHours,
          ratePerHour: fee.ratePerHour,
        });
        return { ...fee, calculation };
      }
      return { ...fee, calculation: null };
    });

    return NextResponse.json(feesWithCalculations);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/fees - Process auto-charges or manual fee actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, feeId } = body;

    if (action === 'processAutoCharges') {
      const result = await processAutoCharges();
      return NextResponse.json(result);
    }

    if (action === 'waive' && feeId) {
      const fee = await db.storageFee.update({
        where: { id: feeId },
        data: { status: 'WAIVED', endDate: new Date() },
        include: { parcel: { include: { customer: true } } },
      });
      return NextResponse.json(fee);
    }

    if (action === 'charge' && feeId) {
      const fee = await db.storageFee.findUnique({
        where: { id: feeId },
        include: { parcel: { include: { customer: true } } },
      });

      if (!fee) {
        return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
      }

      const settings = await getFeeSettings();
      const calculation = calculateStorageFee({
        depositedAt: fee.parcel!.depositedAt,
        freeHours: fee.freeHours,
        ratePerHour: fee.ratePerHour,
      });

      const amount = calculation.totalFee;

      if (amount <= 0) {
        return NextResponse.json({ error: 'No fee to charge' }, { status: 400 });
      }

      if (fee.parcel!.customer.balance < amount) {
        return NextResponse.json(
          { error: `Insufficient balance. Customer has $${fee.parcel!.customer.balance.toFixed(2)}, fee is $${amount.toFixed(2)}` },
          { status: 400 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            customerId: fee.parcel!.customerId,
            amount,
            currency: settings.currency,
            method: 'BALANCE',
            status: 'COMPLETED',
            description: `Storage fee for parcel ${fee.parcel!.trackingCode}`,
          },
        });

        const updatedFee = await tx.storageFee.update({
          where: { id: feeId },
          data: {
            amount,
            status: 'CHARGED',
            chargedAt: new Date(),
            paymentId: payment.id,
            endDate: new Date(),
          },
        });

        await tx.customer.update({
          where: { id: fee.parcel!.customerId },
          data: { balance: { decrement: amount } },
        });

        return { fee: updatedFee, payment };
      });

      // Send SMS about the charge
      const customer = fee.parcel!.customer;
      const newBalance = customer.balance - amount;
      const smsMessage = feeChargedTemplate({
        customerName: customer.name,
        trackingCode: fee.parcel!.trackingCode,
        amount: amount.toFixed(2),
        newBalance: newBalance.toFixed(2),
      });

      const smsResult = await sendSms({ to: customer.phone, message: smsMessage });

      await db.smsLog.create({
        data: {
          customerId: customer.id,
          to: customer.phone,
          message: smsMessage,
          type: 'FEE_CHARGED',
          status: smsResult.success ? 'SENT' : 'FAILED',
          twilioSid: smsResult.sid,
          errorMessage: smsResult.error,
          sentAt: smsResult.success ? new Date() : null,
        },
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
