import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Unified Transactions API
 * 
 * Provides a consolidated view of all monetary transactions:
 * - Customer payments (drop-off codes, storage fees)
 * - Courier transactions (top-ups, deductions, adjustments)
 * - Refunds
 */

// Transaction type groups
const PAYMENT_IN_TYPES = ['DROP_OFF_PAYMENT', 'STORAGE_FEE'];
const COURIER_TYPES = ['COURIER_TOPUP', 'COURIER_TOPUP_CASH', 'COURIER_DROPOFF', 'COURIER_PAYMENT'];
const OUT_TYPES = ['REFUND'];

interface Transaction {
  id: string;
  type: string;
  category: 'payment_in' | 'courier' | 'payout';
  amount: number;
  fee?: number;
  netAmount?: number;
  currency: string;
  status: string;
  method: string;
  customerName?: string;
  customerPhone?: string;
  courierName?: string;
  courierId?: string;
  orderId?: string;
  orderNumber?: string;
  description?: string;
  gatewayRef?: string;
  createdAt: string;
  paidAt?: string;
}

// GET /api/transactions - List all transactions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all'; // all, payment_in, courier, payout
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const transactions: Transaction[] = [];

    // Build date filter
    const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
    if (startDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { ...dateFilter.createdAt, lte: end };
    }

    // Fetch payments based on category filter
    if (category === 'all' || category === 'payment_in' || category === 'payout') {
      const paymentWhere: {
        status?: string;
        type?: string | { in: string[] };
        createdAt?: { gte?: Date; lte?: Date };
      } = { ...dateFilter };

      // Filter by type or category
      if (type) {
        paymentWhere.type = type;
      } else if (category === 'payment_in') {
        paymentWhere.type = { in: PAYMENT_IN_TYPES };
      } else if (category === 'payout') {
        paymentWhere.type = { in: OUT_TYPES };
      }

      if (status) {
        paymentWhere.status = status;
      }

      const payments = await db.payment.findMany({
        where: paymentWhere,
        include: {
          order: {
            select: {
              orderNumber: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      for (const payment of payments) {
        const isPaymentIn = PAYMENT_IN_TYPES.includes(payment.type);
        transactions.push({
          id: payment.id,
          type: payment.type,
          category: isPaymentIn ? 'payment_in' : 'payout',
          amount: payment.amount,
          fee: payment.feeAmount || undefined,
          netAmount: payment.netAmount || undefined,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          customerName: payment.customerName || undefined,
          customerPhone: payment.customerPhone || undefined,
          courierId: payment.courierId || undefined,
          orderId: payment.orderId || undefined,
          orderNumber: payment.order?.orderNumber || undefined,
          description: payment.description || undefined,
          gatewayRef: payment.gatewayRef || undefined,
          createdAt: payment.createdAt.toISOString(),
          paidAt: payment.paidAt?.toISOString(),
        });
      }
    }

    // Fetch courier transactions
    if (category === 'all' || category === 'courier') {
      const courierWhere: {
        type?: string;
        createdAt?: { gte?: Date; lte?: Date };
      } = { ...dateFilter };

      if (type) {
        courierWhere.type = type;
      }

      const courierTransactions = await db.courierTransaction.findMany({
        where: courierWhere,
        include: {
          courier: {
            select: {
              name: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      for (const txn of courierTransactions) {
        let txnType = txn.type;
        let method = 'BALANCE';
        
        if (txn.type === 'TOP_UP' && txn.paymentId) {
          txnType = 'COURIER_TOPUP';
          method = 'ONLINE';
        } else if (txn.type === 'TOP_UP') {
          txnType = 'COURIER_TOPUP_CASH';
          method = 'CASH';
        }

        transactions.push({
          id: txn.id,
          type: txnType,
          category: 'courier',
          amount: Math.abs(txn.amount),
          currency: 'JMD',
          status: 'COMPLETED',
          method,
          courierName: txn.courier?.name || undefined,
          courierId: txn.courierId,
          orderId: txn.orderId || undefined,
          description: txn.description || undefined,
          createdAt: txn.createdAt.toISOString(),
        });
      }
    }

    // Sort all transactions by date
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Get summary statistics
    const summary = await getTransactionSummary(dateFilter);

    return NextResponse.json({
      success: true,
      data: transactions.slice(0, limit),
      summary,
      pagination: {
        total: transactions.length,
        limit,
        offset,
        hasMore: transactions.length > limit + offset,
      }
    });

  } catch (error) {
    console.error('Transactions API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch transactions',
    }, { status: 500 });
  }
}

// Get transaction summary statistics
async function getTransactionSummary(dateFilter: { createdAt?: { gte?: Date; lte?: Date } }) {
  try {
    // Payment totals
    const payments = await db.payment.aggregate({
      where: {
        ...dateFilter,
        status: 'COMPLETED',
        type: { in: PAYMENT_IN_TYPES },
      },
      _sum: {
        amount: true,
        feeAmount: true,
        netAmount: true,
      },
      _count: true,
    });

    // Courier top-up totals
    const courierTopups = await db.courierTransaction.aggregate({
      where: {
        ...dateFilter,
        type: 'TOP_UP',
        amount: { gt: 0 },
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    // Courier deductions (drop-offs)
    const courierDeductions = await db.courierTransaction.aggregate({
      where: {
        ...dateFilter,
        type: 'DROP_OFF',
        amount: { lt: 0 },
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    // Refunds
    const refunds = await db.payment.aggregate({
      where: {
        ...dateFilter,
        type: 'REFUND',
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    // Pending payments
    const pendingPayments = await db.payment.aggregate({
      where: {
        ...dateFilter,
        status: 'PENDING',
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    return {
      paymentsIn: {
        total: payments._sum.amount || 0,
        fees: payments._sum.feeAmount || 0,
        net: payments._sum.netAmount || payments._sum.amount || 0,
        count: payments._count,
      },
      courierTopups: {
        total: courierTopups._sum.amount || 0,
        count: courierTopups._count,
      },
      courierDeductions: {
        total: Math.abs(courierDeductions._sum.amount || 0),
        count: courierDeductions._count,
      },
      refunds: {
        total: refunds._sum.amount || 0,
        count: refunds._count,
      },
      pending: {
        total: pendingPayments._sum.amount || 0,
        count: pendingPayments._count,
      },
      netRevenue: (payments._sum.amount || 0) - (refunds._sum.amount || 0),
    };
  } catch (error) {
    console.error('Failed to get transaction summary:', error);
    return null;
  }
}
