import { NextRequest, NextResponse } from 'next/server';
import { generateTrackingCode } from '@/lib/storage';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';
import { getDimepayConfig } from '@/lib/settings';
import { sendSMS } from '@/lib/textbee';
import { sendEmail, isEmailEnabled } from '@/lib/email';
import { db } from '@/lib/db';
import QRCode from 'qrcode';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  'S': 150,
  'M': 200,
  'L': 300,
  'XL': 400,
};

// Generate QR code as data URL
async function generateQRCodeDataUrl(data: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
}

// POST /api/kiosk/payment - Create payment for drop-off credit or check status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, boxSize, phone, email } = body;

    console.log('[Kiosk Payment] POST Request:', { action, boxSize, phone, email });

    // Create drop-off payment
    if (action === 'create_dropoff_payment') {
      return await createDropoffPayment(boxSize, phone, email);
    }

    // Open box immediately after payment (skip code entry)
    if (action === 'open_box_after_payment') {
      const { saveCode, recipientPhone } = body;
      return await openBoxAfterPayment(saveCode, recipientPhone);
    }

    // Create storage fee payment
    if (action === 'create_storage_fee_payment') {
      const { orderId, amount } = body;
      return await createStorageFeePayment(orderId, amount, phone);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: create_dropoff_payment, create_storage_fee_payment',
    }, { status: 400 });

  } catch (error) {
    console.error('Kiosk payment error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment',
    }, { status: 500 });
  }
}

