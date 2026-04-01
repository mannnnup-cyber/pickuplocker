import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSMS } from '@/lib/textbee';

// Generate random 4-digit temp PIN
function generateTempPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// GET /api/couriers - List all couriers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const couriers = await db.courier.findMany({
      where,
      include: {
        _count: {
          select: { orders: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Add PIN status to each courier
    const couriersWithPinStatus = couriers.map(courier => ({
      ...courier,
      hasPin: !!courier.pin,
      hasTempPin: !!courier.tempPin,
    }));

    return NextResponse.json({ success: true, data: couriersWithPinStatus });
  } catch (error) {
    console.error('Failed to fetch couriers:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch couriers' 
    }, { status: 500 });
  }
}

// POST /api/couriers - Create new courier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      code, 
      contactPerson, 
      phone, 
      email, 
      address,
      creditLimit,
      autoReload,
      autoReloadAmount,
      minBalance,
      generateTempPin: shouldGenerateTempPin,
    } = body;

    if (!name || !code) {
      return NextResponse.json({ 
        success: false, 
        error: 'Name and code are required' 
      }, { status: 400 });
    }

    // Check for duplicate name or code
    const existing = await db.courier.findFirst({
      where: {
        OR: [
          { name: name },
          { code: code.toUpperCase() },
        ]
      }
    });

    if (existing) {
      return NextResponse.json({ 
        success: false, 
        error: 'Courier with this name or code already exists' 
      }, { status: 400 });
    }

    // Generate temp PIN if requested
    let tempPin: string | undefined;
    if (shouldGenerateTempPin && phone) {
      tempPin = generateTempPin();
    }

    const courier = await db.courier.create({
      data: {
        name,
        code: code.toUpperCase(),
        contactPerson,
        phone,
        email,
        address,
        creditLimit: creditLimit || 0,
        autoReload: autoReload || false,
        autoReloadAmount,
        minBalance,
        tempPin,
      },
    });

    // Send temp PIN via SMS if generated
    if (tempPin && phone) {
      try {
        const message = `Welcome to Pickup! Your temporary login PIN is ${tempPin}. Use this to set your permanent PIN at pickuplocker.vercel.app/courier/pin?courierId=${courier.id}`;
        await sendSMS(phone, message);
      } catch (smsError) {
        console.error('Failed to send temp PIN SMS:', smsError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        ...courier,
        tempPin, // Return temp PIN so admin can share it
      }
    });
  } catch (error) {
    console.error('Failed to create courier:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create courier' 
    }, { status: 500 });
  }
}

// PUT /api/couriers - Update courier (add balance, edit details, etc.)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      id, 
      action,
      amount,
      status,
      creditLimit,
      autoReload,
      autoReloadAmount,
      minBalance,
      // Edit fields
      name,
      code,
      contactPerson,
      phone,
      email,
      address,
    } = body;

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Courier ID is required' 
      }, { status: 400 });
    }

    const courier = await db.courier.findUnique({ where: { id } });
    if (!courier) {
      return NextResponse.json({ 
        success: false, 
        error: 'Courier not found' 
      }, { status: 404 });
    }

    if (action === 'add_balance') {
      // Add funds to prepaid account
      if (!amount || amount <= 0) {
        return NextResponse.json({ 
          success: false, 
          error: 'Valid amount is required' 
        }, { status: 400 });
      }

      const newBalance = courier.balance + amount;

      // Update courier balance and create transaction record
      const [updated, transaction] = await db.$transaction([
        db.courier.update({
          where: { id },
          data: {
            balance: newBalance,
            totalSpent: { increment: 0 }, // Track activity
            lastActivityAt: new Date(),
          },
        }),
        db.courierTransaction.create({
          data: {
            courierId: id,
            type: 'TOP_UP',
            amount: amount,
            balanceAfter: newBalance,
            description: `Cash top-up via admin dashboard`,
          },
        }),
      ]);

      return NextResponse.json({ 
        success: true, 
        data: updated,
        transaction: transaction,
        message: `Added JMD $${amount} to ${courier.name} account`,
      });
    }

    if (action === 'edit') {
      // Check for duplicate name or code (excluding current courier)
      if (name || code) {
        const existing = await db.courier.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              { OR: [
                { name: name || courier.name },
                { code: code?.toUpperCase() || courier.code },
              ]}
            ]
          }
        });

        if (existing) {
          return NextResponse.json({ 
            success: false, 
            error: 'Courier with this name or code already exists' 
          }, { status: 400 });
        }
      }

      const updated = await db.courier.update({
        where: { id },
        data: {
          name: name || courier.name,
          code: code ? code.toUpperCase() : courier.code,
          contactPerson: contactPerson !== undefined ? contactPerson : courier.contactPerson,
          phone: phone !== undefined ? phone : courier.phone,
          email: email !== undefined ? email : courier.email,
          address: address !== undefined ? address : courier.address,
        },
      });

      return NextResponse.json({ 
        success: true, 
        data: updated,
        message: 'Courier updated successfully',
      });
    }

    if (action === 'update_settings') {
      const updated = await db.courier.update({
        where: { id },
        data: {
          status: status || courier.status,
          creditLimit: creditLimit ?? courier.creditLimit,
          autoReload: autoReload ?? courier.autoReload,
          autoReloadAmount: autoReloadAmount ?? courier.autoReloadAmount,
          minBalance: minBalance ?? courier.minBalance,
        },
      });

      return NextResponse.json({ 
        success: true, 
        data: updated,
      });
    }

    if (action === 'regenerate_temp_pin') {
      // Generate new temp PIN
      const newTempPin = generateTempPin();
      
      const updated = await db.courier.update({
        where: { id },
        data: {
          tempPin: newTempPin,
          pinResetExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      // Send new temp PIN via SMS
      if (courier.phone) {
        try {
          const message = `Your new temporary PIN is ${newTempPin}. Use this to set your permanent PIN at pickuplocker.vercel.app/courier/pin?courierId=${id}`;
          await sendSMS(courier.phone, message);
        } catch (smsError) {
          console.error('Failed to send temp PIN SMS:', smsError);
        }
      }

      return NextResponse.json({ 
        success: true, 
        data: updated,
        tempPin: newTempPin,
        message: 'Temporary PIN regenerated and sent via SMS',
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action. Use: add_balance, edit, update_settings, regenerate_temp_pin' 
    }, { status: 400 });

  } catch (error) {
    console.error('Failed to update courier:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update courier' 
    }, { status: 500 });
  }
}

// DELETE /api/couriers - Delete a courier
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Courier ID is required' 
      }, { status: 400 });
    }

    const courier = await db.courier.findUnique({ 
      where: { id },
      include: { _count: { select: { orders: true } } }
    });

    if (!courier) {
      return NextResponse.json({ 
        success: false, 
        error: 'Courier not found' 
      }, { status: 404 });
    }

    // Check if courier has orders
    if (courier._count.orders > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `Cannot delete courier with ${courier._count.orders} orders. Suspend instead.` 
      }, { status: 400 });
    }

    await db.courier.delete({ where: { id } });

    return NextResponse.json({ 
      success: true, 
      message: 'Courier deleted successfully' 
    });
  } catch (error) {
    console.error('Failed to delete courier:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete courier' 
    }, { status: 500 });
  }
}
