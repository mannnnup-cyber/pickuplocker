import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/locations
export async function GET() {
  try {
    const locations = await db.lockerLocation.findMany({
      include: {
        _count: { select: { lockers: true } },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(locations);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/locations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, city } = body;

    if (!name || !address) {
      return NextResponse.json({ error: 'Name and address are required' }, { status: 400 });
    }

    const location = await db.lockerLocation.create({
      data: { name, address, city: city || '' },
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Location name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/locations
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Location ID is required' }, { status: 400 });
    }

    const lockers = await db.locker.count({ where: { locationId: id } });
    if (lockers > 0) {
      return NextResponse.json(
        { error: 'Cannot delete location with lockers. Delete lockers first.' },
        { status: 400 }
      );
    }

    await db.lockerLocation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
