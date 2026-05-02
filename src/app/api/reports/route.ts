import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Storage fee tiers (in JMD)
const STORAGE_FEE_TIERS = {
  free: 0,           // Days 1-3: Free
  tier1: 100,        // Days 4-7: $100/day
  tier2: 150,        // Days 8-14: $150/day
  tier3: 200,        // Days 15-30: $200/day
};

const FREE_DAYS = 3;
const MAX_STORAGE_DAYS = 30;

// Calculate storage fee based on days stored
function calculateStorageFee(days: number): number {
  if (days <= FREE_DAYS) return 0;
  
  let fee = 0;
  
  // Days 4-7: $100/day
  if (days > FREE_DAYS) {
    const tier1Days = Math.min(days - FREE_DAYS, 4);
    fee += tier1Days * STORAGE_FEE_TIERS.tier1;
  }
  
  // Days 8-14: $150/day
  if (days > 7) {
    const tier2Days = Math.min(days - 7, 7);
    fee += tier2Days * STORAGE_FEE_TIERS.tier2;
  }
  
  // Days 15-30: $200/day
  if (days > 14) {
    const tier3Days = Math.min(days - 14, 16);
    fee += tier3Days * STORAGE_FEE_TIERS.tier3;
  }
  
  return fee;
}

// GET /api/reports - Generate reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'summary';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    switch (type) {
      case 'summary': {
        // Get overall stats
        const [totalOrders, activeOrders, totalRevenue, todayOrders] = await Promise.all([
          db.order.count(),
          db.order.count({ where: { status: 'STORED' } }),
          db.payment.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
          }),
          db.order.count({
            where: {
              createdAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),
        ]);

        // Get storage fee stats
        const storedOrders = await db.order.findMany({
          where: { status: 'STORED' },
          select: { storageStartAt: true, storageFee: true },
        });

        const now = new Date();
        let totalPendingStorageFees = 0;
        let itemsNearAbandonment = 0;

        storedOrders.forEach(order => {
          if (order.storageStartAt) {
            const days = Math.floor((now.getTime() - order.storageStartAt.getTime()) / (1000 * 60 * 60 * 24));
            const currentFee = calculateStorageFee(days);
            totalPendingStorageFees += currentFee;
            
            if (days >= 25) itemsNearAbandonment++;
          }
        });

        return NextResponse.json({
          success: true,
          data: {
            totalOrders,
            activeOrders,
            todayOrders,
            totalRevenue: totalRevenue._sum.amount || 0,
            pendingStorageFees: totalPendingStorageFees,
            itemsNearAbandonment,
          },
        });
      }

      case 'storage_fees': {
        // Get all stored orders with calculated fees
        const storedOrders = await db.order.findMany({
          where: { status: 'STORED' },
          include: {
            device: { select: { name: true } },
          },
          orderBy: { storageStartAt: 'asc' },
        });

        const now = new Date();
        const report = storedOrders.map(order => {
          const storageStart = order.storageStartAt ? new Date(order.storageStartAt) : new Date(order.createdAt);
          const days = Math.floor((now.getTime() - storageStart.getTime()) / (1000 * 60 * 60 * 24));
          const currentFee = calculateStorageFee(days);
          const daysUntilAbandoned = Math.max(0, MAX_STORAGE_DAYS - days);

          return {
            orderNumber: order.orderNumber,
            trackingCode: order.trackingCode,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            deviceName: order.device?.name || 'Unknown',
            boxNumber: order.boxNumber,
            storageDays: days,
            originalFee: order.storageFee,
            currentFee,
            daysUntilAbandoned,
            status: days >= 25 ? 'AT_RISK' : days >= 15 ? 'OVERDUE' : days > 3 ? 'FEE_APPLIES' : 'FREE',
          };
        });

        return NextResponse.json({
          success: true,
          data: {
            orders: report,
            summary: {
              total: report.length,
              freePeriod: report.filter(o => o.storageDays <= 3).length,
              feeApplies: report.filter(o => o.storageDays > 3 && o.storageDays < 15).length,
              overdue: report.filter(o => o.storageDays >= 15 && o.storageDays < 25).length,
              atRisk: report.filter(o => o.storageDays >= 25).length,
              totalPendingFees: report.reduce((sum, o) => sum + o.currentFee, 0),
            },
          },
        });
      }

      case 'abandoned': {
        // Get orders that are candidates for abandonment (25+ days)
        const storedOrders = await db.order.findMany({
          where: { status: 'STORED' },
          include: {
            device: { select: { name: true } },
          },
        });

        const now = new Date();
        const abandonedCandidates = storedOrders
          .map(order => {
            const storageStart = order.storageStartAt ? new Date(order.storageStartAt) : new Date(order.createdAt);
            const days = Math.floor((now.getTime() - storageStart.getTime()) / (1000 * 60 * 60 * 24));
            
            return {
              ...order,
              storageDays: days,
              currentFee: calculateStorageFee(days),
            };
          })
          .filter(order => order.storageDays >= 25)
          .sort((a, b) => b.storageDays - a.storageDays);

        return NextResponse.json({
          success: true,
          data: {
            orders: abandonedCandidates.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              trackingCode: order.trackingCode,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              deviceName: order.device?.name || 'Unknown',
              boxNumber: order.boxNumber,
              storageDays: order.storageDays,
              currentFee: order.currentFee,
              daysUntilAbandoned: MAX_STORAGE_DAYS - order.storageDays,
              lastNotification: order.notes,
            })),
            summary: {
              total: abandonedCandidates.length,
              readyForAbandonment: abandonedCandidates.filter(o => o.storageDays >= 30).length,
              totalPotentialRevenue: abandonedCandidates.reduce((sum, o) => sum + o.currentFee, 0),
            },
          },
        });
      }

      case 'courier_performance': {
        // Get courier usage stats
        const courierOrders = await db.order.groupBy({
          by: ['courierName'],
          where: {
            courierName: { not: null },
          },
          _count: true,
          _sum: { storageFee: true },
        });

        return NextResponse.json({
          success: true,
          data: courierOrders.map(c => ({
            courier: c.courierName || 'Unknown',
            totalOrders: c._count,
            totalStorageFees: c._sum.storageFee || 0,
          })),
        });
      }

      case 'revenue': {
        const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
        
        if (startDate) {
          dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(startDate) };
        }
        if (endDate) {
          dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(endDate) };
        }

        // Get payments
        const payments = await db.payment.findMany({
          where: {
            status: 'COMPLETED',
            ...dateFilter,
          },
          include: {
            order: {
              select: {
                orderNumber: true,
                customerName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Group by method
        const byMethod = payments.reduce((acc, p) => {
          const method = p.method;
          if (!acc[method]) {
            acc[method] = { count: 0, total: 0 };
          }
          acc[method].count++;
          acc[method].total += p.amount;
          return acc;
        }, {} as Record<string, { count: number; total: number }>);

        return NextResponse.json({
          success: true,
          data: {
            payments,
            byMethod,
            summary: {
              totalPayments: payments.length,
              totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
              byMethod: Object.entries(byMethod).map(([method, data]) => ({
                method,
                count: data.count,
                total: data.total,
              })),
            },
          },
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid report type. Use: summary, storage_fees, abandoned, courier_performance, revenue',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
