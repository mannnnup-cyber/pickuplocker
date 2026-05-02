import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendBulkSMS } from '@/lib/textbee';

/**
 * Bulk Operations API
 * 
 * Supports:
 * - Bulk SMS to customers
 * - Bulk status updates
 * - Bulk export (CSV/JSON)
 * - Bulk delete/archive
 */

// POST - Execute bulk operation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, orderIds, options } = body;

    if (!operation || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Operation and order IDs are required',
      }, { status: 400 });
    }

    // Limit bulk operations
    if (orderIds.length > 100) {
      return NextResponse.json({
        success: false,
        error: 'Maximum 100 orders per bulk operation',
      }, { status: 400 });
    }

    switch (operation) {
      case 'send_sms':
        return await bulkSendSMS(orderIds, options);
      
      case 'update_status':
        return await bulkUpdateStatus(orderIds, options);
      
      case 'export':
        return await bulkExport(orderIds, options);
      
      case 'delete':
        return await bulkDelete(orderIds);
      
      case 'mark_ready':
        return await bulkMarkReady(orderIds);
      
      case 'calculate_fees':
        return await bulkCalculateFees(orderIds);
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid operation. Use: send_sms, update_status, export, delete, mark_ready, calculate_fees',
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Bulk operation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// Bulk SMS
async function bulkSendSMS(orderIds: string[], options: { message?: string; template?: string }) {
  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      trackingCode: true,
      storageFee: true,
      device: { select: { name: true } },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No orders found',
    }, { status: 404 });
  }

  // Generate messages
  const messages = orders.map(order => {
    let message = options.message || '';
    
    // Replace placeholders
    message = message
      .replace(/{customerName}/g, order.customerName)
      .replace(/{orderNumber}/g, order.orderNumber)
      .replace(/{trackingCode}/g, order.trackingCode)
      .replace(/{storageFee}/g, `$${order.storageFee}`)
      .replace(/{deviceName}/g, order.device?.name || 'our locker');
    
    return {
      to: order.customerPhone,
      message,
    };
  });

  // Send bulk SMS
  const result = await sendBulkSMS(messages);

  // Log activity
  await db.activity.create({
    data: {
      action: 'BULK_SMS_SENT',
      description: `Sent bulk SMS to ${result.sent} customers (${result.failed} failed)`,
      metadata: JSON.stringify({
        orderIds,
        sent: result.sent,
        failed: result.failed,
      }),
    },
  });

  return NextResponse.json({
    success: result.success,
    sent: result.sent,
    failed: result.failed,
    total: orders.length,
  });
}

// Bulk status update
async function bulkUpdateStatus(orderIds: string[], options: { status: string; notes?: string }) {
  if (!options.status) {
    return NextResponse.json({
      success: false,
      error: 'Status is required',
    }, { status: 400 });
  }

  const validStatuses = ['PENDING', 'STORED', 'READY', 'PICKED_UP', 'ABANDONED', 'CANCELLED'];
  if (!validStatuses.includes(options.status)) {
    return NextResponse.json({
      success: false,
      error: `Invalid status. Valid: ${validStatuses.join(', ')}`,
    }, { status: 400 });
  }

  const result = await db.order.updateMany({
    where: { id: { in: orderIds } },
    data: {
      status: options.status as 'PENDING' | 'STORED' | 'READY' | 'PICKED_UP' | 'ABANDONED' | 'CANCELLED',
      notes: options.notes,
      updatedAt: new Date(),
    },
  });

  // Log activity
  await db.activity.create({
    data: {
      action: 'BULK_STATUS_UPDATE',
      description: `Updated ${result.count} orders to ${options.status}`,
      metadata: JSON.stringify({ orderIds, status: options.status }),
    },
  });

  return NextResponse.json({
    success: true,
    updated: result.count,
  });
}

