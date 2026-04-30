// Storage Fee Calculation Engine
// Handles all fee computation, auto-charge logic, and overdue detection

import { db } from './db';

export interface FeeCalculation {
  freeHours: number;
  hoursStored: number;
  hoursBilled: number;
  ratePerHour: number;
  totalFee: number;
  isOverdue: boolean;
  isApproachingLimit: boolean; // within 2 hours of free period ending
}

export function calculateStorageFee(params: {
  depositedAt: Date;
  freeHours: number;
  ratePerHour: number;
  now?: Date;
}): FeeCalculation {
  const now = params.now || new Date();
  const depositedAt = new Date(params.depositedAt);
  const hoursStored = Math.max(0, (now.getTime() - depositedAt.getTime()) / (1000 * 60 * 60));
  const hoursBilled = Math.max(0, hoursStored - params.freeHours);
  const totalFee = Math.round(hoursBilled * params.ratePerHour * 100) / 100;
  const isOverdue = hoursStored > params.freeHours;
  const isApproachingLimit = !isOverdue && (params.freeHours - hoursStored) <= 2;

  return {
    freeHours: params.freeHours,
    hoursStored: Math.round(hoursStored * 100) / 100,
    hoursBilled: Math.round(hoursBilled * 100) / 100,
    ratePerHour: params.ratePerHour,
    totalFee,
    isOverdue,
    isApproachingLimit,
  };
}

export async function getFeeSettings(): Promise<{ freeHours: number; ratePerHour: number; currency: string }> {
  const freeHoursSetting = await db.systemSetting.findUnique({ where: { key: 'DEFAULT_FREE_HOURS' } });
  const rateSetting = await db.systemSetting.findUnique({ where: { key: 'DEFAULT_HOURLY_RATE' } });
  const currencySetting = await db.systemSetting.findUnique({ where: { key: 'DEFAULT_CURRENCY' } });

  return {
    freeHours: freeHoursSetting ? parseInt(freeHoursSetting.value) : parseInt(process.env.DEFAULT_FREE_HOURS || '24'),
    ratePerHour: rateSetting ? parseFloat(rateSetting.value) : parseFloat(process.env.DEFAULT_HOURLY_RATE || '0.5'),
    currency: currencySetting?.value || process.env.DEFAULT_CURRENCY || 'USD',
  };
}

export async function processAutoCharges(): Promise<{
  processed: number;
  totalCharged: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let totalCharged = 0;

  // Find all parcels that are deposited and have accumulating fees
  const overdueFees = await db.storageFee.findMany({
    where: {
      status: 'ACCUMULATING',
    },
    include: {
      parcel: {
        include: {
          customer: true,
          locker: true,
        },
      },
    },
  });

  for (const fee of overdueFees) {
    if (!fee.parcel || fee.parcel.status === 'COLLECTED' || fee.parcel.status === 'RETURNED') {
      continue;
    }

    const settings = await getFeeSettings();
    const calculation = calculateStorageFee({
      depositedAt: fee.parcel.depositedAt,
      freeHours: fee.freeHours,
      ratePerHour: fee.ratePerHour,
    });

    // Update the fee amount
    const newAmount = calculation.totalFee;

    if (newAmount > 0 && fee.parcel.customer.balance >= newAmount) {
      // Customer has enough balance, auto-charge
      try {
        await db.$transaction(async (tx) => {
          // Create payment
          const payment = await tx.payment.create({
            data: {
              customerId: fee.parcel.customerId,
              amount: newAmount,
              currency: settings.currency,
              method: 'BALANCE',
              status: 'COMPLETED',
              description: `Storage fee for parcel ${fee.parcel.trackingCode}`,
            },
          });

          // Update fee
          await tx.storageFee.update({
            where: { id: fee.id },
            data: {
              amount: newAmount,
              status: 'CHARGED',
              chargedAt: new Date(),
              paymentId: payment.id,
              endDate: new Date(),
            },
          });

          // Deduct from customer balance
          await tx.customer.update({
            where: { id: fee.parcel.customerId },
            data: { balance: { decrement: newAmount } },
          });

          // Create new accumulating fee if parcel still not collected
          if (fee.parcel.status !== 'COLLECTED') {
            await tx.storageFee.create({
              data: {
                parcelId: fee.parcel.id,
                feeType: 'HOURLY',
                amount: 0,
                freeHours: 0, // No more free hours after first charge
                ratePerHour: fee.ratePerHour,
                startDate: new Date(),
              },
            });
          }
        });

        processed++;
        totalCharged += newAmount;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Failed to charge ${fee.parcel.trackingCode}: ${errorMsg}`);
      }
    } else {
      // Just update the accumulating amount
      await db.storageFee.update({
        where: { id: fee.id },
        data: { amount: newAmount },
      });
    }
  }

  return { processed, totalCharged, errors };
}
