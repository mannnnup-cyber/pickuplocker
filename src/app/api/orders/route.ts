import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOrderNumber, generateTrackingCode, calculateStorageFee } from '@/lib/storage';
import { openBoxWithCredentials, getBoxListWithCredentials, getCredentialsForDevice, type BestwondCredentials } from '@/lib/bestwond';
import { sendPickupNotification } from '@/lib/textbee';

// GET /api/orders - List orders with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const trackingCode = searchParams.get('trackingCode');

    // Quick lookup by tracking code
    if (trackingCode) {
      const order = await db.order.findUnique({
        where: { trackingCode },
        include: { 
          device: true, 
          box: true,
          courier: true,
          payments: true,
        },
      });
      
      if (!order) {
        return NextResponse.json({ success: false, error: 'Invalid pickup code' }, { status: 404 });
      }
      
      // Calculate current storage days and fee
      const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
      const now = new Date();
      const storageDays = Math.floor((now.getTime() - new Date(storageStart).getTime()) / (1000 * 60 * 60 * 24));
      const storageFee = calculateStorageFee(storageDays);
      
      return NextResponse.json({ 
        success: true, 
        data: { 
          ...order, 
          currentStorageDays: storageDays,
          currentStorageFee: storageFee,
        } 
      });
    }

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { trackingCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orders = await db.order.findMany({
      where,
      include: { device: true, box: true, courier: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST /api/orders - Create new drop-off order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      customerName, 
      customerPhone, 
      customerEmail, 
      deviceId, // Device ID from database (cuid)
      deviceApiKey, // Bestwond device ID (e.g., "2100012858")
      courierId, // Optional: Courier ID for prepaid accounts
      courierName, // Display name
      courierTracking,
      packageSize,
      packageDescription,
      notes,
      sendSms = true, // Whether to send SMS notification
    } = body;

    // Validate required fields
    if (!customerName || !customerPhone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer name and phone are required' 
      }, { status: 400 });
    }

    // Clean phone number
    const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');

    // Find or create customer
    let customer = await db.user.findFirst({
      where: { 
        OR: [
          { phone: cleanPhone },
          { email: customerEmail },
        ].filter(Boolean) 
      },
    });

    if (!customer) {
      // Auto-create customer account
      customer = await db.user.create({
        data: {
          name: customerName,
          phone: cleanPhone,
          email: customerEmail || `${cleanPhone}@pickup.local`, // Placeholder email
          role: 'CUSTOMER',
        },
      });
    } else {
      // Update customer info if provided
      if (customerName && customer.name !== customerName) {
        await db.user.update({
          where: { id: customer.id },
          data: { name: customerName },
        });
      }
    }

    // Find an available box
    let box = null;
    let device = null;

    if (deviceId) {
      // Find box in specified device
      device = await db.device.findUnique({ where: { id: deviceId } });
      if (!device) {
        return NextResponse.json({ success: false, error: 'Selected device not found' }, { status: 400 });
      }
      
      box = await db.box.findFirst({
        where: { deviceId: device.id, status: 'AVAILABLE' },
        orderBy: { boxNumber: 'asc' },
      });
    } else {
      // Find any available box across all devices
      box = await db.box.findFirst({
        where: { status: 'AVAILABLE' },
        include: { device: true },
        orderBy: { boxNumber: 'asc' },
      });
      
      if (box) {
        device = box.device;
      }
    }

    if (!box || !device) {
      // Check all devices for availability
      const devices = await db.device.findMany({
        include: { 
          boxes: { 
            where: { status: 'AVAILABLE' },
            take: 1,
          } 
        },
      });
      
      const availableDevices = devices.filter(d => d.boxes.length > 0);
      
      if (availableDevices.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: 'No available boxes. All lockers are full.',
          suggestion: 'Please try again later or contact support.',
        }, { status: 400 });
      }
      
      // Suggest alternative locations
      const suggestions = availableDevices.map(d => ({
        deviceId: d.id,
        deviceName: d.name,
        location: d.location,
        availableBoxes: d.availableBoxes,
      }));
      
      return NextResponse.json({ 
        success: false, 
        error: 'Selected locker has no available boxes',
        suggestions,
      }, { status: 400 });
    }

    // Generate order numbers
    const orderNumber = generateOrderNumber();
    const trackingCode = generateTrackingCode();

    // Handle courier prepaid account
    let courier = null;
    if (courierId) {
      courier = await db.courier.findUnique({ where: { id: courierId } });
      if (!courier) {
        return NextResponse.json({ success: false, error: 'Invalid courier account' }, { status: 400 });
      }
      if (courier.status !== 'ACTIVE') {
        return NextResponse.json({ success: false, error: 'Courier account is not active' }, { status: 400 });
      }
    }

    // Create the order
    const order = await db.order.create({
      data: {
        orderNumber,
        trackingCode,
        customerId: customer.id,
        customerName,
        customerPhone: cleanPhone,
        customerEmail: customerEmail || customer.email,
        deviceId: device.id,
        boxId: box.id,
        boxNumber: box.boxNumber,
        courierId: courier?.id,
        courierName: courier?.name || courierName,
        courierTracking,
        packageSize,
        packageDescription,
        notes,
        status: 'PENDING', // Will change to STORED when box is opened
        storageStartAt: new Date(),
      },
      include: { device: true, box: true, courier: true },
    });

    // Mark box as reserved
    await db.box.update({
      where: { id: box.id },
      data: { status: 'RESERVED' },
    });

    // Update device available count
    await db.device.update({
      where: { id: device.id },
      data: { availableBoxes: { decrement: 1 } },
    });

    // Create activity log
    await db.activity.create({
      data: {
        userId: customer.id,
        action: 'ORDER_CREATED',
        description: `Order ${orderNumber} created for box #${box.boxNumber} at ${device.name}`,
        orderId: order.id,
      },
    });

    // Return order with box opening info (staff will click to open)
    const bestwondDeviceId = device.deviceId; // This is the Bestwond device ID stored in DB

    return NextResponse.json({ 
      success: true, 
      data: {
        ...order,
        bestwondDeviceId,
        boxNumber: box.boxNumber,
        requiresBoxOpen: true, // Staff needs to open box
      },
      message: `Order created. Click "Open Box" to place package in box #${box.boxNumber}`,
    });

  } catch (error) {
    console.error('Failed to create order:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create order' 
    }, { status: 500 });
  }
}

