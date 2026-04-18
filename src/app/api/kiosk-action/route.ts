import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  expressSaveOrTakeWithCredentials,
  setSaveOrderWithCredentials,
  getCredentialsForDevice,
  openBoxWithCredentials,
} from '@/lib/bestwond';
import {
  generateOrderNumber,
  generateTrackingCode,
  getStorageCalculation,
} from '@/lib/storage';
import { sendSMS, sendPickupNotification, sendPickupConfirmation } from '@/lib/textbee';
import { sendEmail, sendDropoffCodeEmail, isEmailEnabled } from '@/lib/email';
import { getSetting, getDimepayConfig } from '@/lib/settings';
import { createSDKPayment, DimePaySDKConfig } from '@/lib/dimepay';
import QRCode from 'qrcode';

// Box sizes and their prices for drop-off credits (JMD)
const BOX_PRICES: Record<string, number> = {
  S: 150,
  M: 200,
  L: 300,
  XL: 400,
};

// ============================================
// HTML HELPERS
// ============================================

/** Escape user input for safe HTML insertion */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shared CSS – brand colors Yellow #FFD439 / Black #111111, flexbox only, -webkit- prefixes */
const SHARED_CSS = `
  * { margin: 0; padding: 0; -webkit-box-sizing: border-box; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #111111;
    min-height: 100vh;
    color: #ffffff;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    text-align: center;
    padding: 20px 0;
    border-bottom: 2px solid #333333;
    margin-bottom: 20px;
  }
  .header h1 { color: #FFD439; font-size: 28px; }
  .header p { color: #999999; margin-top: 5px; }
  .title { text-align: center; font-size: 28px; margin-bottom: 30px; color: #FFD439; }
  .subtitle { color: #999999; margin-bottom: 20px; text-align: center; font-size: 18px; }
  .btn {
    display: block;
    width: 100%;
    padding: 25px;
    margin: 15px 0;
    font-size: 24px;
    font-weight: bold;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    text-decoration: none;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
  }
  .btn-primary { background: #FFD439; color: #111111; }
  .btn-primary:hover, .btn-primary:active { background: #f0c800; }
  .btn-secondary { background: #333333; color: #ffffff; }
  .btn-secondary:hover, .btn-secondary:active { background: #444444; }
  .btn-success { background: #4CAF50; color: white; }
  .btn-success:hover, .btn-success:active { background: #45a049; }
  .btn-back {
    background: transparent;
    border: 2px solid #666666;
    color: #999999;
    padding: 15px 30px;
    display: inline-block;
    width: auto;
    font-size: 18px;
    text-decoration: none;
  }
  .form-group { margin-bottom: 20px; }
  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 18px;
    color: #999999;
  }
  .form-group input {
    width: 100%;
    padding: 15px;
    font-size: 20px;
    border: 2px solid #333333;
    border-radius: 8px;
    background: #1a1a1a;
    color: #ffffff;
    -webkit-appearance: none;
    appearance: none;
  }
  .form-group input:focus { outline: none; border-color: #FFD439; }
  .box-sizes {
    display: -webkit-flex;
    display: flex;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    gap: 10px;
    -webkit-justify-content: center;
    justify-content: center;
    margin: 20px 0;
  }
  .box-btn {
    padding: 20px 30px;
    font-size: 20px;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    font-weight: bold;
    min-width: 120px;
  }
  .box-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .box-S { background: #2196F3; }
  .box-M { background: #4CAF50; }
  .box-L { background: #FF9800; }
  .box-XL { background: #9C27B0; }
  .info-box {
    background: #1a1a1a;
    padding: 20px;
    border-radius: 10px;
    margin: 15px 0;
    border: 1px solid #333333;
  }
  .info-box p { margin: 10px 0; font-size: 18px; }
  .label { color: #999999; }
  .value { color: #ffffff; font-weight: bold; }
  .success-icon { text-align: center; font-size: 80px; color: #4CAF50; margin: 20px 0; }
  .code-display {
    text-align: center;
    font-size: 48px;
    color: #FFD439;
    font-weight: bold;
    padding: 20px;
    background: #1a1a1a;
    border-radius: 10px;
    margin: 15px 0;
    border: 2px solid #FFD439;
    letter-spacing: 8px;
  }
  .error-msg { color: #ff6b6b; text-align: center; margin-bottom: 15px; font-size: 16px; }
  .legend {
    display: -webkit-flex;
    display: flex;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    gap: 10px;
    -webkit-justify-content: center;
    justify-content: center;
    margin: 20px 0;
    font-size: 14px;
  }
  .legend-item {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    gap: 5px;
  }
  .legend-color { width: 20px; height: 20px; border-radius: 4px; }
  .nav-buttons {
    display: -webkit-flex;
    display: flex;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    margin-top: 30px;
  }
  .payment-details {
    background: #1a1a1a;
    padding: 15px;
    border-radius: 8px;
    margin: 10px 0;
    border: 1px solid #333333;
  }
  .payment-details p { margin: 8px 0; }
  .qr-container { text-align: center; margin: 20px 0; }
  .qr-container img { max-width: 300px; border-radius: 8px; }
  .spinner {
    display: inline-block;
    width: 40px;
    height: 40px;
    border: 4px solid #333333;
    border-top: 4px solid #FFD439;
    border-radius: 50%;
    -webkit-animation: spin 1s linear infinite;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  }
  @-webkit-keyframes spin { 0% { -webkit-transform: rotate(0deg); } 100% { -webkit-transform: rotate(360deg); } }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @media (max-width: 480px) {
    .box-sizes { -webkit-flex-direction: column; flex-direction: column; -webkit-align-items: center; align-items: center; }
    .btn { font-size: 20px; padding: 20px; }
    .code-display { font-size: 36px; letter-spacing: 5px; }
  }
`;

