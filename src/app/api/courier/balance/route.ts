import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Courier Balance Management API
 * 
 * GET - Get balance history
 * POST - Add balance (admin or payment)
 * PUT - Deduct balance (for drop-offs)
 */

// GET - Get balance history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courierId = searchParams.get('courierId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!courierId) {
      return NextResponse.json({
        success: false,
        error: 'Courier ID is required'
      }, { status: 400 });
    }

    // Get transactions
    const transactions = await db.courierTransaction.findMany({
      where: { courierId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Get courier info
    const courier = await db.courier.findUnique({
      where: { id: courierId },
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
        totalDropOffs: true,
        totalSpent: true
      }
    });

    return NextResponse.json({
      success: true,
      courier,
      transactions
    });

  } catch (error) {
    console.error('[Courier Balance] Get error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get balance history'
    }, { status: 500 });
  }
}

// POST - Add balance (top-up)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courierId, amount, paymentMethod, paymentRef, notes, processedBy } = body;

    console.log('[Courier Balance] Add balance:', { courierId, amount, paymentMethod });

    // Validate
    if (!courierId || !amount || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Courier ID and valid amount are required'
      }, { status: 400 });
    }

    if (!['CASH', 'DIMEPAY', 'BANK_TRANSFER', 'ADJUSTMENT'].includes(paymentMethod)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid payment method'
      }, { status: 400 });
    }

    // Get courier
    const courier = await db.courier.findUnique({
      where: { id: courierId }
    });

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: 'Courier not found'
      }, { status: 404 });
    }

    // Calculate new balance
    const newBalance = courier.balance + amount;

    // Create transaction and update balance in a transaction
    const result = await db.$transaction([
      // Create transaction record
      db.courierTransaction.create({
        data: {
          courierId,
          type: 'TOP_UP',
          amount: amount,
          balanceAfter: newBalance,
          paymentMethod,
          paymentRef,
          description: notes || `Top-up via ${paymentMethod}`,
          processedBy
        }
      }),
      // Update courier balance
      db.courier.update({
        where: { id: courierId },
        data: {
          balance: newBalance,
          lastActivityAt: new Date()
        }
      })
    ]);

    console.log('[Courier Balance] Top-up successful:', {
      courier: courier.name,
      amount,
      newBalance
    });

    // Log activity
    await db.activity.create({
      data: {
        action: 'COURIER_TOP_UP',
        description: `${courier.name} topped up JMD $${amount} via ${paymentMethod}`,
        metadata: JSON.stringify({
          courierId,
          courierName: courier.name,
          amount,
          paymentMethod,
          newBalance,
          processedBy
        })
      }
    }).catch(err => console.error('[Activity] Log failed:', err));

    return NextResponse.json({
      success: true,
      message: 'Balance added successfully',
      transaction: result[0],
      newBalance
    });

  } catch (error) {
    console.error('[Courier Balance] Add error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to add balance'
    }, { status: 500 });
  }
}

// PUT - Deduct balance (for drop-offs)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { courierId, amount, orderId, description } = body;

    console.log('[Courier Balance] Deduct:', { courierId, amount, orderId });

    // Validate
    if (!courierId || !amount || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Courier ID and valid amount are required'
      }, { status: 400 });
    }

    // Get courier
    const courier = await db.courier.findUnique({
      where: { id: courierId }
    });

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: 'Courier not found'
      }, { status: 404 });
    }

    // Check if courier is active
    if (courier.status !== 'ACTIVE') {
      return NextResponse.json({
        success: false,
        error: 'Courier account is not active'
      }, { status: 403 });
    }

    // Check balance (including credit limit)
    const availableBalance = courier.balance + courier.creditLimit;
    if (availableBalance < amount) {
      return NextResponse.json({
        success: false,
        error: `Insufficient balance. Available: JMD $${availableBalance.toFixed(2)}`
      }, { status: 400 });
    }

    // Calculate new balance
    const newBalance = courier.balance - amount;

    // Create transaction and update in a single transaction
    const result = await db.$transaction([
      // Create transaction record
      db.courierTransaction.create({
        data: {
          courierId,
          type: 'DROP_OFF',
          amount: -amount, // Negative for deduction
          balanceAfter: newBalance,
          reference: orderId,
          description: description || `Drop-off fee`,
          paymentMethod: 'PREPAID'
        }
      }),
      // Update courier
      db.courier.update({
        where: { id: courierId },
        data: {
          balance: newBalance,
          totalDropOffs: { increment: 1 },
          totalSpent: { increment: amount },
          lastActivityAt: new Date()
        }
      })
    ]);

    console.log('[Courier Balance] Deduct successful:', {
      courier: courier.name,
      amount,
      newBalance
    });

    return NextResponse.json({
      success: true,
      message: 'Balance deducted',
      transaction: result[0],
      newBalance
    });

  } catch (error) {
    console.error('[Courier Balance] Deduct error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to deduct balance'
    }, { status: 500 });
  }
}
