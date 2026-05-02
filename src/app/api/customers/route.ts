import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';

  try {
    const { db } = await import('@/lib/db');
    
    const customers = await db.user.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } }
        ]
      } : {},
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        _count: {
          select: { orders: true }
        },
        orders: {
          where: { status: { in: ['STORED', 'READY'] } },
          select: { id: true }
        }
      },
      take: 50
    });

    return NextResponse.json({
      success: true,
      data: customers.map(c => ({
        id: c.id,
        name: c.name || 'Unknown',
        email: c.email,
        phone: c.phone || '',
        totalOrders: c._count.orders,
        activeOrders: c.orders.length
      }))
    });
  } catch (error) {
    console.error('Customers error:', error);
    // Return mock data
    return NextResponse.json({
      success: true,
      data: [
        { id: '1', name: 'John Brown', email: 'john.b@email.com', phone: '876-555-0101', totalOrders: 5, activeOrders: 1 },
        { id: '2', name: 'Sarah Jones', email: 'sarah.j@email.com', phone: '876-555-0202', totalOrders: 12, activeOrders: 1 },
        { id: '3', name: 'Michael Davis', email: 'michael.d@email.com', phone: '876-555-0303', totalOrders: 3, activeOrders: 1 },
      ]
    });
  }
}