/** Render a full HTML page with shared chrome */
function renderPage(content: string, extraHead: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Smart Locker</title>
  ${extraHead}
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PICKUP</h1>
      <p>Smart Locker System</p>
    </div>
    ${content}
  </div>
</body>
</html>`;
}

/** Helper – return an HTML NextResponse */
function htmlResponse(content: string, extraHead: string = ''): NextResponse {
  return new NextResponse(renderPage(content, extraHead), {
    headers: { 'Content-Type': 'text/html' },
  });
}

/** Generate QR code data URL */
async function generateQRCodeDataUrl(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
    });
  } catch (error) {
    console.error('QR generation error:', error);
    return '';
  }
}

// ============================================
// GET handler – for polling / meta-refresh redirects
// ============================================
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const flow = searchParams.get('flow');
  const step = searchParams.get('step');

  // Check drop-off payment status (polling via meta refresh)
  if (flow === 'dropoff' && step === 'check_payment') {
    return await handleCheckPayment(searchParams.get('paymentId') || '');
  }

  // Check storage fee payment status (polling via meta refresh)
  if (flow === 'pickup' && step === 'check_storage_payment') {
    return await handleCheckStoragePayment(searchParams.get('paymentId') || '');
  }

  // Default – redirect to kiosk home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}

// ============================================
// POST handler – all form submissions
// ============================================
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const flow = formData.get('flow') as string;
  const step = formData.get('step') as string;

  try {
    // ============================================
    // DROP-OFF FLOW
    // ============================================
    if (flow === 'dropoff') {
      return await handleDropoffFlow(step, formData, request);
    }

    // ============================================
    // PICKUP FLOW
    // ============================================
    if (flow === 'pickup') {
      return await handlePickupFlow(step, formData, request);
    }
  } catch (error) {
    console.error('Kiosk action error:', error);
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Something went wrong. Please try again.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Fallback
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}

// ============================================
// DROP-OFF FLOW HANDLER
// ============================================
async function handleDropoffFlow(
  step: string,
  formData: FormData,
  request: NextRequest
): Promise<NextResponse> {
  // step=1 → Redirect to drop-off page
  if (step === '1') {
    return NextResponse.redirect(
      new URL('/kiosk-lite?action=dropoff', request.url)
    );
  }

  // step=enter_save_code → Redirect to save-code entry page
  if (step === 'enter_save_code') {
    return NextResponse.redirect(
      new URL('/kiosk-lite?action=dropoff-save', request.url)
    );
  }

  // step=select_size → Redirect to box size selection page
  if (step === 'select_size') {
    return NextResponse.redirect(
      new URL('/kiosk-lite?action=dropoff-size', request.url)
    );
  }

  // step=buy_enter_phone → Redirect to phone entry page with boxSize
  if (step === 'buy_enter_phone') {
    const boxSize = formData.get('boxSize') as string;
    return NextResponse.redirect(
      new URL(`/kiosk-lite?action=dropoff-phone&boxSize=${esc(boxSize)}`, request.url)
    );
  }

  // step=courier_login → Redirect to courier login page
  if (step === 'courier_login') {
    return NextResponse.redirect(
      new URL('/kiosk-lite?action=courier-login', request.url)
    );
  }

  // step=use_save_code → Process save code drop-off
  if (step === 'use_save_code') {
    return await handleUseSaveCode(formData);
  }

  // step=buy_create_payment → Create DimePay payment, show QR
  if (step === 'buy_create_payment') {
    return await handleBuyCreatePayment(formData);
  }

  // step=check_payment → Check payment status
  if (step === 'check_payment') {
    const paymentId = formData.get('paymentId') as string;
    return await handleCheckPayment(paymentId);
  }

  // step=open_after_payment → Open box after confirmed payment
  if (step === 'open_after_payment') {
    return await handleOpenAfterPayment(formData);
  }

  // step=courier_auth → Verify courier PIN
  if (step === 'courier_auth') {
    return await handleCourierAuth(formData);
  }

  // step=courier_dropoff → Process courier drop-off
  if (step === 'courier_dropoff') {
    return await handleCourierDropoff(formData);
  }

  // Unknown step – redirect home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}

// ============================================
// PICKUP FLOW HANDLER
// ============================================
async function handlePickupFlow(
  step: string,
  formData: FormData,
  request: NextRequest
): Promise<NextResponse> {
  // step=1 → Redirect to pickup code entry page
  if (step === '1') {
    return NextResponse.redirect(
      new URL('/kiosk-lite?action=pickup', request.url)
    );
  }

  // step=lookup → Find order by pickCode
  if (step === 'lookup') {
    return await handlePickupLookup(formData);
  }

  // step=pay_storage_fee → Create storage fee payment, show QR
  if (step === 'pay_storage_fee') {
    return await handlePayStorageFee(formData);
  }

  // step=check_storage_payment → Check storage fee payment status
  if (step === 'check_storage_payment') {
    const paymentId = formData.get('paymentId') as string;
    return await handleCheckStoragePayment(paymentId);
  }

  // step=open_pickup → Open locker for pickup
  if (step === 'open_pickup') {
    return await handleOpenPickup(formData);
  }

  // Unknown step – redirect home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}

// ============================================
// DROP-OFF: Use save code
// ============================================
async function handleUseSaveCode(formData: FormData): Promise<NextResponse> {
  const saveCode = formData.get('saveCode') as string;
  const recipientPhone = formData.get('phone') as string;

  if (!saveCode || saveCode.length !== 6) {
    return htmlResponse(`
      <h2 class="title">Invalid Code</h2>
      <p class="error-msg">Please enter a valid 6-digit drop-off code.</p>
      <a href="/kiosk-lite?action=dropoff-save" class="btn btn-primary">Try Again</a>
    `);
  }

  // Find ExpressOrder by saveCode where status=CREATED
  const expressOrder = await db.expressOrder.findFirst({
    where: { saveCode, status: 'CREATED' },
  });

  if (!expressOrder) {
    return htmlResponse(`
      <h2 class="title">Code Not Found</h2>
      <p class="error-msg">Invalid or expired drop-off code. Please check and try again.</p>
      <a href="/kiosk-lite?action=dropoff-save" class="btn btn-primary">Try Again</a>
      <a href="/kiosk-lite" class="btn btn-back">Back to Home</a>
    `);
  }

  if (!recipientPhone) {
    return htmlResponse(`
      <h2 class="title">Phone Required</h2>
      <p class="error-msg">A recipient phone number is required for drop-off.</p>
      <a href="/kiosk-lite?action=dropoff-save" class="btn btn-primary">Try Again</a>
    `);
  }

  const cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId: expressOrder.deviceId },
  });

  if (!device) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Locker device not found. Please contact support.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Get Bestwond credentials
  const credentials = await getCredentialsForDevice(device.id);

  // Call Bestwond API to open box
  let boxOpened = false;
  let boxName = expressOrder.boxName;

  try {
    const result = await expressSaveOrTakeWithCredentials(
      expressOrder.deviceId,
      expressOrder.boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );
    if (result.code === 0 && result.data) {
      boxOpened = true;
      boxName = result.data.box_name || boxName;
    }
  } catch (bestwondError) {
    console.error('Bestwond express save error:', bestwondError);
    // Fallback: try direct box open
    try {
      if (boxName) {
        const openResult = await openBoxWithCredentials(
          device.deviceId,
          parseInt(boxName),
          credentials
        );
        boxOpened = openResult.code === 0;
      }
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Update ExpressOrder status to STORED
  await db.expressOrder.update({
    where: { id: expressOrder.id },
    data: {
      status: 'STORED',
      saveTime: new Date(),
      customerPhone: cleanPhone,
    },
  });

  // Find and update main Order
  const order = await db.order.findFirst({
    where: { orderNumber: expressOrder.orderNo },
  });

  if (order) {
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'STORED',
        dropOffAt: new Date(),
        customerPhone: cleanPhone,
        storageStartAt: new Date(),
      },
    });

    // Mark box as OCCUPIED
    if (order.boxId) {
      await db.box.update({
        where: { id: order.boxId },
        data: { status: 'OCCUPIED', lastUsedAt: new Date() },
      });
    }

    // Send pickup notification SMS
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 3);
      await sendPickupNotification(
        cleanPhone,
        expressOrder.customerName || 'Customer',
        expressOrder.pickCode,
        device.location || 'Pickup Locker',
        expiryDate.toLocaleDateString()
      );
    } catch (smsError) {
      console.error('Failed to send pickup SMS:', smsError);
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        action: 'KIOSK_DROP_OFF',
        description: `Package stored via kiosk (save code). Box: ${boxName}, Code: ${saveCode}`,
        orderId: order.id,
      },
    });
  }

  // Show success page with pickCode
  return htmlResponse(`
    <div class="success-icon">&#10003;</div>
    <h2 class="title">Locker Opened!</h2>
    <p class="subtitle">Place your package inside and close the door.</p>
    <div class="info-box">
      <p style="text-align:center; color:#999999;">Pickup Code</p>
      <div class="code-display">${esc(expressOrder.pickCode)}</div>
      <p style="text-align:center; font-size:14px; color:#999999;">Save this code to retrieve your package!</p>
    </div>
    <div class="info-box">
      <p><span class="label">Box:</span> <span class="value">${esc(boxName || 'N/A')}</span></p>
      <p><span class="label">Size:</span> <span class="value">${esc(expressOrder.boxSize)}</span></p>
    </div>
    <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
  `);
}

// ============================================
// DROP-OFF: Create payment for buy flow
// ============================================
async function handleBuyCreatePayment(formData: FormData): Promise<NextResponse> {
  const boxSize = formData.get('boxSize') as string;
  const phone = formData.get('phone') as string;
  const email = formData.get('email') as string;

  if (!boxSize || !BOX_PRICES[boxSize]) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Invalid box size selected.</p>
      <a href="/kiosk-lite?action=dropoff-size" class="btn btn-primary">Try Again</a>
    `);
  }

  if (!phone || phone.replace(/[^0-9]/g, '').length < 7) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">A valid phone number is required.</p>
      <a href="/kiosk-lite?action=dropoff-phone&boxSize=${esc(boxSize)}" class="btn btn-primary">Try Again</a>
    `);
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const amount = BOX_PRICES[boxSize];
  const saveCode = generateTrackingCode();
  const pickCode = generateTrackingCode();

  // Find or create customer
  let customer = await db.user.findFirst({ where: { phone: cleanPhone } });
  if (!customer) {
    customer = await db.user.create({
      data: {
        phone: cleanPhone,
        email: email || `${cleanPhone}@pickup.local`,
        name: 'Customer',
        role: 'CUSTOMER',
      },
    });
  } else if (email && customer.email.includes('@pickup.local')) {
    customer = await db.user.update({
      where: { id: customer.id },
      data: { email },
    });
  }

  // Try real DimePay first
  const config = await getDimepayConfig();
  const effectiveClientId = config.sandboxMode
    ? config.sandboxClientId
    : config.liveClientId;
  const effectiveSecretKey = config.sandboxMode
    ? config.sandboxSecretKey
    : config.liveSecretKey;

  let paymentId = '';
  let qrCodeDataUrl = '';
  let isDemoMode = true;
  let displayAmount = amount;

  if (effectiveClientId && effectiveSecretKey) {
    try {
      const sdkConfig: DimePaySDKConfig = {
        clientId: effectiveClientId,
        secretKey: effectiveSecretKey,
        sandboxMode: config.sandboxMode,
        passFeeToCustomer: config.passFeeToCustomer,
        passFeeToCourier: config.passFeeToCourier,
        feePercentage: config.feePercentage,
        fixedFee: config.fixedFee,
      };

      const orderId = `DROPOFF-${Date.now()}`;
      const result = await createSDKPayment(
        {
          amount: Math.round(amount * 100),
          currency: 'JMD',
          orderId,
          description: `Drop-off Credit - ${boxSize} Box`,
          customerPhone: cleanPhone,
          customerEmail: email || undefined,
          redirectUrl: `https://pickuplocker.vercel.app/kiosk?payment=success`,
          webhookUrl: `https://pickuplocker.vercel.app/api/webhooks/dimepay`,
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
        },
        sdkConfig
      );

      if (result.success && result.data) {
        isDemoMode = false;
        paymentId = orderId;
        displayAmount = result.data.amount;

        // Store payment session in DB
        await db.setting.upsert({
          where: { key: `sdk_payment_${paymentId}` },
          create: {
            key: `sdk_payment_${paymentId}`,
            value: JSON.stringify({
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
            }),
            description: `SDK Payment: ${orderId}`,
          },
          update: {
            value: JSON.stringify({
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
            }),
          },
        });

        // Generate QR code from SDK payment URL
        const paymentUrl = `https://pickuplocker.vercel.app/pay/${orderId}`;
        qrCodeDataUrl = await generateQRCodeDataUrl(paymentUrl);
      }
    } catch (dimepayError) {
      console.error('DimePay SDK error, falling back to demo:', dimepayError);
    }
  }

  // Demo mode fallback
  if (isDemoMode) {
    paymentId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const demoPaymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;
    qrCodeDataUrl = await generateQRCodeDataUrl(demoPaymentUrl);

    // Store demo payment in DB
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
      },
    });
  }

  // Show QR code page with meta refresh for polling
  const pollUrl = `/api/kiosk-action?flow=dropoff&step=check_payment&paymentId=${encodeURIComponent(paymentId)}`;
  const qrImg = qrCodeDataUrl
    ? `<div class="qr-container"><img src="${qrCodeDataUrl}" alt="Payment QR Code" /></div>`
    : '<p style="text-align:center; color:#999;">QR code unavailable</p>';

  return htmlResponse(
    `
    <h2 class="title">Scan to Pay</h2>
    <p class="subtitle">${isDemoMode ? '[DEMO MODE] ' : ''}JMD $${displayAmount} for ${boxSize} Box</p>
    ${qrImg}
    <div class="info-box">
      <p style="text-align:center;">Scan the QR code with your phone to complete payment.</p>
      <p style="text-align:center; font-size:14px; color:#999;">This page will refresh automatically...</p>
    </div>
    <div style="text-align:center;"><div class="spinner"></div></div>
    <form action="/api/kiosk-action" method="POST">
      <input type="hidden" name="flow" value="dropoff">
      <input type="hidden" name="step" value="check_payment">
      <input type="hidden" name="paymentId" value="${esc(paymentId)}">
      <button type="submit" class="btn btn-secondary">Check Payment Status</button>
    </form>
    <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
  `,
    `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
  );
}

// ============================================
// DROP-OFF: Check payment status
// ============================================
async function handleCheckPayment(paymentId: string): Promise<NextResponse> {
  if (!paymentId) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Missing payment ID.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Check SDK payment
  const sdkSetting = await db.setting.findUnique({
    where: { key: `sdk_payment_${paymentId}` },
  });

  if (sdkSetting) {
    const paymentData = JSON.parse(sdkSetting.value);

    if (paymentData.status === 'COMPLETED') {
      // Send email if not already sent
      if (paymentData.metadata?.customerEmail && !paymentData.emailSent) {
        try {
          const emailEnabled = await isEmailEnabled();
          if (emailEnabled) {
            await sendEmail(
              paymentData.metadata.customerEmail,
              'Your Pickup Jamaica Drop-off Code',
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#111111;padding:20px;text-align:center;">
                  <h1 style="color:#FFD439;margin:0;">PICK<span style="color:white;">UP</span></h1>
                  <p style="color:#999;margin:5px 0 0 0;">Smart Locker System</p>
                </div>
                <div style="padding:30px;background:#f9f9f9;">
                  <h2 style="color:#111;">Payment Confirmed!</h2>
                  <div style="background:#FFD439;padding:20px;text-align:center;border-radius:10px;margin:20px 0;">
                    <p style="margin:0;color:#666;font-size:14px;">Your Save Code</p>
                    <p style="font-size:36px;font-weight:bold;margin:10px 0;letter-spacing:5px;">${paymentData.metadata.saveCode}</p>
                  </div>
                </div>
              </div>`,
              `Your drop-off payment is confirmed. Save code: ${paymentData.metadata.saveCode}`
            );
            await db.setting
              .update({
                where: { key: `sdk_payment_${paymentId}` },
                data: { value: JSON.stringify({ ...paymentData, emailSent: true }) },
              })
              .catch(() => {});
          }
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
        }
      }

      // Show save code + DEPOSIT NOW button
      return htmlResponse(`
        <div class="success-icon">&#10003;</div>
        <h2 class="title">Payment Confirmed!</h2>
        <p class="subtitle">Your drop-off code is ready.</p>
        <div class="info-box">
          <p style="text-align:center; color:#999999;">Your Save Code</p>
          <div class="code-display">${esc(paymentData.metadata?.saveCode)}</div>
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="open_after_payment">
          <input type="hidden" name="saveCode" value="${esc(paymentData.metadata?.saveCode)}">
          <input type="hidden" name="boxSize" value="${esc(paymentData.metadata?.boxSize)}">
          <input type="hidden" name="phone" value="${esc(paymentData.metadata?.customerPhone)}">
          <button type="submit" class="btn btn-success">DEPOSIT NOW</button>
        </form>
        <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
      `);
    }

    // Still pending – show waiting page with auto-refresh
    const pollUrl = `/api/kiosk-action?flow=dropoff&step=check_payment&paymentId=${encodeURIComponent(paymentId)}`;
    return htmlResponse(
      `
      <h2 class="title">Waiting for Payment</h2>
      <p class="subtitle">Please complete payment on your phone.</p>
      <div style="text-align:center;"><div class="spinner"></div></div>
      <div class="info-box">
        <p style="text-align:center;">This page will refresh automatically...</p>
      </div>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
    `,
      `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
    );
  }

  // Check demo payment
  const demoSetting = await db.setting.findUnique({
    where: { key: `demo_payment_${paymentId}` },
  });

  if (demoSetting) {
    const demoData = JSON.parse(demoSetting.value);
    const elapsed = Date.now() - demoData.createdAt;

    // Auto-complete after 5 seconds in demo mode
    if (elapsed > 5000) {
      // Send SMS notification
      try {
        await sendSMS(
          demoData.phone,
          `Pickup Jamaica: Your drop-off payment of JMD $${demoData.amount} is confirmed. Your save code is ${demoData.saveCode}. Use this code at the locker to store your package.`
        );
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError);
      }

      // Send email if provided
      if (demoData.email) {
        try {
          const emailEnabled = await isEmailEnabled();
          if (emailEnabled) {
            await sendEmail(
              demoData.email,
              'Your Pickup Jamaica Drop-off Code',
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#111111;padding:20px;text-align:center;">
                  <h1 style="color:#FFD439;margin:0;">PICK<span style="color:white;">UP</span></h1>
                  <p style="color:#999;margin:5px 0 0 0;">Smart Locker System</p>
                </div>
                <div style="padding:30px;background:#f9f9f9;">
                  <h2 style="color:#111;">Payment Confirmed!</h2>
                  <div style="background:#FFD439;padding:20px;text-align:center;border-radius:10px;margin:20px 0;">
                    <p style="margin:0;color:#666;font-size:14px;">Your Save Code</p>
                    <p style="font-size:36px;font-weight:bold;margin:10px 0;letter-spacing:5px;">${demoData.saveCode}</p>
                  </div>
                </div>
              </div>`,
              `Your drop-off payment is confirmed. Save code: ${demoData.saveCode}`
            );
          }
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
        }
      }

      // Update demo payment status
      await db.setting
        .update({
          where: { key: `demo_payment_${paymentId}` },
          data: { value: JSON.stringify({ ...demoData, status: 'COMPLETED' }) },
        })
        .catch(() => {});

      // Show save code + DEPOSIT NOW button
      return htmlResponse(`
        <div class="success-icon">&#10003;</div>
        <h2 class="title">Payment Confirmed!</h2>
        <p class="subtitle">[DEMO MODE] Your drop-off code is ready.</p>
        <div class="info-box">
          <p style="text-align:center; color:#999999;">Your Save Code</p>
          <div class="code-display">${esc(demoData.saveCode)}</div>
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="open_after_payment">
          <input type="hidden" name="saveCode" value="${esc(demoData.saveCode)}">
          <input type="hidden" name="boxSize" value="${esc(demoData.boxSize)}">
          <input type="hidden" name="phone" value="${esc(demoData.phone)}">
          <button type="submit" class="btn btn-success">DEPOSIT NOW</button>
        </form>
        <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
      `);
    }

    // Still pending
    const pollUrl = `/api/kiosk-action?flow=dropoff&step=check_payment&paymentId=${encodeURIComponent(paymentId)}`;
    return htmlResponse(
      `
      <h2 class="title">Waiting for Payment</h2>
      <p class="subtitle">[DEMO MODE] Payment will auto-complete in a few seconds...</p>
      <div style="text-align:center;"><div class="spinner"></div></div>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
    `,
      `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
    );
  }

  // Payment not found
  return htmlResponse(`
    <h2 class="title">Payment Not Found</h2>
    <p class="error-msg">We could not find this payment session.</p>
    <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
  `);
}

// ============================================
// DROP-OFF: Open box after payment confirmed
// ============================================
async function handleOpenAfterPayment(formData: FormData): Promise<NextResponse> {
  const saveCode = formData.get('saveCode') as string;
  const boxSize = formData.get('boxSize') as string;
  const phone = formData.get('phone') as string;

  if (!saveCode) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Missing save code.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Find the ExpressOrder with this save code
  let expressOrder = await db.expressOrder.findFirst({
    where: { saveCode },
  });

  const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '') : '';

  // If no ExpressOrder exists yet (buy flow), create one
  if (!expressOrder) {
    // Find an available device and box
    const device = await db.device.findFirst({
      where: { status: 'ONLINE' },
      include: {
        boxes: {
          where: { status: 'AVAILABLE', size: boxSize || 'M' },
          take: 1,
        },
      },
    });

    if (!device || device.boxes.length === 0) {
      return htmlResponse(`
        <h2 class="title">No Lockers Available</h2>
        <p class="error-msg">No available lockers for this size. Please try again later.</p>
        <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
      `);
    }

    const box = device.boxes[0];
    const boxName = box.boxNumber.toString().padStart(2, '0');
    const orderNumber = generateOrderNumber();
    const pickCode = generateTrackingCode();

    // Create ExpressOrder
    expressOrder = await db.expressOrder.create({
      data: {
        orderNo: orderNumber,
        deviceId: device.deviceId,
        boxName,
        boxSize: boxSize || 'M',
        saveCode,
        pickCode,
        status: 'CREATED',
        customerPhone: cleanPhone,
      },
    });

    // Find or create customer
    let customer = await db.user.findFirst({ where: { phone: cleanPhone } });
    if (!customer) {
      customer = await db.user.create({
        data: {
          phone: cleanPhone,
          email: `${cleanPhone}@pickup.local`,
          name: 'Customer',
          role: 'CUSTOMER',
        },
      });
    }

    // Create main Order
    await db.order.create({
      data: {
        orderNumber,
        trackingCode: pickCode,
        customerId: customer.id,
        customerName: customer.name || 'Customer',
        customerPhone: cleanPhone,
        deviceId: device.id,
        boxId: box.id,
        boxNumber: parseInt(boxName),
        packageSize: boxSize || 'M',
        status: 'PENDING',
        storageStartAt: new Date(),
      },
    });

    // Mark box as RESERVED
    await db.box.update({
      where: { id: box.id },
      data: { status: 'RESERVED' },
    });
  }

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId: expressOrder.deviceId },
  });

  if (!device) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Locker device not found.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Get credentials and open box
  const credentials = await getCredentialsForDevice(device.id);
  let boxOpened = false;
  let boxName = expressOrder.boxName;

  try {
    const result = await expressSaveOrTakeWithCredentials(
      expressOrder.deviceId,
      expressOrder.boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );
    if (result.code === 0 && result.data) {
      boxOpened = true;
      boxName = result.data.box_name || boxName;
    }
  } catch (bestwondError) {
    console.error('Bestwond express save error:', bestwondError);
    try {
      if (boxName) {
        const openResult = await openBoxWithCredentials(
          device.deviceId,
          parseInt(boxName),
          credentials
        );
        boxOpened = openResult.code === 0;
      }
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Update ExpressOrder
  await db.expressOrder.update({
    where: { id: expressOrder.id },
    data: {
      status: 'STORED',
      saveTime: new Date(),
      customerPhone: cleanPhone || expressOrder.customerPhone,
    },
  });

  // Update main Order
  const order = await db.order.findFirst({
    where: { orderNumber: expressOrder.orderNo },
  });

  if (order) {
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'STORED',
        dropOffAt: new Date(),
        customerPhone: cleanPhone || order.customerPhone,
        storageStartAt: new Date(),
      },
    });

    if (order.boxId) {
      await db.box.update({
        where: { id: order.boxId },
        data: { status: 'OCCUPIED', lastUsedAt: new Date() },
      });
    }

    // Send pickup notification SMS
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 3);
      await sendPickupNotification(
        cleanPhone || order.customerPhone,
        expressOrder.customerName || order.customerName || 'Customer',
        expressOrder.pickCode,
        device.location || 'Pickup Locker',
        expiryDate.toLocaleDateString()
      );
    } catch (smsError) {
      console.error('Failed to send pickup SMS:', smsError);
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        action: 'KIOSK_DROP_OFF_PAID',
        description: `Package stored via kiosk (paid drop-off). Box: ${boxName}, Code: ${saveCode}`,
        orderId: order.id,
      },
    });
  }

  // Show success with pickCode
  return htmlResponse(`
    <div class="success-icon">&#10003;</div>
    <h2 class="title">Locker Opened!</h2>
    <p class="subtitle">Place your package inside and close the door.</p>
    <div class="info-box">
      <p style="text-align:center; color:#999999;">Pickup Code</p>
      <div class="code-display">${esc(expressOrder.pickCode)}</div>
      <p style="text-align:center; font-size:14px; color:#999999;">Save this code to retrieve your package!</p>
    </div>
    <div class="info-box">
      <p><span class="label">Box:</span> <span class="value">${esc(boxName || 'N/A')}</span></p>
      <p><span class="label">Size:</span> <span class="value">${esc(expressOrder.boxSize)}</span></p>
    </div>
    <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
  `);
}

// ============================================
// DROP-OFF: Courier auth (verify PIN)
// ============================================
async function handleCourierAuth(formData: FormData): Promise<NextResponse> {
  const pin = formData.get('pin') as string;

  if (!pin || pin.length < 4) {
    return htmlResponse(`
      <h2 class="title">Invalid PIN</h2>
      <p class="error-msg">Please enter a valid courier PIN.</p>
      <a href="/kiosk-lite?action=courier-login" class="btn btn-primary">Try Again</a>
    `);
  }

  // Find courier by PIN
  const courier = await db.courier.findFirst({
    where: { pin, status: 'ACTIVE' },
  });

  if (!courier) {
    return htmlResponse(`
      <h2 class="title">Authentication Failed</h2>
      <p class="error-msg">Invalid PIN or inactive account.</p>
      <a href="/kiosk-lite?action=courier-login" class="btn btn-primary">Try Again</a>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Back to Home</a>
    `);
  }

  // Update last login
  await db.courier.update({
    where: { id: courier.id },
    data: { lastLoginAt: new Date() },
  });

  // Show courier drop-off page with box sizes and balance
  const sizeLabels: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'X-Large' };
  const boxButtons = Object.entries(BOX_PRICES)
    .map(([size, price]) => {
      const canAfford = courier.balance >= price;
      return `
        <form action="/api/kiosk-action" method="POST" style="display:inline-block;">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="courier_dropoff">
          <input type="hidden" name="courierId" value="${esc(courier.id)}">
          <input type="hidden" name="boxSize" value="${esc(size)}">
          <button type="submit" class="box-btn box-${esc(size)}" ${canAfford ? '' : 'disabled'}
            style="min-width:140px; text-align:center; line-height:1.3;">
            ${esc(sizeLabels[size])}<br>
            <span style="font-size:14px;">JMD $${price}</span>
          </button>
        </form>
      `;
    })
    .join('');

  return htmlResponse(`
    <h2 class="title">Courier Drop-Off</h2>
    <div class="info-box">
      <p><span class="label">Courier:</span> <span class="value">${esc(courier.name)}</span></p>
      <p><span class="label">Balance:</span> <span class="value" style="color:#FFD439;">JMD $${courier.balance.toFixed(2)}</span></p>
    </div>
    <p class="subtitle">Select box size for drop-off:</p>
    <div class="box-sizes">
      ${boxButtons}
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div> Small ($150)</div>
      <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div> Medium ($200)</div>
      <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div> Large ($300)</div>
      <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div> X-Large ($400)</div>
    </div>
    <a href="/kiosk-lite" class="btn btn-back" style="margin-top:20px; display:inline-block;">Cancel</a>
  `);
}

// ============================================
// DROP-OFF: Courier drop-off
// ============================================
async function handleCourierDropoff(formData: FormData): Promise<NextResponse> {
  const courierId = formData.get('courierId') as string;
  const boxSize = formData.get('boxSize') as string;

  if (!courierId || !boxSize) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Missing courier or box size information.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  const courier = await db.courier.findUnique({ where: { id: courierId } });
  if (!courier || courier.status !== 'ACTIVE') {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Courier account not found or inactive.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  const boxPrice = BOX_PRICES[boxSize] || 0;
  if (courier.balance < boxPrice) {
    return htmlResponse(`
      <h2 class="title">Insufficient Balance</h2>
      <p class="error-msg">Need JMD $${boxPrice}, but balance is JMD $${courier.balance.toFixed(2)}.</p>
      <a href="/kiosk-lite?action=courier-login" class="btn btn-primary">Back to Login</a>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Home</a>
    `);
  }

  // Get available device
  const device = await db.device.findFirst({
    where: { status: 'ONLINE' },
    include: {
      boxes: {
        where: { status: 'AVAILABLE', size: boxSize },
        take: 1,
      },
    },
  });

  if (!device || device.boxes.length === 0) {
    return htmlResponse(`
      <h2 class="title">No Lockers Available</h2>
      <p class="error-msg">No available lockers for ${boxSize} size. Please try a different size.</p>
      <a href="/kiosk-lite?action=courier-login" class="btn btn-primary">Try Again</a>
    `);
  }

  // Get credentials
  const credentials = await getCredentialsForDevice(device.id);

  // Generate order numbers
  const orderNumber = generateOrderNumber();
  const saveCode = generateTrackingCode();
  const pickCode = generateTrackingCode();

  // Create order via Bestwond
  let boxName = device.boxes[0].boxNumber.toString().padStart(2, '0');
  let bestwondOrderNo = orderNumber;

  try {
    const bestwondResult = await setSaveOrderWithCredentials(
      device.deviceId,
      orderNumber,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      credentials
    );
    if (bestwondResult.code === 0 && bestwondResult.data) {
      boxName = bestwondResult.data.box_name || boxName;
      bestwondOrderNo = bestwondResult.data.order_no || orderNumber;
    }
  } catch (bestwondError) {
    console.error('Bestwond order creation error:', bestwondError);
  }

  // Find or create customer for courier
  const courierPhone = courier.phone || `${courier.code}@courier.local`;
  let customer = await db.user.findFirst({
    where: courier.phone ? { phone: courier.phone } : { email: `${courier.code}@courier.local` },
  });
  if (!customer) {
    customer = await db.user.create({
      data: {
        name: courier.name,
        phone: courier.phone || '',
        email: courier.email || `${courier.code}@courier.local`,
        role: 'CUSTOMER',
      },
    });
  }

  const box = device.boxes[0];

  // Create ExpressOrder
  await db.expressOrder.create({
    data: {
      orderNo: bestwondOrderNo,
      deviceId: device.deviceId,
      boxName,
      boxSize,
      saveCode,
      pickCode,
      status: 'CREATED',
      customerName: courier.name,
      customerPhone: courier.phone || '',
      courierName: courier.name,
    },
  });

  // Create main Order
  const order = await db.order.create({
    data: {
      orderNumber: bestwondOrderNo,
      trackingCode: pickCode,
      customerId: customer.id,
      customerName: courier.name,
      customerPhone: courier.phone || '',
      deviceId: device.id,
      boxId: box.id,
      boxNumber: parseInt(boxName),
      courierId: courier.id,
      courierName: courier.name,
      packageSize: boxSize,
      status: 'PENDING',
      storageStartAt: new Date(),
    },
  });

  // Mark box as RESERVED
  await db.box.update({
    where: { id: box.id },
    data: { status: 'RESERVED' },
  });

  // Deduct courier balance
  await db.courier.update({
    where: { id: courier.id },
    data: {
      balance: { decrement: boxPrice },
      totalDropOffs: { increment: 1 },
      totalSpent: { increment: boxPrice },
      lastActivityAt: new Date(),
    },
  });

  // Create courier transaction
  await db.courierTransaction.create({
    data: {
      courierId: courier.id,
      type: 'DROP_OFF',
      amount: -boxPrice,
      balanceAfter: courier.balance - boxPrice,
      orderId: order.id,
      reference: bestwondOrderNo,
      description: `Drop-off: ${boxSize} box, Order ${bestwondOrderNo}`,
      paymentMethod: 'PREPAID',
    },
  });

  // Open the box via Bestwond
  let boxOpened = false;
  try {
    const result = await expressSaveOrTakeWithCredentials(
      device.deviceId,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );
    boxOpened = result.code === 0;
  } catch (bestwondError) {
    console.error('Bestwond express save error:', bestwondError);
    try {
      const openResult = await openBoxWithCredentials(
        device.deviceId,
        parseInt(boxName),
        credentials
      );
      boxOpened = openResult.code === 0;
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Send SMS if courier has phone
  if (courier.phone) {
    try {
      await sendSMS(
        courier.phone,
        `Pickup Jamaica: Drop-off confirmed. Order ${bestwondOrderNo}. Pickup code for recipient: ${pickCode}. Box: ${boxName}.`
      );
    } catch (smsError) {
      console.error('Failed to send courier SMS:', smsError);
    }
  }

  // Create activity log
  await db.activity.create({
    data: {
      userId: customer.id,
      action: 'COURIER_DROP_OFF',
      description: `Courier ${courier.name} dropped off package. Box: ${boxName}, Size: ${boxSize}, Order: ${bestwondOrderNo}`,
      orderId: order.id,
    },
  });

  const newBalance = courier.balance - boxPrice;

  // Show success page
  return htmlResponse(`
    <div class="success-icon">&#10003;</div>
    <h2 class="title">Drop-Off Complete!</h2>
    <p class="subtitle">Place your package inside and close the door.</p>
    <div class="info-box">
      <p style="text-align:center; color:#999999;">Pickup Code (give to recipient)</p>
      <div class="code-display">${esc(pickCode)}</div>
    </div>
    <div class="info-box">
      <p><span class="label">Order:</span> <span class="value">${esc(bestwondOrderNo)}</span></p>
      <p><span class="label">Box:</span> <span class="value">${esc(boxName)}</span></p>
      <p><span class="label">Size:</span> <span class="value">${esc(boxSize)}</span></p>
      <p><span class="label">Cost:</span> <span class="value">JMD $${boxPrice}</span></p>
      <p><span class="label">Remaining Balance:</span> <span class="value" style="color:#FFD439;">JMD $${newBalance.toFixed(2)}</span></p>
    </div>
    <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
  `);
}

// ============================================
// PICKUP: Lookup by pickCode
// ============================================
async function handlePickupLookup(formData: FormData): Promise<NextResponse> {
  const pickCode = formData.get('pickCode') as string;

  if (!pickCode || pickCode.length < 4) {
    return htmlResponse(`
      <h2 class="title">Invalid Code</h2>
      <p class="error-msg">Please enter a valid pickup code.</p>
      <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
    `);
  }

  // Check ExpressOrder by pickCode where status=STORED
  const expressOrder = await db.expressOrder.findFirst({
    where: { pickCode, status: 'STORED' },
  });

  // Also check Order table by trackingCode
  const order = await db.order.findUnique({
    where: { trackingCode: pickCode },
    include: { device: true, box: true },
  });

  if (!expressOrder && !order) {
    return htmlResponse(`
      <h2 class="title">Not Found</h2>
      <p class="error-msg">No package found with this code.</p>
      <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Back to Home</a>
    `);
  }

  // Check if already picked up
  if (expressOrder?.status === 'PICKED_UP' || order?.status === 'PICKED_UP') {
    return htmlResponse(`
      <h2 class="title">Already Picked Up</h2>
      <p class="error-msg">This package has already been collected.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Calculate storage fee
  const storageStart =
    order?.storageStartAt || order?.dropOffAt || order?.createdAt || expressOrder?.createdAt;
  let storageFee = 0;
  let storageDays = 0;

  if (storageStart) {
    const calc = getStorageCalculation(new Date(storageStart));
    storageFee = calc.storageFee;
    storageDays = calc.totalDays;
  }

  // If fee > 0, show payment page
  if (storageFee > 0) {
    return htmlResponse(`
      <h2 class="title">Storage Fee Required</h2>
      <div class="info-box">
        <p><span class="label">Days Stored:</span> <span class="value">${storageDays}</span></p>
        <p><span class="label">Storage Fee:</span> <span class="value" style="color:#FFD439;">JMD $${storageFee}</span></p>
      </div>
      <p class="subtitle">Pay the storage fee to retrieve your package.</p>
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="pickup">
        <input type="hidden" name="step" value="pay_storage_fee">
        <input type="hidden" name="pickCode" value="${esc(pickCode)}">
        <input type="hidden" name="storageFee" value="${storageFee}">
        <input type="hidden" name="expressOrderId" value="${esc(expressOrder?.id || '')}">
        <input type="hidden" name="orderId" value="${esc(order?.id || '')}">
        <button type="submit" class="btn btn-primary">PAY STORAGE FEE (JMD $${storageFee})</button>
      </form>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
    `);
  }

  // No fee – open locker directly
  return await openLockerForPickup(pickCode, expressOrder, order);
}

