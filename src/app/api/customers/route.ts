import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/customers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const customers = await db.customer.findMany({
      where,
      include: {
        _count: { select: { parcels: true, payments: true } },
        parcels: {
          where: { status: { in: ['DEPOSITED', 'NOTIFIED', 'REMINDED', 'OVERDUE'] } },
          take: 3,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(customers);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/customers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, balance } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Name and phone are required' },
        { status: 400 }
      );
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone,
        email,
        balance: balance || 0,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Phone number already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/customers
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, phone, email, balance } = body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(email !== undefined && { email }),
        ...(balance !== undefined && { balance }),
      },
    });

    return NextResponse.json(customer);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/customers
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const activeParcels = await db.parcel.count({
      where: { customerId: id, status: { in: ['DEPOSITED', 'NOTIFIED', 'REMINDED', 'OVERDUE'] } },
    });

    if (activeParcels > 0) {
      return NextResponse.json(
        { error: 'Cannot delete customer with active parcels' },
        { status: 400 }
      );
    }

    await db.customer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
