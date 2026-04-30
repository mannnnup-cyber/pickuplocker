import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Account Cards API — Manage saved payment methods
 * 
 * DELETE /api/account/cards — Remove a saved card
 * PATCH /api/account/cards — Set default card
 */

// DELETE — Remove a saved card (soft delete: set isActive = false)
export async function DELETE(request: NextRequest) {
  try {
    const { cardId } = await request.json();

    if (!cardId) {
      return NextResponse.json({ error: 'Card ID required' }, { status: 400 });
    }

    const card = await db.savedPaymentMethod.findUnique({ where: { id: cardId } });
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    // Soft delete
    await db.savedPaymentMethod.update({
      where: { id: cardId },
      data: { isActive: false },
    });

    // If this was the default card, set another card as default
    if (card.isDefault) {
      const nextCard = await db.savedPaymentMethod.findFirst({
        where: { userId: card.userId, isActive: true },
        orderBy: { lastUsedAt: 'desc' },
      });
      if (nextCard) {
        await db.savedPaymentMethod.update({
          where: { id: nextCard.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove card error:', error);
    return NextResponse.json({ error: 'Failed to remove card' }, { status: 500 });
  }
}

// PATCH — Set a card as default
export async function PATCH(request: NextRequest) {
  try {
    const { cardId, isDefault } = await request.json();

    if (!cardId) {
      return NextResponse.json({ error: 'Card ID required' }, { status: 400 });
    }

    const card = await db.savedPaymentMethod.findUnique({ where: { id: cardId } });
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    if (isDefault) {
      // Remove default from all other cards for this user
      await db.savedPaymentMethod.updateMany({
        where: { userId: card.userId, isActive: true },
        data: { isDefault: false },
      });

      // Set this card as default
      await db.savedPaymentMethod.update({
        where: { id: cardId },
        data: { isDefault: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set default card error:', error);
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 });
  }
}