// ============================================
// PICKUP: Pay storage fee
// ============================================
async function handlePayStorageFee(formData: FormData): Promise<NextResponse> {
  const pickCode = formData.get('pickCode') as string;
  const storageFee = parseFloat(formData.get('storageFee') as string);

  if (!pickCode || !storageFee || storageFee <= 0) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Invalid payment information.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Get phone from order
  const expressOrder = await db.expressOrder.findFirst({ where: { pickCode } });
  const order = await db.order.findUnique({ where: { trackingCode: pickCode } });
  const phone = expressOrder?.customerPhone || order?.customerPhone || '';

  // Create demo payment for storage fee
  const paymentId = `SF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const paymentUrl = `https://pickuplocker.vercel.app/pay/${paymentId}`;
  const qrCodeDataUrl = await generateQRCodeDataUrl(paymentUrl);

  // Store in DB
  await db.setting.upsert({
    where: { key: `demo_payment_${paymentId}` },
    create: {
      key: `demo_payment_${paymentId}`,
      value: JSON.stringify({
        saveCode: '',
        pickCode,
        boxSize: '',
        phone,
        amount: storageFee,
        createdAt: Date.now(),
        status: 'PENDING',
        type: 'storage_fee',
      }),
      description: `Storage Fee Payment: ${paymentId}`,
    },
    update: {
      value: JSON.stringify({
        saveCode: '',
        pickCode,
        boxSize: '',
        phone,
        amount: storageFee,
        createdAt: Date.now(),
        status: 'PENDING',
        type: 'storage_fee',
      }),
    },
  });

  const pollUrl = `/api/kiosk-action?flow=pickup&step=check_storage_payment&paymentId=${encodeURIComponent(paymentId)}`;
  const qrImg = qrCodeDataUrl
    ? `<div class="qr-container"><img src="${qrCodeDataUrl}" alt="Payment QR Code" /></div>`
    : '<p style="text-align:center; color:#999;">QR code unavailable</p>';

  return htmlResponse(
    `
    <h2 class="title">Pay Storage Fee</h2>
    <p class="subtitle">JMD $${storageFee} for ${storageFee > 0 ? 'overdue storage' : 'storage'}</p>
    ${qrImg}
    <div class="info-box">
      <p style="text-align:center;">Scan the QR code to pay the storage fee.</p>
      <p style="text-align:center; font-size:14px; color:#999;">This page will refresh automatically...</p>
    </div>
    <div style="text-align:center;"><div class="spinner"></div></div>
    <form action="/api/kiosk-action" method="POST">
      <input type="hidden" name="flow" value="pickup">
      <input type="hidden" name="step" value="check_storage_payment">
      <input type="hidden" name="paymentId" value="${esc(paymentId)}">
      <input type="hidden" name="pickCode" value="${esc(pickCode)}">
      <button type="submit" class="btn btn-secondary">Check Payment Status</button>
    </form>
    <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
  `,
    `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
  );
}

// ============================================
// PICKUP: Check storage fee payment
// ============================================
async function handleCheckStoragePayment(paymentId: string): Promise<NextResponse> {
  if (!paymentId) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Missing payment ID.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Check demo payment
  const demoSetting = await db.setting.findUnique({
    where: { key: `demo_payment_${paymentId}` },
  });

  if (demoSetting) {
    const demoData = JSON.parse(demoSetting.value);
    const elapsed = Date.now() - demoData.createdAt;

    // Auto-complete after 5 seconds
    if (elapsed > 5000) {
      // Update status
      await db.setting
        .update({
          where: { key: `demo_payment_${paymentId}` },
          data: { value: JSON.stringify({ ...demoData, status: 'COMPLETED' }) },
        })
        .catch(() => {});

      const pickCode = demoData.pickCode || '';

      // Show "OPEN LOCKER" button
      return htmlResponse(`
        <div class="success-icon">&#10003;</div>
        <h2 class="title">Payment Confirmed!</h2>
        <p class="subtitle">Storage fee has been paid.</p>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
          <input type="hidden" name="step" value="open_pickup">
          <input type="hidden" name="pickCode" value="${esc(pickCode)}">
          <button type="submit" class="btn btn-success">OPEN LOCKER</button>
        </form>
        <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
      `);
    }

    // Still pending
    const pollUrl = `/api/kiosk-action?flow=pickup&step=check_storage_payment&paymentId=${encodeURIComponent(paymentId)}`;
    return htmlResponse(
      `
      <h2 class="title">Waiting for Payment</h2>
      <p class="subtitle">Please complete payment on your phone.</p>
      <div style="text-align:center;"><div class="spinner"></div></div>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
    `,
      `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
    );
  }

  // Check SDK payment
  const sdkSetting = await db.setting.findUnique({
    where: { key: `sdk_payment_${paymentId}` },
  });

  if (sdkSetting) {
    const paymentData = JSON.parse(sdkSetting.value);

    if (paymentData.status === 'COMPLETED') {
      const pickCode = paymentData.metadata?.pickCode || '';
      return htmlResponse(`
        <div class="success-icon">&#10003;</div>
        <h2 class="title">Payment Confirmed!</h2>
        <p class="subtitle">Storage fee has been paid.</p>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
          <input type="hidden" name="step" value="open_pickup">
          <input type="hidden" name="pickCode" value="${esc(pickCode)}">
          <button type="submit" class="btn btn-success">OPEN LOCKER</button>
        </form>
        <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
      `);
    }

    // Pending
    const pollUrl = `/api/kiosk-action?flow=pickup&step=check_storage_payment&paymentId=${encodeURIComponent(paymentId)}`;
    return htmlResponse(
      `
      <h2 class="title">Waiting for Payment</h2>
      <p class="subtitle">Please complete payment on your phone.</p>
      <div style="text-align:center;"><div class="spinner"></div></div>
      <a href="/kiosk-lite" class="btn btn-back" style="margin-top:15px; display:inline-block;">Cancel</a>
    `,
      `<meta http-equiv="refresh" content="5;url=${esc(pollUrl)}">`
    );
  }

  return htmlResponse(`
    <h2 class="title">Payment Not Found</h2>
    <p class="error-msg">We could not find this payment session.</p>
    <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
  `);
}

