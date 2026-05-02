import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Account API — Get user account data by phone number
 * 
 * GET /api/account?phone=876XXXXXXX
 */
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
  }

  // Clean phone number
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  // Find user by phone
  const user = await db.user.findFirst({
    where: { phone: cleanPhone },
    include: {
      savedPaymentMethods: {
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
      },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          packageSize: true,
          storageFee: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'No account found with this phone number' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      name: user.name,
      phone: user.phone,
      email: user.email?.includes('@pickup.local') ? null : user.email,
    },
    savedCards: user.savedPaymentMethods.map(card => ({
      id: card.id,
      brand: card.brand,
      last4: card.last4,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      isDefault: card.isDefault,
      lastUsedAt: card.lastUsedAt?.toISOString() || null,
    })),
    orders: user.orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      packageSize: order.packageSize,
      storageFee: order.storageFee,
      createdAt: order.createdAt.toISOString(),
    })),
  });
}
