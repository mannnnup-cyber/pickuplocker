import { NextRequest, NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';
import { createSDKPayment } from '@/lib/dimepay';
import { db } from '@/lib/db';
import { sendEmail, isEmailEnabled } from '@/lib/email';

// GET - Retrieve payment data by reference from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.json({
        success: false,
        error: 'Reference is required'
      }, { status: 400 });
    }

    console.log('[SDK Payment API] Looking for payment:', reference);

    // First, check for SDK payment
    const sdkSession = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (sdkSession) {
      console.log('[SDK Payment API] Found SDK payment session');
      const paymentData = JSON.parse(sdkSession.value);

      // Check if payment is expired (1 hour)
      if (Date.now() - paymentData.createdAt > 3600000) {
        await db.setting.delete({
          where: { key: `sdk_payment_${reference}` }
        }).catch(() => {});

        return NextResponse.json({
          success: false,
          error: 'Payment session expired'
        }, { status: 410 });
      }

      return NextResponse.json({
        success: true,
        data: paymentData
      });
    }

    // Check for demo payment
    const demoSession = await db.setting.findUnique({
      where: { key: `demo_payment_${reference}` }
    });

    if (demoSession) {
      console.log('[SDK Payment API] Found demo payment session');
      const paymentData = JSON.parse(demoSession.value);

      return NextResponse.json({
        success: true,
        data: {
          amount: paymentData.amount,
          currency: 'JMD',
          description: `Drop-off Credit - ${paymentData.boxSize} Box (Demo)`,
          reference: reference,
          sdkConfig: null,
          metadata: paymentData,
          isDemo: true,
        }
      });
    }

    console.log('[SDK Payment API] Payment not found');
    return NextResponse.json({
      success: false,
      error: 'Payment not found or expired'
    }, { status: 404 });

  } catch (error) {
    console.error('SDK payment get error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Handle payment completion from DimePay widget callback
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');
    const body = await request.json();
    const { status } = body;

    if (!reference) {
      return NextResponse.json({
        success: false,
        error: 'Reference is required'
      }, { status: 400 });
    }

    console.log('[SDK Payment API] POST - Payment callback for:', reference, 'status:', status);

    // Find the payment session
    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (!sessionSetting) {
      console.log('[SDK Payment API] Payment session not found');
      return NextResponse.json({
        success: false,
        error: 'Payment session not found'
      }, { status: 404 });
    }

    const paymentData = JSON.parse(sessionSetting.value);

    // Only process if payment was pending
    if (paymentData.status === 'COMPLETED') {
      console.log('[SDK Payment API] Payment already completed');
      return NextResponse.json({
        success: true,
        message: 'Payment already completed'
      });
    }

    // Update payment status
    if (status === 'completed') {
      paymentData.status = 'COMPLETED';
      paymentData.completedAt = Date.now();

      await db.setting.update({
        where: { key: `sdk_payment_${reference}` },
        data: { value: JSON.stringify(paymentData) }
      });

      console.log('[SDK Payment API] Payment marked as completed');

      // Send email confirmation if email provided
      const customerEmail = paymentData.metadata?.customerEmail;
      if (customerEmail) {
        try {
          const emailEnabled = await isEmailEnabled();
          if (emailEnabled) {
            const saveCode = paymentData.metadata?.saveCode;
            const boxSize = paymentData.metadata?.boxSize;
            const amount = paymentData.amount;

            await sendEmail(
              customerEmail,
              'Your Pickup Jamaica Drop-off Code',
              `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #111111; padding: 20px; text-align: center;">
                  <h1 style="color: #FFD439; margin: 0;">PICK<span style="color: white;">UP</span></h1>
                  <p style="color: #999; margin: 5px 0 0 0;">Smart Locker System</p>
                </div>
                <div style="padding: 30px; background: #f9f9f9;">
                  <h2 style="color: #111;">Payment Confirmed!</h2>
                  <p style="font-size: 16px; color: #333;">Your drop-off payment of <strong>JMD $${amount}</strong> has been received.</p>
                  
                  <div style="background: #FFD439; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                    <p style="margin: 0; color: #666; font-size: 14px;">Your Save Code</p>
                    <p style="font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${saveCode}</p>
                  </div>
                  
                  <p style="font-size: 14px; color: #666;">
                    <strong>How to use:</strong><br>
                    1. Go to any Pickup locker<br>
                    2. Select "DROP-OFF"<br>
                    3. Enter your 6-digit save code<br>
                    4. Place your package in the opened locker<br>
                    5. Close the door
                  </p>
                </div>
              </div>
              `,
              `Pickup Jamaica: Your drop-off payment is confirmed. Your save code is ${saveCode}. Use this code at the locker to store your package.`
            );
            console.log('[SDK Payment API] Email sent to:', customerEmail);
          }
        } catch (emailError) {
          console.error('[SDK Payment API] Failed to send email:', emailError);
        }
      }

      // Update customer record if needed
      const customerPhone = paymentData.metadata?.customerPhone;
      if (customerPhone && customerEmail) {
        try {
          const existingCustomer = await db.user.findFirst({
            where: { phone: customerPhone }
          });

          if (existingCustomer && existingCustomer.email.includes('@pickup.local')) {
            await db.user.update({
              where: { id: existingCustomer.id },
              data: { email: customerEmail }
            });
            console.log('[SDK Payment API] Updated customer email');
          }
        } catch (customerError) {
          console.error('[SDK Payment API] Failed to update customer:', customerError);
        }
      }

      // Log activity
      await db.activity.create({
        data: {
          action: 'DROPOFF_CREDIT_PAYMENT',
          description: `Drop-off credit payment of JMD $${paymentData.amount} completed via DimePay`,
          metadata: JSON.stringify({
            paymentReference: reference,
            saveCode: paymentData.metadata?.saveCode,
            boxSize: paymentData.metadata?.boxSize,
            customerPhone,
            customerEmail,
          }),
        },
      }).catch(err => console.error('[SDK Payment API] Failed to log activity:', err));

      // Create Payment record for dashboard visibility
      try {
        const customerId = paymentData.metadata?.customerId;
        await db.payment.create({
          data: {
            userId: customerId || null,
            amount: paymentData.amount,
            method: 'ONLINE',
            status: 'COMPLETED',
            gatewayRef: reference,
            gatewayResponse: JSON.stringify({
              type: 'dropoff_credit',
              saveCode: paymentData.metadata?.saveCode,
              pickCode: paymentData.metadata?.pickCode,
              boxSize: paymentData.metadata?.boxSize,
              customerPhone,
              customerEmail,
            }),
            paidAt: new Date(),
          },
        });
        console.log('[SDK Payment API] Payment record created for dashboard');
      } catch (paymentError) {
        console.error('[SDK Payment API] Failed to create payment record:', paymentError);
      }

      // Log email activity
      if (customerEmail) {
        await db.activity.create({
          data: {
            action: 'EMAIL_SENT',
            description: `Drop-off confirmation email sent to ${customerEmail}`,
            metadata: JSON.stringify({
              to: customerEmail,
              subject: 'Your Pickup Jamaica Drop-off Code',
              saveCode: paymentData.metadata?.saveCode,
            }),
          },
        }).catch(err => console.error('[SDK Payment API] Failed to log email activity:', err));
      }
    } else if (status === 'failed') {
      paymentData.status = 'FAILED';
      await db.setting.update({
        where: { key: `sdk_payment_${reference}` },
        data: { value: JSON.stringify(paymentData) }
      });
      console.log('[SDK Payment API] Payment marked as failed');
    }

    return NextResponse.json({
      success: true,
      message: 'Payment status updated',
      status: paymentData.status
    });

  } catch (error) {
    console.error('SDK payment post error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT - Update payment status (for webhook completion)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, status } = body;

    if (!reference) {
      return NextResponse.json({
        success: false,
        error: 'Reference is required'
      }, { status: 400 });
    }

    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${reference}` }
    });

    if (!sessionSetting) {
      return NextResponse.json({
        success: false,
        error: 'Payment session not found'
      }, { status: 404 });
    }

    const paymentData = JSON.parse(sessionSetting.value);
    paymentData.status = status || 'COMPLETED';
    paymentData.completedAt = Date.now();

    await db.setting.update({
      where: { key: `sdk_payment_${reference}` },
      data: {
        value: JSON.stringify(paymentData)
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Payment status updated'
    });
  } catch (error) {
    console.error('SDK payment update error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