// ============================================
// PICKUP: Open locker for pickup
// ============================================
async function handleOpenPickup(formData: FormData): Promise<NextResponse> {
  const pickCode = formData.get('pickCode') as string;

  if (!pickCode) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Missing pickup code.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  const expressOrder = await db.expressOrder.findFirst({
    where: { pickCode, status: 'STORED' },
  });

  const order = await db.order.findUnique({
    where: { trackingCode: pickCode },
    include: { device: true, box: true },
  });

  if (!expressOrder && !order) {
    return htmlResponse(`
      <h2 class="title">Not Found</h2>
      <p class="error-msg">No package found with this code.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  return await openLockerForPickup(pickCode, expressOrder, order);
}

// ============================================
// Shared: Open locker for pickup (called from lookup and open_pickup)
// ============================================
async function openLockerForPickup(
  pickCode: string,
  expressOrder: Awaited<ReturnType<typeof db.expressOrder.findFirst>> | null,
  order: Awaited<ReturnType<typeof db.order.findUnique>> | null
): Promise<NextResponse> {
  // Get device and box info
  let deviceId = expressOrder?.deviceId || order?.device?.deviceId || '';
  let boxName =
    expressOrder?.boxName ||
    (order?.boxNumber?.toString().padStart(2, '0')) ||
    '01';
  let boxSize = expressOrder?.boxSize || order?.packageSize || 'M';

  const device = await db.device.findFirst({ where: { deviceId } });
  if (!device) {
    return htmlResponse(`
      <h2 class="title">Error</h2>
      <p class="error-msg">Locker device not found.</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `);
  }

  // Get credentials
  const credentials = await getCredentialsForDevice(device.id);

  // Open box via Bestwond
  let boxOpened = false;
  try {
    const result = await expressSaveOrTakeWithCredentials(
      device.deviceId,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      pickCode,
      'take',
      credentials
    );
    if (result.code === 0) {
      boxOpened = true;
    }
  } catch (bestwondError) {
    console.error('Bestwond express take error:', bestwondError);
    try {
      const openResult = await openBoxWithCredentials(
        device.deviceId,
        parseInt(boxName),
        credentials
      );
      boxOpened = openResult.code === 0;
    } catch (openError) {
      console.error('Direct box open error:', openError);
    }
  }

  // Update ExpressOrder
  if (expressOrder) {
    await db.expressOrder.update({
      where: { id: expressOrder.id },
      data: {
        status: 'PICKED_UP',
        pickTime: new Date(),
      },
    });
  }

  // Update main Order
  if (order) {
    const storageStart = order.storageStartAt || order.dropOffAt || order.createdAt;
    let storageFee = 0;
    let storageDays = 0;
    if (storageStart) {
      const calc = getStorageCalculation(new Date(storageStart));
      storageFee = calc.storageFee;
      storageDays = calc.totalDays;
    }

    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(),
        storageDays,
        storageFee,
      },
    });

    // Mark box as AVAILABLE
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

    // Send pickup confirmation SMS
    try {
      await sendPickupConfirmation(order.customerPhone, order.customerName);
    } catch (smsError) {
      console.error('Failed to send pickup confirmation SMS:', smsError);
    }

    // Create activity log
    await db.activity.create({
      data: {
        userId: order.customerId,
        action: 'KIOSK_PICKUP',
        description: `Package picked up via kiosk. Box: ${boxName}, Days: ${storageDays}, Fee: JMD $${storageFee}`,
        orderId: order.id,
      },
    });
  }

  // Show success page
  return htmlResponse(`
    <div class="success-icon">&#10003;</div>
    <h2 class="title">Locker Opened!</h2>
    <p class="subtitle">Please collect your package and close the door.</p>
    <div class="info-box">
      <p><span class="label">Box:</span> <span class="value">${esc(boxName)}</span></p>
      <p><span class="label">Size:</span> <span class="value">${esc(boxSize)}</span></p>
    </div>
    <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
  `);
}