// Bulk export
async function bulkExport(orderIds: string[], options: { format?: string }) {
  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    include: {
      device: { select: { name: true, deviceId: true } },
      courier: { select: { name: true, code: true } },
      payments: { select: { amount: true, method: true, status: true, paidAt: true } },
    },
  });

  const format = options.format || 'json';

  if (format === 'csv') {
    // Generate CSV
    const headers = [
      'Order Number',
      'Tracking Code',
      'Customer Name',
      'Customer Phone',
      'Status',
      'Storage Days',
      'Storage Fee',
      'Device',
      'Box Number',
      'Courier',
      'Created At',
      'Pickup At',
    ];

    const rows = orders.map(order => [
      order.orderNumber,
      order.trackingCode,
      order.customerName,
      order.customerPhone,
      order.status,
      order.storageDays,
      order.storageFee,
      order.device?.name || '',
      order.boxNumber || '',
      order.courier?.name || '',
      order.createdAt.toISOString(),
      order.pickUpAt?.toISOString() || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="orders-export-${Date.now()}.csv"`,
      },
    });
  }

  // Default to JSON
  return NextResponse.json({
    success: true,
    data: orders,
    exportedAt: new Date().toISOString(),
    count: orders.length,
  });
}

// Bulk delete (only PENDING or CANCELLED orders)
async function bulkDelete(orderIds: string[]) {
  // Only allow deletion of pending or cancelled orders
  const orders = await db.order.findMany({
    where: {
      id: { in: orderIds },
      status: { in: ['PENDING', 'CANCELLED'] },
    },
    select: { id: true },
  });

  if (orders.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No orders eligible for deletion (only PENDING or CANCELLED orders can be deleted)',
    }, { status: 400 });
  }

  const idsToDelete = orders.map(o => o.id);

  // Delete related records first
  await db.notification.deleteMany({
    where: { orderId: { in: idsToDelete } },
  });
  
  await db.payment.deleteMany({
    where: { orderId: { in: idsToDelete } },
  });
  
  await db.activity.deleteMany({
    where: { orderId: { in: idsToDelete } },
  });

  // Delete orders
  const result = await db.order.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  return NextResponse.json({
    success: true,
    deleted: result.count,
    requested: orderIds.length,
    skipped: orderIds.length - result.count,
  });
}

// Bulk mark as ready for pickup
async function bulkMarkReady(orderIds: string[]) {
  const result = await db.order.updateMany({
    where: {
      id: { in: orderIds },
      status: 'STORED',
    },
    data: {
      status: 'READY',
      updatedAt: new Date(),
    },
  });

  // Log activity
  await db.activity.create({
    data: {
      action: 'BULK_MARK_READY',
      description: `Marked ${result.count} orders as ready for pickup`,
      metadata: JSON.stringify({ orderIds }),
    },
  });

  return NextResponse.json({
    success: true,
    updated: result.count,
    message: `${result.count} orders marked as ready for pickup`,
  });
}

// Bulk calculate/update storage fees
async function bulkCalculateFees(orderIds: string[]) {
  const orders = await db.order.findMany({
    where: {
      id: { in: orderIds },
      status: { in: ['STORED', 'READY'] },
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      storageDays: true,
      storageFee: true,
    },
  });

  const updates = [];
  const freeDays = 3;
  const baseFee = 100;

  for (const order of orders) {
    const daysStored = Math.floor(
      (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    let fee = 0;
    if (daysStored > freeDays) {
      const chargeableDays = daysStored - freeDays;
      
      if (chargeableDays <= 7) {
        fee = chargeableDays * baseFee;
      } else if (chargeableDays <= 14) {
        fee = (7 * baseFee) + ((chargeableDays - 7) * baseFee * 1.5);
      } else {
        fee = (7 * baseFee) + (7 * baseFee * 1.5) + ((chargeableDays - 14) * baseFee * 2);
      }
    }

    if (fee !== order.storageFee) {
      updates.push(
        db.order.update({
          where: { id: order.id },
          data: {
            storageDays: daysStored,
            storageFee: Math.round(fee),
          },
        })
      );
    }
  }

  await Promise.all(updates);

  return NextResponse.json({
    success: true,
    updated: updates.length,
    total: orders.length,
    message: `Updated fees for ${updates.length} orders`,
  });
}
