import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/seed - Seed demo data
export async function POST() {
  try {
    // Create locations
    const downtown = await db.lockerLocation.create({
      data: { name: 'Downtown Hub', address: '123 Main St', city: 'New York' },
    });
    const midtown = await db.lockerLocation.create({
      data: { name: 'Midtown Station', address: '456 5th Ave', city: 'New York' },
    });
    const airport = await db.lockerLocation.create({
      data: { name: 'Airport Terminal', address: 'JFK Airport, Terminal 4', city: 'Queens' },
    });

    // Create lockers
    const lockerData = [];
    const sizes = ['SMALL', 'MEDIUM', 'LARGE', 'XLARGE'] as const;
    const statuses = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'OCCUPIED', 'AVAILABLE', 'MAINTENANCE'] as const;

    for (const loc of [downtown, midtown, airport]) {
      const prefix = loc.name === 'Downtown Hub' ? 'A' : loc.name === 'Midtown Station' ? 'B' : 'C';
      for (let i = 1; i <= 12; i++) {
        const num = i < 10 ? `0${i}` : `${i}`;
        lockerData.push({
          lockerNumber: `${prefix}-${num}`,
          size: sizes[i % 4],
          status: statuses[i % 6],
          locationId: loc.id,
        });
      }
    }

    await db.locker.createMany({ data: lockerData });

    // Create customers
    const customers = await Promise.all([
      db.customer.create({ data: { name: 'Alice Johnson', phone: '+12125551234', email: 'alice@example.com', balance: 50.00 } }),
      db.customer.create({ data: { name: 'Bob Smith', phone: '+12125555678', email: 'bob@example.com', balance: 25.00 } }),
      db.customer.create({ data: { name: 'Carol Davis', phone: '+12125559012', email: 'carol@example.com', balance: 100.00 } }),
      db.customer.create({ data: { name: 'David Lee', phone: '+12125553456', balance: 10.00 } }),
      db.customer.create({ data: { name: 'Emma Wilson', phone: '+12125557890', email: 'emma@example.com', balance: 75.00 } }),
    ]);

    // Create some parcels in occupied lockers
    const occupiedLockers = await db.locker.findMany({ where: { status: 'OCCUPIED' } });

    if (occupiedLockers.length > 0) {
      const parcelData = [
        { trackingCode: 'PKG-001', description: 'Amazon Package - Electronics', hoursAgo: 2 },
        { trackingCode: 'PKG-002', description: 'FedEx Delivery - Documents', hoursAgo: 18 },
        { trackingCode: 'PKG-003', description: 'UPS Package - Clothing', hoursAgo: 26 },
        { trackingCode: 'PKG-004', description: 'DHL Express - Books', hoursAgo: 48 },
        { trackingCode: 'PKG-005', description: 'USPS Package - Medicine', hoursAgo: 5 },
        { trackingCode: 'PKG-006', description: 'Amazon Fresh - Groceries', hoursAgo: 72 },
      ];

      for (let i = 0; i < Math.min(parcelData.length, occupiedLockers.length); i++) {
        const p = parcelData[i];
        const depositedAt = new Date(Date.now() - p.hoursAgo * 60 * 60 * 1000);
        const customer = customers[i % customers.length];

        const parcelStatus = p.hoursAgo > 24 ? 'OVERDUE' : p.hoursAgo > 12 ? 'REMINDED' : 'NOTIFIED';

        const parcel = await db.parcel.create({
          data: {
            trackingCode: p.trackingCode,
            description: p.description,
            lockerId: occupiedLockers[i].id,
            customerId: customer.id,
            status: parcelStatus,
            depositedAt,
          },
        });

        // Create storage fee
        await db.storageFee.create({
          data: {
            parcelId: parcel.id,
            feeType: 'HOURLY',
            amount: p.hoursAgo > 24 ? (p.hoursAgo - 24) * 0.5 : 0,
            freeHours: 24,
            ratePerHour: 0.5,
            startDate: depositedAt,
            status: p.hoursAgo > 24 ? 'ACCUMULATING' : 'ACCUMULATING',
          },
        });
      }
    }

    // Create some collected parcels
    const availableLockers = await db.locker.findMany({ where: { status: 'AVAILABLE' } });
    const collectedParcelData = [
      { trackingCode: 'PKG-C01', description: 'Old Package 1' },
      { trackingCode: 'PKG-C02', description: 'Old Package 2' },
    ];

    for (let i = 0; i < collectedParcelData.length; i++) {
      const p = collectedParcelData[i];
      const customer = customers[i];
      const depositedAt = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const collectedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);

      // Temporarily use an available locker
      const locker = availableLockers[i];
      if (!locker) break;

      await db.locker.update({ where: { id: locker.id }, data: { status: 'OCCUPIED' } });

      const parcel = await db.parcel.create({
        data: {
          trackingCode: p.trackingCode,
          description: p.description,
          lockerId: locker.id,
          customerId: customer.id,
          status: 'COLLECTED',
          depositedAt,
          collectedAt,
        },
      });

      await db.storageFee.create({
        data: {
          parcelId: parcel.id,
          feeType: 'HOURLY',
          amount: 0,
          freeHours: 24,
          ratePerHour: 0.5,
          startDate: depositedAt,
          endDate: collectedAt,
          status: 'WAIVED',
        },
      });

      // Free the locker back
      await db.locker.update({ where: { id: locker.id }, data: { status: 'AVAILABLE' } });
    }

    // Create some payment records
    await db.payment.createMany({
      data: [
        { customerId: customers[0].id, amount: 50, method: 'CASH', status: 'COMPLETED', description: 'Initial top-up' },
        { customerId: customers[2].id, amount: 100, method: 'CARD', status: 'COMPLETED', description: 'Initial top-up' },
        { customerId: customers[4].id, amount: 75, method: 'ONLINE', status: 'COMPLETED', description: 'Initial top-up' },
      ],
    });

    // Seed system settings
    await db.systemSetting.upsert({
      where: { key: 'DEFAULT_FREE_HOURS' },
      update: { value: '24' },
      create: { key: 'DEFAULT_FREE_HOURS', value: '24' },
    });
    await db.systemSetting.upsert({
      where: { key: 'DEFAULT_HOURLY_RATE' },
      update: { value: '0.5' },
      create: { key: 'DEFAULT_HOURLY_RATE', value: '0.5' },
    });
    await db.systemSetting.upsert({
      where: { key: 'DEFAULT_CURRENCY' },
      update: { value: 'USD' },
      create: { key: 'DEFAULT_CURRENCY', value: 'USD' },
    });

    return NextResponse.json({ success: true, message: 'Demo data seeded successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Seed error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
