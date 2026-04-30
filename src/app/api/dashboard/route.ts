import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [
      totalLockers,
      availableLockers,
      occupiedLockers,
      maintenanceLockers,
      totalParcels,
      depositedParcels,
      collectedParcels,
      overdueParcels,
      totalCustomers,
      totalRevenue,
      recentParcels,
      recentSms,
      pendingFees,
      locations,
    ] = await Promise.all([
      db.locker.count(),
      db.locker.count({ where: { status: 'AVAILABLE' } }),
      db.locker.count({ where: { status: 'OCCUPIED' } }),
      db.locker.count({ where: { status: { in: ['MAINTENANCE', 'OUT_OF_SERVICE'] } } }),
      db.parcel.count(),
      db.parcel.count({ where: { status: 'DEPOSITED' } }),
      db.parcel.count({ where: { status: 'COLLECTED' } }),
      db.parcel.count({ where: { status: 'OVERDUE' } }),
      db.customer.count(),
      db.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
      db.parcel.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, locker: { include: { location: true } } },
      }),
      db.smsLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true },
      }),
      db.storageFee.aggregate({
        where: { status: 'ACCUMULATING' },
        _sum: { amount: true },
      }),
      db.lockerLocation.findMany({
        include: {
          _count: { select: { lockers: true } },
        },
      }),
    ]);

    return NextResponse.json({
      lockers: {
        total: totalLockers,
        available: availableLockers,
        occupied: occupiedLockers,
        maintenance: maintenanceLockers,
        utilizationRate: totalLockers > 0 ? Math.round((occupiedLockers / totalLockers) * 100) : 0,
      },
      parcels: {
        total: totalParcels,
        deposited: depositedParcels,
        collected: collectedParcels,
        overdue: overdueParcels,
      },
      customers: { total: totalCustomers },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        pendingFees: pendingFees._sum.amount || 0,
      },
      recentParcels,
      recentSms,
      locations,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
