import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Daily/Weekly Report Generator API
 * 
 * Generates comprehensive reports for:
 * - Orders summary (new, picked up, pending)
 * - Revenue breakdown (storage fees, by payment method)
 * - Storage utilization (boxes used, by device)
 * - Courier activity
 * - Abandoned package alerts
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'daily'; // daily, weekly, monthly

    // Calculate date ranges
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    let previousStartDate: Date;
    let previousEndDate: Date;

    switch (type) {
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        previousEndDate = new Date(startDate);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default: // daily
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        previousEndDate = new Date(startDate);
    }

    // Fetch current period data
    const [
      newOrders,
      pickedUpOrders,
      pendingOrders,
      payments,
      devices,
      couriers,
      abandonedOrders,
    ] = await Promise.all([
      // New orders in period
      db.order.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      // Picked up orders in period
      db.order.count({
        where: {
          status: 'PICKED_UP',
          pickUpAt: { gte: startDate, lte: endDate },
        },
      }),
      // Pending orders (still stored)
      db.order.count({
        where: {
          status: { in: ['STORED', 'READY'] },
        },
      }),
      // Payments in period
      db.payment.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED',
        },
        include: {
          order: true,
        },
      }),
      // Device status
      db.device.findMany({
        include: {
          _count: {
            select: { boxes: true },
          },
          orders: {
            where: {
              status: { in: ['STORED', 'READY'] },
            },
          },
        },
      }),
      // Courier activity
      db.courier.findMany({
        include: {
          _count: {
            select: { orders: true },
          },
          orders: {
            where: {
              createdAt: { gte: startDate, lte: endDate },
            },
          },
        },
      }),
      // Abandoned/at-risk orders
      db.order.findMany({
        where: {
          status: { in: ['STORED', 'READY'] },
          createdAt: {
            lte: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25+ days old
          },
        },
        include: {
          device: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Calculate revenue
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const cashPayments = payments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + p.amount, 0);
    const onlinePayments = payments.filter(p => p.method === 'ONLINE').reduce((sum, p) => sum + p.amount, 0);

    // Storage utilization
    const storageUtilization = devices.map(device => ({
      name: device.name,
      deviceId: device.deviceId,
      totalBoxes: device.totalBoxes,
      usedBoxes: device.orders.length,
      availableBoxes: device.availableBoxes,
      utilizationPercent: device.totalBoxes > 0 
        ? Math.round((device.orders.length / device.totalBoxes) * 100) 
        : 0,
    }));

    // Courier activity summary
    const courierSummary = couriers.map(courier => ({
      name: courier.name,
      code: courier.code,
      balance: courier.balance,
      ordersThisPeriod: courier.orders.length,
      totalDropOffs: courier.totalDropOffs,
    }));

    // Fetch previous period for comparison
    const [previousNewOrders, previousPickedUpOrders, previousPayments] = await Promise.all([
      db.order.count({
        where: {
          createdAt: { gte: previousStartDate!, lte: previousEndDate! },
        },
      }),
      db.order.count({
        where: {
          status: 'PICKED_UP',
          pickUpAt: { gte: previousStartDate!, lte: previousEndDate! },
        },
      }),
      db.payment.findMany({
        where: {
          createdAt: { gte: previousStartDate!, lte: previousEndDate! },
          status: 'COMPLETED',
        },
      }),
    ]);

    const previousRevenue = previousPayments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate trends
    const orderTrend = previousNewOrders > 0 
      ? Math.round(((newOrders - previousNewOrders) / previousNewOrders) * 100) 
      : 0;
    const pickupTrend = previousPickedUpOrders > 0 
      ? Math.round(((pickedUpOrders - previousPickedUpOrders) / previousPickedUpOrders) * 100) 
      : 0;
    const revenueTrend = previousRevenue > 0 
      ? Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 100) 
      : 0;

    const report = {
      generatedAt: now.toISOString(),
      type,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: {
        newOrders,
        pickedUpOrders,
        pendingOrders,
        totalRevenue,
        orderTrend,
        pickupTrend,
        revenueTrend,
      },
      revenue: {
        total: totalRevenue,
        cash: cashPayments,
        online: onlinePayments,
        paymentsCount: payments.length,
        averagePayment: payments.length > 0 ? totalRevenue / payments.length : 0,
      },
      storageUtilization,
      courierActivity: courierSummary,
      abandonedPackages: {
        count: abandonedOrders.length,
        orders: abandonedOrders.map(o => ({
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          daysStored: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
          storageFee: o.storageFee,
          deviceName: o.device?.name,
          boxNumber: o.boxNumber,
        })),
      },
    };

    return NextResponse.json({
      success: true,
      data: report,
    });

  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate report',
    }, { status: 500 });
  }
}