// PUT /api/orders - Update order (confirm drop-off, process pickup, etc.)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action, 
      orderId, 
      trackingCode,
      staffId,
      paymentMethod,
      paymentAmount,
    } = body;

    // Find order by ID or tracking code
    let order = null;
    if (orderId) {
      order = await db.order.findUnique({ 
        where: { id: orderId },
        include: { device: true, box: true, courier: true },
      });
    } else if (trackingCode) {
      order = await db.order.findUnique({ 
        where: { trackingCode },
        include: { device: true, box: true, courier: true },
      });
    }

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Handle different actions
    if (action === 'confirm_dropoff') {
      // Staff confirms package placed in box
      if (order.status !== 'PENDING') {
        return NextResponse.json({ 
          success: false, 
          error: `Cannot confirm drop-off. Order status is ${order.status}` 
        }, { status: 400 });
      }

      await db.order.update({
        where: { id: order.id },
        data: { 
          status: 'STORED',
          dropOffAt: new Date(),
          dropOffBy: staffId,
        },
      });

      // Mark box as occupied
      if (order.boxId) {
        await db.box.update({
          where: { id: order.boxId },
          data: { status: 'OCCUPIED', lastUsedAt: new Date() },
        });
      }

      // Update courier stats if applicable
      if (order.courierId) {
        await db.courier.update({
          where: { id: order.courierId },
          data: { 
            totalDropOffs: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
      }

      // Send SMS notification to customer
      try {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 3); // 3 days free storage
        
        await sendPickupNotification(
          order.customerPhone,
          order.customerName,
          order.trackingCode,
          order.device?.location || 'Pickup Locker',
          expiryDate.toLocaleDateString()
        );
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError);
        // Don't fail the whole operation if SMS fails
      }

      await db.activity.create({
        data: {
          userId: staffId,
          action: 'DROP_OFF_CONFIRMED',
          description: `Package stored in box #${order.boxNumber}`,
          orderId: order.id,
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Drop-off confirmed. SMS sent to customer.',
      });
    }

    if (action === 'open_box') {
      // Open the box for this order (for drop-off or pickup)
      if (!order.device || !order.boxNumber) {
        return NextResponse.json({ 
          success: false, 
          error: 'Order has no box assigned' 
        }, { status: 400 });
      }

      // Get device-specific credentials
      const credentials = await getCredentialsForDevice(order.device.id);
      
      const result = await openBoxWithCredentials(order.device.deviceId, order.boxNumber, credentials);
      
      // Bestwond returns code 0 for success (not 200)
      if (result.code === 0) {
        await db.activity.create({
          data: {
            userId: staffId,
            action: 'BOX_OPENED',
            description: `Box #${order.boxNumber} opened for order ${order.orderNumber}`,
            orderId: order.id,
          },
        });

        return NextResponse.json({ 
          success: true, 
          message: `Box #${order.boxNumber} opened`,
        });
      } else {
        return NextResponse.json({ 
          success: false, 
          error: result.msg || 'Failed to open box',
        }, { status: 400 });
      }
    }

    if (action === 'confirm_pickup') {
      // Customer picked up package
      if (!['STORED', 'READY'].includes(order.status)) {
        return NextResponse.json({ 
          success: false, 
          error: `Cannot pickup. Order status is ${order.status}` 
        }, { status: 400 });
      }

      // Calculate storage fee
      const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
      const storageDays = Math.floor((new Date().getTime() - new Date(storageStart).getTime()) / (1000 * 60 * 60 * 24));
      const storageFee = calculateStorageFee(storageDays);

      // If there's a fee and no payment, require payment first
      if (storageFee > 0 && !paymentMethod) {
        return NextResponse.json({ 
          success: false, 
          error: 'Payment required',
          requiresPayment: true,
          storageDays,
          storageFee,
        }, { status: 402 });
      }

      // Process payment if needed
      if (storageFee > 0 && paymentMethod) {
        await db.payment.create({
          data: {
            orderId: order.id,
            userId: order.customerId,
            amount: paymentAmount || storageFee,
            method: paymentMethod,
            status: 'COMPLETED',
            paidAt: new Date(),
          },
        });

        // If courier account, deduct from balance
        if (order.courierId) {
          await db.courier.update({
            where: { id: order.courierId },
            data: { 
              balance: { decrement: storageFee },
              totalSpent: { increment: storageFee },
            },
          });
        }
      }

      // Update order
      await db.order.update({
        where: { id: order.id },
        data: { 
          status: 'PICKED_UP',
          pickUpAt: new Date(),
          pickUpBy: staffId,
          storageDays,
          storageFee,
        },
      });

      // Mark box as available
      if (order.boxId) {
        await db.box.update({
          where: { id: order.boxId },
          data: { status: 'AVAILABLE' },
        });
      }

      // Update device available count
      if (order.deviceId) {
        await db.device.update({
          where: { id: order.deviceId },
          data: { availableBoxes: { increment: 1 } },
        });
      }

      await db.activity.create({
        data: {
          userId: staffId || order.customerId,
          action: 'PACKAGE_PICKED_UP',
          description: `Package picked up after ${storageDays} days. Fee: JMD $${storageFee}`,
          orderId: order.id,
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Pickup confirmed',
        storageDays,
        storageFee,
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action. Use: confirm_dropoff, open_box, confirm_pickup' 
    }, { status: 400 });

  } catch (error) {
    console.error('Failed to update order:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update order' 
    }, { status: 500 });
  }
}
