import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { sendSMS } from '@/lib/textbee';

/**
 * Courier PIN Management API
 * 
 * POST - Set/Change PIN (after verification)
 * PUT - Request PIN reset (sends temp PIN via SMS)
 */

// Hash PIN for storage
function hashPin(pin: string, phone: string): string {
  return crypto
    .createHmac('sha256', process.env.NEXTAUTH_SECRET || 'pickup-secret-key')
    .update(`${phone}:${pin}`)
    .digest('hex');
}

// Generate random 4-digit temp PIN
function generateTempPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// POST - Set or Change PIN
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courierId, tempPin, newPin, confirmPin, currentPin } = body;

    console.log('[Courier PIN] Set PIN request for courier:', courierId);

    // Validate courier ID
    if (!courierId) {
      return NextResponse.json({
        success: false,
        error: 'Courier ID is required'
      }, { status: 400 });
    }

    // Validate new PIN
    if (!newPin || !confirmPin) {
      return NextResponse.json({
        success: false,
        error: 'New PIN and confirmation are required'
      }, { status: 400 });
    }

    if (newPin !== confirmPin) {
      return NextResponse.json({
        success: false,
        error: 'PINs do not match'
      }, { status: 400 });
    }

    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json({
        success: false,
        error: 'PIN must be exactly 4 digits'
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

    // Check for phone number
    if (!courier.phone) {
      return NextResponse.json({
        success: false,
        error: 'Courier has no phone number. Contact admin.'
      }, { status: 400 });
    }

    // Determine verification method
    if (courier.pin) {
      // Has existing PIN - require current PIN
      if (!currentPin) {
        return NextResponse.json({
          success: false,
          error: 'Current PIN is required to change PIN'
        }, { status: 400 });
      }

      const hashedCurrentPin = hashPin(currentPin, courier.phone);
      if (hashedCurrentPin !== courier.pin) {
        return NextResponse.json({
          success: false,
          error: 'Current PIN is incorrect'
        }, { status: 401 });
      }
    } else if (courier.tempPin) {
      // First-time setup - require temp PIN
      if (!tempPin) {
        return NextResponse.json({
          success: false,
          error: 'Temporary PIN is required for first-time setup'
        }, { status: 400 });
      }

      if (tempPin !== courier.tempPin) {
        return NextResponse.json({
          success: false,
          error: 'Temporary PIN is incorrect'
        }, { status: 401 });
      }
    } else {
      // No PIN and no temp PIN - admin needs to set temp PIN
      return NextResponse.json({
        success: false,
        error: 'No PIN setup available. Please contact admin.'
      }, { status: 400 });
    }

    // Hash and save new PIN
    const hashedNewPin = hashPin(newPin, courier.phone);

    await db.courier.update({
      where: { id: courierId },
      data: {
        pin: hashedNewPin,
        pinSetAt: new Date(),
        tempPin: null // Clear temp PIN
      }
    });

    console.log('[Courier PIN] PIN set successfully for:', courier.name);

    return NextResponse.json({
      success: true,
      message: 'PIN set successfully. You can now login at the kiosk.'
    });

  } catch (error) {
    console.error('[Courier PIN] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to set PIN. Please try again.'
    }, { status: 500 });
  }
}

// PUT - Request PIN reset (sends temp PIN via SMS)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, adminInitiated, courierId } = body;

    console.log('[Courier PIN] Reset request for phone:', phone, 'admin:', adminInitiated);

    // Find courier
    let courier;
    if (courierId) {
      courier = await db.courier.findUnique({
        where: { id: courierId }
      });
    } else if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      courier = await db.courier.findUnique({
        where: { phone: cleanPhone }
      });
    }

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: 'Courier not found'
      }, { status: 404 });
    }

    if (!courier.phone) {
      return NextResponse.json({
        success: false,
        error: 'Courier has no phone number on file'
      }, { status: 400 });
    }

    // Generate temp PIN
    const tempPin = generateTempPin();

    // Save temp PIN
    await db.courier.update({
      where: { id: courier.id },
      data: {
        tempPin,
        pinResetExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    // Send SMS
    const message = adminInitiated
      ? `Your temporary PIN is ${tempPin}. Use this to set your permanent PIN at pickuplocker.vercel.app/courier/pin or at the kiosk. Valid for 24 hours.`
      : `Your PIN reset request. Temporary PIN: ${tempPin}. Use this to set your new PIN. Valid for 24 hours.`;

    try {
      await sendSMS(courier.phone, message);
      console.log('[Courier PIN] SMS sent to:', courier.phone);
    } catch (smsError) {
      console.error('[Courier PIN] SMS failed:', smsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to send SMS. Please try again or contact admin.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Temporary PIN sent to ${courier.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`,
      courierId: courier.id,
      courierName: courier.name
    });

  } catch (error) {
    console.error('[Courier PIN Reset] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to request PIN reset. Please try again.'
    }, { status: 500 });
  }
}

// GET - Check PIN status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courierId = searchParams.get('courierId');
    const phone = searchParams.get('phone');

    let courier;
    if (courierId) {
      courier = await db.courier.findUnique({
        where: { id: courierId }
      });
    } else if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      courier = await db.courier.findUnique({
        where: { phone: cleanPhone }
      });
    }

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: 'Courier not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      pinStatus: {
        hasPin: !!courier.pin,
        hasTempPin: !!courier.tempPin,
        pinSetAt: courier.pinSetAt,
        phone: courier.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      }
    });

  } catch (error) {
    console.error('[Courier PIN Status] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get PIN status'
    }, { status: 500 });
  }
}
