import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Courier partners with their rates
const COURIER_PARTNERS = [
  { id: 'knutsford', name: 'Knutsford Express', baseRate: 500, zones: ['Kingston', 'Montego Bay', 'Ocho Rios'] },
  { id: 'zipmail', name: 'ZipMail', baseRate: 400, zones: ['Kingston', 'St. Andrew'] },
  { id: 'fedex', name: 'FedEx Jamaica', baseRate: 800, zones: ['Nationwide'] },
  { id: 'dhl', name: 'DHL Express', baseRate: 1000, zones: ['Nationwide', 'International'] },
];

// POST /api/delivery - Request delivery or get quote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'quote': {
        const { orderId, deliveryAddress, courierId } = body;
        
        if (!orderId) {
          return NextResponse.json({
            success: false,
            error: 'Order ID is required',
          }, { status: 400 });
        }

        // Get order details
        const order = await db.order.findUnique({
          where: { id: orderId },
        });

        if (!order) {
          return NextResponse.json({
            success: false,
            error: 'Order not found',
          }, { status: 404 });
        }

        // Calculate delivery fee
        let selectedCourier = COURIER_PARTNERS.find(c => c.id === courierId);
        if (!selectedCourier) {
          selectedCourier = COURIER_PARTNERS[0]; // Default to Knutsford
        }

        const baseRate = selectedCourier.baseRate;
        const storageFee = order.storageFee;
        const totalFee = baseRate + storageFee;

        return NextResponse.json({
          success: true,
          data: {
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              trackingCode: order.trackingCode,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              storageFee,
            },
            courier: selectedCourier,
            deliveryFee: baseRate,
            storageFee,
            totalFee,
            estimatedDelivery: '1-2 business days',
            note: 'Customer is responsible for delivery fees payable in advance.',
          },
        });
      }

      case 'request': {
        const { orderId, courierId, deliveryAddress, customerPhone, customerName, notes } = body;

        if (!orderId || !courierId || !deliveryAddress) {
          return NextResponse.json({
            success: false,
            error: 'Order ID, courier ID, and delivery address are required',
          }, { status: 400 });
        }

        // Get order
        const order = await db.order.findUnique({
          where: { id: orderId },
        });

        if (!order) {
          return NextResponse.json({
            success: false,
            error: 'Order not found',
          }, { status: 404 });
        }

        const selectedCourier = COURIER_PARTNERS.find(c => c.id === courierId);
        if (!selectedCourier) {
          return NextResponse.json({
            success: false,
            error: 'Invalid courier',
          }, { status: 400 });
        }

        // Create delivery record (using activity log)
        await db.activity.create({
          data: {
            orderId: order.id,
            action: 'DELIVERY_REQUESTED',
            description: `Delivery requested via ${selectedCourier.name} to ${deliveryAddress}`,
            metadata: JSON.stringify({
              courierId,
              courierName: selectedCourier.name,
              deliveryAddress,
              notes,
              deliveryFee: selectedCourier.baseRate,
            }),
          },
        });

        // Update order status
        await db.order.update({
          where: { id: orderId },
          data: {
            status: 'STORED', // Keep as stored until actually delivered
            notes: `Delivery requested via ${selectedCourier.name}. Address: ${deliveryAddress}`,
          },
        });

        return NextResponse.json({
          success: true,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            courier: selectedCourier.name,
            deliveryAddress,
            deliveryFee: selectedCourier.baseRate,
            estimatedDelivery: '1-2 business days',
            message: 'Delivery request submitted. Customer will be notified.',
          },
        });
      }

      case 'confirm': {
        const { orderId, trackingNumber } = body;

        if (!orderId) {
          return NextResponse.json({
            success: false,
            error: 'Order ID is required',
          }, { status: 400 });
        }

        // Update order
        const order = await db.order.update({
          where: { id: orderId },
          data: {
            status: 'PICKED_UP',
            pickUpAt: new Date(),
            notes: `Delivered via courier. Tracking: ${trackingNumber || 'N/A'}`,
          },
        });

        // Log activity
        await db.activity.create({
          data: {
            orderId: order.id,
            action: 'DELIVERY_CONFIRMED',
            description: `Delivery confirmed. Package handed to courier.`,
            metadata: JSON.stringify({ trackingNumber }),
          },
        });

        return NextResponse.json({
          success: true,
          data: order,
          message: 'Delivery confirmed successfully',
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: quote, request, confirm',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Delivery API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET /api/delivery - Get courier partners or delivery history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'couriers':
        return NextResponse.json({
          success: true,
          data: COURIER_PARTNERS,
        });

      case 'pending':
        // Get orders with delivery requests but not yet confirmed
        const pendingDeliveries = await db.activity.findMany({
          where: {
            action: 'DELIVERY_REQUESTED',
          },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                trackingCode: true,
                customerName: true,
                customerPhone: true,
                storageFee: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
          success: true,
          data: pendingDeliveries,
        });

      default:
        return NextResponse.json({
          success: true,
          data: COURIER_PARTNERS,
        });
    }
  } catch (error) {
    console.error('Delivery API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
