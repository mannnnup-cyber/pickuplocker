import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

/**
 * Courier Login API
 * 
 * POST - Login with phone + PIN
 * Returns courier data for kiosk session
 */

// Hash PIN for storage
function hashPin(pin: string, phone: string): string {
  return crypto
    .createHmac('sha256', process.env.NEXTAUTH_SECRET || 'pickup-secret-key')
    .update(`${phone}:${pin}`)
    .digest('hex');
}

// Verify PIN
function verifyPin(pin: string, phone: string, hashedPin: string): boolean {
  const hash = hashPin(pin, phone);
  return hash === hashedPin;
}

// POST - Login with phone + PIN
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, pin } = body;

    console.log('[Courier Login] Attempt:', { phone, pinProvided: !!pin });

    // Validate input
    if (!phone || !pin) {
      return NextResponse.json({
        success: false,
        error: 'Phone number and PIN are required'
      }, { status: 400 });
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({
        success: false,
        error: 'PIN must be 4 digits'
      }, { status: 400 });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    // Find courier by phone
    const courier = await db.courier.findFirst({
      where: { 
        OR: [
          { phone: cleanPhone },
          { phone: cleanPhone.replace(/^1/, '') }, // Try without leading 1
          { phone: `1${cleanPhone}` } // Try with leading 1
        ]
      }
    });

    if (!courier) {
      console.log('[Courier Login] Courier not found:', cleanPhone);
      return NextResponse.json({
        success: false,
        error: 'Invalid phone number or PIN'
      }, { status: 401 });
    }

    // Check if courier is active
    if (courier.status !== 'ACTIVE') {
      console.log('[Courier Login] Courier not active:', courier.status);
      return NextResponse.json({
        success: false,
        error: 'Account is suspended or closed. Please contact admin.'
      }, { status: 403 });
    }

    // Check if PIN is set
    if (!courier.pin) {
      // Check if there's a temp PIN for first-time setup
      if (courier.tempPin && courier.tempPin === pin) {
        // First-time login with temp PIN - prompt to set new PIN
        console.log('[Courier Login] First-time login with temp PIN');
        return NextResponse.json({
          success: true,
          requirePinSetup: true,
          courierId: courier.id,
          courierName: courier.name,
          message: 'Please set your permanent PIN'
        });
      }

      return NextResponse.json({
        success: false,
        error: 'PIN not set. Please contact admin to get your temporary PIN.'
      }, { status: 400 });
    }

    // Verify PIN
    if (!courier.phone || !verifyPin(pin, courier.phone, courier.pin)) {
      console.log('[Courier Login] Invalid PIN for:', cleanPhone);
      return NextResponse.json({
        success: false,
        error: 'Invalid phone number or PIN'
      }, { status: 401 });
    }

    // Update last login
    await db.courier.update({
      where: { id: courier.id },
      data: { lastLoginAt: new Date() }
    });

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes

    await db.setting.upsert({
      where: { key: `courier_session_${sessionToken}` },
      create: {
        key: `courier_session_${sessionToken}`,
        value: JSON.stringify({
          courierId: courier.id,
          courierName: courier.name,
          courierPhone: courier.phone,
          balance: courier.balance,
          createdAt: Date.now(),
          expiresAt: sessionExpiry
        })
      },
      update: {
        value: JSON.stringify({
          courierId: courier.id,
          courierName: courier.name,
          courierPhone: courier.phone,
          balance: courier.balance,
          createdAt: Date.now(),
          expiresAt: sessionExpiry
        })
      }
    });

    console.log('[Courier Login] Success:', courier.name);

    return NextResponse.json({
      success: true,
      sessionToken,
      courier: {
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        balance: courier.balance,
        totalDropOffs: courier.totalDropOffs,
        totalSpent: courier.totalSpent
      }
    });

  } catch (error) {
    console.error('[Courier Login] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Login failed. Please try again.'
    }, { status: 500 });
  }
}

// GET - Verify session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('sessionToken');

    if (!sessionToken) {
      return NextResponse.json({
        success: false,
        error: 'Session token required'
      }, { status: 400 });
    }

    // Get session
    const session = await db.setting.findUnique({
      where: { key: `courier_session_${sessionToken}` }
    });

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Invalid session'
      }, { status: 401 });
    }

    const sessionData = JSON.parse(session.value);

    // Check expiry
    if (Date.now() > sessionData.expiresAt) {
      await db.setting.delete({
        where: { key: `courier_session_${sessionToken}` }
      }).catch(() => {});

      return NextResponse.json({
        success: false,
        error: 'Session expired'
      }, { status: 401 });
    }

    // Get fresh balance
    const courier = await db.courier.findUnique({
      where: { id: sessionData.courierId }
    });

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: 'Courier not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      courier: {
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        balance: courier.balance,
        totalDropOffs: courier.totalDropOffs,
        totalSpent: courier.totalSpent
      }
    });

  } catch (error) {
    console.error('[Courier Session] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Session verification failed'
    }, { status: 500 });
  }
}

// DELETE - Logout
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('sessionToken');

    if (sessionToken) {
      await db.setting.delete({
        where: { key: `courier_session_${sessionToken}` }
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Courier Logout] Error:', error);
    return NextResponse.json({ success: true });
  }
}