// GET /api/kiosk/payment?paymentId=xxx - Check payment status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    console.log('[Kiosk Payment] GET Request for paymentId:', paymentId);

    if (!paymentId) {
      return NextResponse.json({
        success: false,
        error: 'Payment ID is required',
      }, { status: 400 });
    }

    // Get payment session from database
    const sessionSetting = await db.setting.findUnique({
      where: { key: `sdk_payment_${paymentId}` }
    });

    if (sessionSetting) {
      const paymentData = JSON.parse(sessionSetting.value);
      console.log('[Kiosk Payment] Found SDK payment in database:', paymentId, 'status:', paymentData.status);

      if (paymentData.status === 'COMPLETED') {
        // Send email if not already sent and email exists
        if (paymentData.metadata?.customerEmail && !paymentData.emailSent) {
          try {
            const emailEnabled = await isEmailEnabled();
            if (emailEnabled) {
              await sendEmail(
                paymentData.metadata.customerEmail,
                'Your Pickup Jamaica Drop-off Code',
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #111111; padding: 20px; text-align: center;">
                    <h1 style="color: #FFD439; margin: 0;">PICK<span style="color: white;">UP</span></h1>
                    <p style="color: #999; margin: 5px 0 0 0;">Smart Locker System</p>
                  </div>
                  <div style="padding: 30px; background: #f9f9f9;">
                    <h2 style="color: #111;">Payment Confirmed!</h2>
                    <p style="font-size: 16px; color: #333;">Your drop-off payment has been received.</p>
                    
                    <div style="background: #FFD439; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                      <p style="margin: 0; color: #666; font-size: 14px;">Your Save Code</p>
                      <p style="font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${paymentData.metadata?.saveCode}</p>
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
                `Pickup Jamaica: Your drop-off payment is confirmed. Your save code is ${paymentData.metadata?.saveCode}. Use this code at the locker to store your package.`
              );
              console.log('[Kiosk Payment] Email sent to:', paymentData.metadata.customerEmail);
              
              // Mark email as sent
              await db.setting.update({
                where: { key: `sdk_payment_${paymentId}` },
                data: { value: JSON.stringify({ ...paymentData, emailSent: true }) }
              }).catch(() => {});
            }
          } catch (emailError) {
            console.error('[Kiosk Payment] Failed to send email:', emailError);
          }
        }

        return NextResponse.json({
          success: true,
          status: 'completed',
          saveCode: paymentData.metadata?.saveCode,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
        message: 'Payment pending. Please complete payment on your device.',
      });
    }

    // Check for demo payments (also stored in database now)
    const demoSetting = await db.setting.findUnique({
      where: { key: `demo_payment_${paymentId}` }
    });

    if (demoSetting) {
      const demoData = JSON.parse(demoSetting.value);
      const elapsed = Date.now() - demoData.createdAt;
      console.log('[Kiosk Payment] Demo payment elapsed time:', elapsed, 'ms');

      // Auto-complete after 5 seconds in demo mode
      if (elapsed > 5000) {
        console.log('[Kiosk Payment] Demo payment completed! saveCode:', demoData.saveCode);

        // Send SMS notification
        try {
          await sendSMS(demoData.phone,
            `Pickup Jamaica: Your drop-off payment of JMD $${demoData.amount} is confirmed. Your save code is ${demoData.saveCode}. Use this code at the locker to store your package.`
          );
          console.log('[Kiosk Payment] SMS sent to:', demoData.phone);
        } catch (smsError) {
          console.error('[Kiosk Payment] Failed to send SMS:', smsError);
        }

        // Send email notification if email provided
        if (demoData.email) {
          try {
            const emailEnabled = await isEmailEnabled();
            if (emailEnabled) {
              await sendEmail(
                demoData.email,
                'Your Pickup Jamaica Drop-off Code',
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #111111; padding: 20px; text-align: center;">
                    <h1 style="color: #FFD439; margin: 0;">PICK<span style="color: white;">UP</span></h1>
                    <p style="color: #999; margin: 5px 0 0 0;">Smart Locker System</p>
                  </div>
                  <div style="padding: 30px; background: #f9f9f9;">
                    <h2 style="color: #111;">Payment Confirmed!</h2>
                    <p style="font-size: 16px; color: #333;">Your drop-off payment of <strong>JMD $${demoData.amount}</strong> has been received.</p>
                    
                    <div style="background: #FFD439; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                      <p style="margin: 0; color: #666; font-size: 14px;">Your Save Code</p>
                      <p style="font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${demoData.saveCode}</p>
                    </div>
                    
                    <p style="font-size: 14px; color: #666;">
                      <strong>How to use:</strong><br>
                      1. Go to any Pickup locker<br>
                      2. Select "DROP-OFF"<br>
                      3. Enter your 6-digit save code<br>
                      4. Place your package in the opened locker<br>
                      5. Close the door
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    
                    <p style="font-size: 12px; color: #999;">
                      Box Size: ${demoData.boxSize}<br>
                      Phone: ${demoData.phone}<br>
                      Payment ID: ${paymentId}
                    </p>
                  </div>
                </div>
                `,
                `Pickup Jamaica: Your drop-off payment of JMD $${demoData.amount} is confirmed. Your save code is ${demoData.saveCode}. Use this code at the locker to store your package.`
              );
              console.log('[Kiosk Payment] Email sent to:', demoData.email);
            }
          } catch (emailError) {
            console.error('[Kiosk Payment] Failed to send email:', emailError);
          }
        }

        // Create or update customer record with email
        try {
          const existingCustomer = await db.user.findFirst({
            where: { phone: demoData.phone }
          });

          if (existingCustomer) {
            // Update email if it was placeholder and now we have real email
            if (demoData.email && existingCustomer.email.includes('@pickup.local')) {
              await db.user.update({
                where: { id: existingCustomer.id },
                data: { email: demoData.email }
              });
              console.log('[Kiosk Payment] Updated customer email:', demoData.email);
            }
          } else if (demoData.email) {
            // Create new customer with real email
            await db.user.create({
              data: {
                phone: demoData.phone,
                email: demoData.email,
                name: 'Customer',
                role: 'CUSTOMER',
              }
            });
            console.log('[Kiosk Payment] Created new customer with email:', demoData.email);
          }
        } catch (customerError) {
          console.error('[Kiosk Payment] Failed to update customer:', customerError);
        }

        // Update status in database
        await db.setting.update({
          where: { key: `demo_payment_${paymentId}` },
          data: { value: JSON.stringify({ ...demoData, status: 'COMPLETED' }) }
        }).catch(() => {});

        return NextResponse.json({
          success: true,
          status: 'completed',
          saveCode: demoData.saveCode,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
      });
    }

    return NextResponse.json({
      success: false,
      status: 'pending',
      error: 'Payment not found',
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check payment status',
    }, { status: 500 });
  }
}

// Create drop-off credit payment - Uses real DimePay if configured, otherwise demo mode
async function createDropoffPayment(boxSize: string, phone: string, email?: string) {
  console.log('[Kiosk Payment] createDropoffPayment called with:', { boxSize, phone, email });

  // Validate box size
  if (!boxSize || !['S', 'M', 'L', 'XL'].includes(boxSize)) {
    console.log('[Kiosk Payment] Invalid box size:', boxSize);
    return NextResponse.json({
      success: false,
      error: 'Invalid box size. Must be S, M, L, or XL',
    }, { status: 400 });
  }

  // Validate phone
  if (!phone || phone.length < 7) {
    console.log('[Kiosk Payment] Invalid phone:', phone);
    return NextResponse.json({
      success: false,
      error: 'Valid phone number is required (at least 7 digits)',
    }, { status: 400 });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const amount = BOX_PRICES[boxSize];
  const saveCode = generateTrackingCode();
  const pickCode = generateTrackingCode(); // Generate pick code upfront

  // Create or update customer record DURING payment creation (not just after)
  let customer = await db.user.findFirst({
    where: { phone: cleanPhone }
  });

  if (!customer) {
    customer = await db.user.create({
      data: {
        phone: cleanPhone,
        email: email || `${cleanPhone}@pickup.local`,
        name: 'Customer',
        role: 'CUSTOMER',
      }
    });
    console.log('[Kiosk Payment] Created customer:', customer.id);
  } else if (email && customer.email.includes('@pickup.local')) {
    // Update with real email if we have one
    customer = await db.user.update({
      where: { id: customer.id },
      data: { email }
    });
    console.log('[Kiosk Payment] Updated customer email:', email);
  }

  // Check if DimePay is configured
  const config = await getDimepayConfig();

  console.log('[Kiosk Payment] DimePay config loaded:', {
    hasClientId: !!config.clientId,
    hasSecretKey: !!config.secretKey,
    sandboxMode: config.sandboxMode,
    sandboxClientIdSet: !!config.sandboxClientId,
    sandboxSecretKeySet: !!config.sandboxSecretKey,
    liveClientIdSet: !!config.liveClientId,
    liveSecretKeySet: !!config.liveSecretKey,
  });

  // Determine which credentials to use based on mode
  const effectiveClientId = config.sandboxMode ? config.sandboxClientId : config.liveClientId;
  const effectiveSecretKey = config.sandboxMode ? config.sandboxSecretKey : config.liveSecretKey;

  console.log('[Kiosk Payment] Effective credentials for', config.sandboxMode ? 'SANDBOX' : 'LIVE', 'mode:', {
    clientIdSet: !!effectiveClientId,
    secretKeySet: !!effectiveSecretKey,
    clientIdPrefix: effectiveClientId ? effectiveClientId.substring(0, 12) + '...' : '(none)',
  });

  // Use real DimePay SDK if credentials are configured
  if (effectiveClientId && effectiveSecretKey) {
    console.log('[Kiosk Payment] Using real DimePay SDK');

    try {
      // Always use production URL for QR codes (users scan with their phones)
      const baseUrl = 'https://pickuplocker.vercel.app';
      const orderId = `DROPOFF-${Date.now()}`;

      // Create SDK config
      const sdkConfig: DimePaySDKConfig = {
        clientId: effectiveClientId,
        secretKey: effectiveSecretKey,
        sandboxMode: config.sandboxMode,
        passFeeToCustomer: config.passFeeToCustomer,
        passFeeToCourier: config.passFeeToCourier,
        feePercentage: config.feePercentage,
        fixedFee: config.fixedFee,
      };

      const result = await createSDKPayment({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'JMD',
        orderId: orderId,
        description: `Drop-off Credit - ${boxSize} Box`,
        customerPhone: cleanPhone,
        customerEmail: email || undefined,
        redirectUrl: `${baseUrl}/kiosk?payment=success`,
        webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
        passFeeToCustomer: config.passFeeToCustomer,
        metadata: {
          type: 'dropoff_credit',
          boxSize,
          saveCode,
          pickCode,
          customerId: customer.id,
          customerPhone: cleanPhone,
          customerEmail: email || undefined,
        },
      }, sdkConfig);

      console.log('[Kiosk Payment] SDK Payment Result:', {
        success: result.success,
        amount: result.data?.amount,
        originalAmount: result.data?.originalAmount,
        feeAmount: result.data?.feeAmount,
        passFeeToCustomer: config.passFeeToCustomer,
        feePercentage: config.feePercentage,
        fixedFee: config.fixedFee,
      });

      if (result.success && result.data && result.data.sdkConfig) {
        // Generate payment URL for the payment page
        const paymentUrl = `${baseUrl}/pay/${orderId}`;

        // Generate QR code from payment URL
        let qrCodeDataUrl: string | undefined;
        try {
          qrCodeDataUrl = await generateQRCodeDataUrl(paymentUrl);
          console.log('[Kiosk Payment] QR code generated for payment URL');
        } catch (qrError) {
          console.error('[Kiosk Payment] QR generation error:', qrError);
        }

        // Store payment data in DATABASE for retrieval by payment page
        const paymentSessionData = {
          amount: result.data.amount,
          originalAmount: result.data.originalAmount,
          feeAmount: result.data.feeAmount,
          currency: result.data.currency,
          description: `Drop-off Credit - ${boxSize} Box`,
          reference: orderId,
          sdkConfig: result.data.sdkConfig,
          metadata: {
            type: 'dropoff_credit',
            boxSize,
            saveCode,
            pickCode,
            customerId: customer.id,
            customerPhone: cleanPhone,
            customerEmail: email || undefined,
          },
          status: 'PENDING',
          createdAt: Date.now(),
        };

        await db.setting.upsert({
          where: { key: `sdk_payment_${orderId}` },
          create: {
            key: `sdk_payment_${orderId}`,
            value: JSON.stringify(paymentSessionData),
            description: `SDK Payment: ${orderId}`,
          },
          update: {
            value: JSON.stringify(paymentSessionData),
          }
        });

        console.log('[Kiosk Payment] SDK payment stored in database:', orderId);

        return NextResponse.json({
          success: true,
          paymentId: orderId,
          paymentUrl,
          qrCodeDataUrl,
          amount: result.data.amount,
          originalAmount: result.data.originalAmount,
          feeAmount: result.data.feeAmount,
          boxSize,
          saveCode,
          pickCode,
          customerId: customer.id,
          message: `Scan QR to pay JMD $${result.data.amount} for ${boxSize} box drop-off`,
          isDemoMode: false,
        });
      } else {
        console.error('[Kiosk Payment] DimePay SDK payment failed:', result.error);
        // Fall through to demo mode
      }
    } catch (dimepayError) {
      console.error('[Kiosk Payment] DimePay SDK error:', dimepayError);
      // Fall through to demo mode
    }
  }

  // Demo mode fallback
  console.log('[Kiosk Payment] Using demo mode - no valid DimePay credentials');
  const paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const demoPaymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;

  // Generate QR code
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
    console.log('[Kiosk Payment] Demo QR code generated successfully');
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store demo payment in DATABASE
  await db.setting.upsert({
    where: { key: `demo_payment_${paymentId}` },
    create: {
      key: `demo_payment_${paymentId}`,
      value: JSON.stringify({
        saveCode,
        pickCode,
        boxSize,
        phone: cleanPhone,
        email: email || undefined,
        customerId: customer.id,
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
      description: `Demo Payment: ${paymentId}`,
    },
    update: {
      value: JSON.stringify({
        saveCode,
        pickCode,
        boxSize,
        phone: cleanPhone,
        email: email || undefined,
        customerId: customer.id,
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
    }
  });

  console.log('[Kiosk Payment] Demo payment stored in database:', paymentId);

  return NextResponse.json({
    success: true,
    paymentId,
    paymentUrl: demoPaymentUrl,
    qrCodeDataUrl,
    amount,
    boxSize,
    saveCode,
    pickCode,
    customerId: customer.id,
    message: `[DEMO MODE] Scan QR to simulate payment of JMD $${amount} for ${boxSize} box`,
    isDemoMode: true,
  });
}

// Create storage fee payment - ALWAYS USES DEMO MODE
async function createStorageFeePayment(orderId: string, amount: number, phone?: string) {
  console.log('[Kiosk Payment] createStorageFeePayment called:', { orderId, amount, phone });

  if (!orderId || !amount || amount <= 0) {
    return NextResponse.json({
      success: false,
      error: 'Order ID and valid amount are required',
    }, { status: 400 });
  }

  const paymentId = `SF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const demoPaymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;

  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);
  } catch (qrError) {
    console.error('[Kiosk Payment] QR generation error:', qrError);
  }

  // Store in database
  await db.setting.upsert({
    where: { key: `demo_payment_${paymentId}` },
    create: {
      key: `demo_payment_${paymentId}`,
      value: JSON.stringify({
        saveCode: '',
        boxSize: '',
        phone: phone || '',
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
      description: `Storage Fee Payment: ${paymentId}`,
    },
    update: {
      value: JSON.stringify({
        saveCode: '',
        boxSize: '',
        phone: phone || '',
        amount,
        createdAt: Date.now(),
        status: 'PENDING',
      }),
    }
  });

  return NextResponse.json({
    success: true,
    paymentId,
    paymentUrl: demoPaymentUrl,
    qrCodeDataUrl,
    amount,
    message: `[DEMO MODE] Scan QR to simulate payment of JMD $${amount} storage fee`,
    isDemoMode: true,
  });
}

// Open box immediately after payment - skips code entry step
async function openBoxAfterPayment(saveCode: string, recipientPhone: string) {
  console.log('[Kiosk Payment] openBoxAfterPayment called:', { saveCode, recipientPhone });

  if (!saveCode || saveCode.length !== 6) {
    return NextResponse.json({
      success: false,
      error: 'Invalid save code',
    }, { status: 400 });
  }

  // Find the payment session with this save code
  const settings = await db.setting.findMany({
    where: {
      OR: [
        { key: { startsWith: 'sdk_payment_' } },
        { key: { startsWith: 'demo_payment_' } },
      ]
    }
  });

  let paymentData: any = null;
  let settingKey = '';

  for (const setting of settings) {
    const data = JSON.parse(setting.value);
    if (data.saveCode === saveCode || data.metadata?.saveCode === saveCode) {
      paymentData = data;
      settingKey = setting.key;
      break;
    }
  }

  if (!paymentData) {
    return NextResponse.json({
      success: false,
      error: 'Payment not found for this save code',
    }, { status: 404 });
  }

  // Check payment is completed
  if (paymentData.status !== 'COMPLETED') {
    return NextResponse.json({
      success: false,
      error: 'Payment not yet completed',
    }, { status: 400 });
  }

  // Get box info
  const boxSize = paymentData.boxSize || paymentData.metadata?.boxSize;
  const customerId = paymentData.customerId || paymentData.metadata?.customerId;
  const customerPhone = recipientPhone || paymentData.phone || paymentData.metadata?.customerPhone;
  const pickCode = paymentData.pickCode || paymentData.metadata?.pickCode || generateTrackingCode();

  // Get device and assign box
  const device = await db.device.findFirst({
    where: { status: 'ONLINE' },
    include: {
      boxes: {
        where: { status: 'AVAILABLE' },
        take: 1,
      }
    }
  });

  if (!device || !device.boxes[0]) {
    return NextResponse.json({
      success: false,
      error: 'No available locker boxes',
    }, { status: 400 });
  }

  const box = device.boxes[0];
  const boxName = box.boxName || box.boxNumber?.toString().padStart(2, '0') || '01';

  // Generate order number
  const orderNumber = `P${Date.now().toString().slice(-8)}`;

  // Create ExpressOrder
  const expressOrder = await db.expressOrder.create({
    data: {
      orderNo: orderNumber,
      deviceId: device.deviceId,
      boxName,
      boxSize,
      saveCode,
      pickCode,
      status: 'STORED',
      customerPhone,
      saveTime: new Date(),
    }
  });

  // Update box status
  await db.box.update({
    where: { id: box.id },
    data: { status: 'OCCUPIED', lastUsedAt: new Date() }
  });

  // Open the box via Bestwond
  let boxOpened = false;
  try {
    const { getCredentialsForDevice, expressSaveOrTakeWithCredentials } = await import('@/lib/bestwond');
    const credentials = await getCredentialsForDevice(device.id);
    const result = await expressSaveOrTakeWithCredentials(
      device.deviceId,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );
    boxOpened = result.code === 0;
    console.log('[Kiosk Payment] Box open result:', result);
  } catch (error) {
    console.error('[Kiosk Payment] Failed to open box:', error);
  }

  console.log('[Kiosk Payment] Box opened successfully:', { orderNumber, boxName, boxOpened });

  return NextResponse.json({
    success: true,
    orderNo: orderNumber,
    boxName,
    boxOpened,
    pickCode,
    message: 'Locker opened! Please place your package inside and close the door.',
  });
}
