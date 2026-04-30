import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/payments
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const payments = await db.payment.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalRevenue = await db.payment.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });

    return NextResponse.json({
      payments,
      totalRevenue: totalRevenue._sum.amount || 0,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/payments - Top up customer balance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, amount, method, description } = body;

    if (!customerId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Customer ID and positive amount are required' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          customerId,
          amount,
          method: method || 'CASH',
          status: 'COMPLETED',
          description: description || 'Balance top-up',
        },
        include: { customer: true },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: amount } },
      });

      return payment;
    });

    const updatedCustomer = await db.customer.findUnique({ where: { id: customerId } });

    return NextResponse.json({ payment: result, customer: updatedCustomer }, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
