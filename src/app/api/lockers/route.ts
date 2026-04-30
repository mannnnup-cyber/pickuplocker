import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/lockers - List all lockers with optional filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get('locationId');
    const status = searchParams.get('status');
    const size = searchParams.get('size');

    const where: Record<string, unknown> = {};
    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (size) where.size = size;

    const lockers = await db.locker.findMany({
      where,
      include: {
        location: true,
        parcels: {
          where: { status: { in: ['DEPOSITED', 'NOTIFIED', 'REMINDED', 'OVERDUE'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { customer: true },
        },
      },
      orderBy: [{ lockerNumber: 'asc' }],
    });

    return NextResponse.json(lockers);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/lockers - Create a new locker
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lockerNumber, size, locationId } = body;

    if (!lockerNumber || !locationId) {
      return NextResponse.json(
        { error: 'Locker number and location are required' },
        { status: 400 }
      );
    }

    const locker = await db.locker.create({
      data: {
        lockerNumber,
        size: size || 'MEDIUM',
        locationId,
      },
      include: { location: true },
    });

    return NextResponse.json(locker, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Locker number already exists at this location' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/lockers - Update a locker
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, lockerNumber, size, status, locationId } = body;

    if (!id) {
      return NextResponse.json({ error: 'Locker ID is required' }, { status: 400 });
    }

    const locker = await db.locker.update({
      where: { id },
      data: {
        ...(lockerNumber && { lockerNumber }),
        ...(size && { size }),
        ...(status && { status }),
        ...(locationId && { locationId }),
      },
      include: { location: true },
    });

    return NextResponse.json(locker);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/lockers - Delete a locker
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Locker ID is required' }, { status: 400 });
    }

    const locker = await db.locker.findUnique({
      where: { id },
      include: { parcels: { where: { status: { in: ['DEPOSITED', 'NOTIFIED', 'REMINDED', 'OVERDUE'] } } } },
    });

    if (!locker) {
      return NextResponse.json({ error: 'Locker not found' }, { status: 404 });
    }

    if (locker.parcels.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a locker with active parcels' },
        { status: 400 }
      );
    }

    await db.locker.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
