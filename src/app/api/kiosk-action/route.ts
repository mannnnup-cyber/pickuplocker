import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function renderPage(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Smart Locker</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%); min-height: 100vh; color: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #3d5a80; margin-bottom: 20px; }
    .header h1 { color: #ee6c4d; font-size: 28px; }
    .header p { color: #98c1d9; margin-top: 5px; }
    .title { text-align: center; font-size: 28px; margin-bottom: 30px; color: #ee6c4d; }
    .subtitle { color: #98c1d9; margin-bottom: 20px; text-align: center; font-size: 18px; }
    .btn { display: block; width: 100%; padding: 25px; margin: 15px 0; font-size: 24px; font-weight: bold; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; text-align: center; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: rgba(0,0,0,0); }
    .btn-primary { background: #ee6c4d; color: white; }
    .btn-primary:hover, .btn-primary:active { background: #d45a3d; }
    .btn-secondary { background: #3d5a80; color: white; }
    .btn-secondary:hover, .btn-secondary:active { background: #2d4a70; }
    .btn-success { background: #4CAF50; color: white; }
    .btn-success:hover, .btn-success:active { background: #45a049; }
    .btn-back { background: transparent; border: 2px solid #98c1d9; color: #98c1d9; padding: 15px 30px; display: inline-block; width: auto; font-size: 18px; text-decoration: none; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 18px; color: #98c1d9; }
    .form-group input { width: 100%; padding: 15px; font-size: 20px; border: 2px solid #3d5a80; border-radius: 8px; background: #0d1b2a; color: white; -webkit-appearance: none; appearance: none; }
    .form-group input:focus { outline: none; border-color: #ee6c4d; }
    .box-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
    .box-btn { padding: 20px; font-size: 20px; background: #3d5a80; color: white; border: none; border-radius: 8px; cursor: pointer; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: rgba(0,0,0,0); }
    .box-btn:disabled { background: #1e3a5f; color: #666; cursor: not-allowed; }
    .box-S, .box-btn.small { background: #2196F3; }
    .box-M, .box-btn.medium { background: #4CAF50; }
    .box-L, .box-btn.large { background: #FF9800; }
    .box-XL, .box-btn.xlarge { background: #9C27B0; }
    .info-box { background: #1e3a5f; padding: 20px; border-radius: 10px; margin: 15px 0; }
    .info-box p { margin: 10px 0; font-size: 18px; }
    .label { color: #98c1d9; }
    .value { color: white; font-weight: bold; }
    .success-icon { text-align: center; font-size: 80px; color: #4CAF50; margin: 20px 0; }
    .code-display { text-align: center; font-size: 48px; color: #ee6c4d; font-weight: bold; padding: 20px; background: #0d1b2a; border-radius: 10px; margin: 15px 0; border: 2px solid #3d5a80; letter-spacing: 8px; }
    .error-msg { color: #ff6b6b; text-align: center; margin-bottom: 15px; font-size: 16px; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 20px 0; font-size: 14px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-color { width: 20px; height: 20px; border-radius: 4px; }
    .nav-buttons { display: flex; justify-content: space-between; margin-top: 30px; }
    .payment-details { background: #0d1b2a; padding: 15px; border-radius: 8px; margin: 10px 0; border: 1px solid #3d5a80; }
    .payment-details p { margin: 8px 0; }
    @media (max-width: 480px) {
      .box-grid { grid-template-columns: repeat(2, 1fr); }
      .btn { font-size: 20px; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Smart Locker</h1>
      <p>Secure Package Storage</p>
    </div>
    ${content}
  </div>
</body>
</html>`;
}

// POST handler for all kiosk actions
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const flow = formData.get('flow') as string;
  const step = formData.get('step') as string;

  // ============================================
  // DROP-OFF FLOW
  // ============================================
  if (flow === 'dropoff') {

    // Step 1: Redirect to customer info form
    if (step === '1') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=dropoff', request.url));
    }

    // Step 2: Select locker (after customer info submitted)
    if (step === '2') {
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;

      if (!name || !phone) {
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">Name and phone are required</p>
          <a href="/kiosk-lite?action=dropoff" class="btn btn-primary">Try Again</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      // Get available boxes
      const boxes = await prisma.box.findMany({
        where: { status: 'AVAILABLE' },
        include: { locker: true },
        take: 12
      });

      if (boxes.length === 0) {
        const pageHtml = renderPage(`
          <h2 class="title">No Lockers Available</h2>
          <p class="subtitle">All lockers are currently in use.</p>
          <p style="text-align: center; margin: 20px 0;">Please try again later or contact support.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      const sizeColors: Record<string, string> = { 'S': 'box-S', 'M': 'box-M', 'L': 'box-L', 'XL': 'box-XL' };
      const boxButtons = boxes.map(box => `
        <button type="submit" name="boxId" value="${box.id}" class="box-btn ${sizeColors[box.size] || ''}">
          ${(box.locker?.name || 'L')}-${box.number}
        </button>
      `).join('');

      const pageHtml = renderPage(`
        <h2 class="title">Select Locker</h2>
        <p class="subtitle">Step 2: Choose an available locker</p>
        <div class="legend">
          <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div> Small</div>
          <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div> Medium</div>
          <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div> Large</div>
          <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div> X-Large</div>
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="3">
          <input type="hidden" name="name" value="${name}">
          <input type="hidden" name="phone" value="${phone}">
          <input type="hidden" name="email" value="${email || ''}">
          <div class="box-grid">${boxButtons}</div>
        </form>
        <div class="nav-buttons">
          <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
        </div>
      `);
      return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 3: Confirm drop-off details
    if (step === '3') {
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;
      const boxId = formData.get('boxId') as string;

      if (!boxId) {
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">No locker selected</p>
          <a href="/kiosk-lite?action=dropoff" class="btn btn-primary">Try Again</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      const box = await prisma.box.findUnique({
        where: { id: boxId },
        include: { locker: true }
      });

      if (!box) {
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">Locker not found</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      const sizeLabels: Record<string, string> = { 'S': 'Small', 'M': 'Medium', 'L': 'Large', 'XL': 'X-Large' };

      const pageHtml = renderPage(`
        <h2 class="title">Confirm Drop-Off</h2>
        <p class="subtitle">Step 3: Review and confirm</p>
        <div class="info-box">
          <p><span class="label">Locker:</span> <span class="value">${box.locker?.name || 'L'}-${box.number}</span></p>
          <p><span class="label">Size:</span> <span class="value">${sizeLabels[box.size] || box.size}</span></p>
          <p><span class="label">Customer:</span> <span class="value">${name}</span></p>
          <p><span class="label">Phone:</span> <span class="value">${phone}</span></p>
          ${email ? `<p><span class="label">Email:</span> <span class="value">${email}</span></p>` : ''}
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="4">
          <input type="hidden" name="boxId" value="${boxId}">
          <input type="hidden" name="name" value="${name}">
          <input type="hidden" name="phone" value="${phone}">
          <input type="hidden" name="email" value="${email || ''}">
          <button type="submit" class="btn btn-success">CONFIRM - OPEN LOCKER</button>
        </form>
        <div class="nav-buttons">
          <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
        </div>
      `);
      return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 4: Complete drop-off - create order, open locker
    if (step === '4') {
      const boxId = formData.get('boxId') as string;
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;

      try {
        // Generate pickup code
        const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

        // Create or find customer
        let customer = await prisma.customer.findFirst({ where: { phone } });
        if (!customer) {
          customer = await prisma.customer.create({
            data: { name, phone, email: email || null }
          });
        }

        // Get box details
        const box = await prisma.box.findUnique({
          where: { id: boxId },
          include: { locker: true }
        });

        // Create package/order
        await prisma.package.create({
          data: {
            customerId: customer.id,
            boxId,
            pickupCode,
            status: 'STORED',
            storedAt: new Date()
          }
        });

        // Update box status
        await prisma.box.update({
          where: { id: boxId },
          data: { status: 'OCCUPIED' }
        });

        const pageHtml = renderPage(`
          <div class="success-icon">&#10003;</div>
          <h2 class="title">Locker Opened!</h2>
          <p class="subtitle">Place your package inside</p>
          <div class="info-box">
            <p class="subtitle">Your Pickup Code:</p>
            <div class="code-display">${pickupCode}</div>
            <p class="subtitle">Save this code to retrieve your package!</p>
          </div>
          <div class="info-box">
            <p><span class="label">Locker:</span> <span class="value">${box?.locker?.name || 'L'}-${box?.number}</span></p>
            <p><span class="label">Customer:</span> <span class="value">${name}</span></p>
          </div>
          <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      } catch (err) {
        console.error('Drop-off error:', err);
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">Something went wrong. Please try again.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }
    }
  }

  // ============================================
  // PICKUP FLOW
  // ============================================
  if (flow === 'pickup') {

    // Step 1: Redirect to pickup code entry form
    if (step === '1') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=pickup', request.url));
    }

    // Step 2: Find package by code
    if (step === '2') {
      const code = formData.get('code') as string;

      if (!code) {
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">Please enter a pickup code</p>
          <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      const pkg = await prisma.package.findFirst({
        where: { pickupCode: code, status: { in: ['STORED', 'PAYMENT_PENDING'] } },
        include: { box: { include: { locker: true } }, customer: true }
      });

      if (!pkg) {
        const pageHtml = renderPage(`
          <h2 class="title">Not Found</h2>
          <p class="error-msg">No package found with code: ${code}</p>
          <p class="subtitle">Please check your code and try again.</p>
          <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
          <a href="/kiosk-lite" class="btn btn-back">Back to Home</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }

      const lockerName = pkg.box?.locker?.name || 'L';
      const boxNumber = pkg.box?.number || '?';
      const customerName = pkg.customer?.name || 'Customer';
      const hasPayment = pkg.status === 'PAYMENT_PENDING';

      const pageHtml = renderPage(`
        <h2 class="title">Package Found</h2>
        <p class="subtitle">Locker: ${lockerName}-${boxNumber}</p>
        <div class="info-box">
          <p><span class="label">Customer:</span> <span class="value">${customerName}</span></p>
          <p><span class="label">Locker:</span> <span class="value">${lockerName}-${boxNumber}</span></p>
          <p><span class="label">Dropped:</span> <span class="value">${pkg.createdAt?.toLocaleDateString() || 'N/A'}</span></p>
          ${hasPayment ? `<p style="color: #ee6c4d; font-weight: bold;">Payment Required</p>` : ''}
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
          <input type="hidden" name="step" value="3">
          <input type="hidden" name="packageId" value="${pkg.id}">
          ${hasPayment ? `
            <div class="payment-details">
              <p><strong>Payment Required</strong></p>
              <p>Amount: Contact attendant</p>
            </div>
            <button type="submit" class="btn btn-success">PAY & OPEN LOCKER</button>
          ` : `
            <button type="submit" class="btn btn-success">OPEN LOCKER</button>
          `}
        </form>
        <div class="nav-buttons">
          <a href="/kiosk-lite?action=pickup" class="btn btn-back">Back</a>
        </div>
      `);
      return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 3: Complete pickup - open locker, update status
    if (step === '3') {
      const packageId = formData.get('packageId') as string;

      try {
        const pkg = await prisma.package.findUnique({
          where: { id: packageId },
          include: { box: { include: { locker: true } } }
        });

        if (!pkg) {
          const pageHtml = renderPage(`
            <h2 class="title">Error</h2>
            <p class="error-msg">Package not found</p>
            <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
          `);
          return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
        }

        // Update package status
        await prisma.package.update({
          where: { id: packageId },
          data: { status: 'PICKED_UP', pickedUpAt: new Date() }
        });

        // Update box status
        if (pkg.boxId) {
          await prisma.box.update({
            where: { id: pkg.boxId },
            data: { status: 'AVAILABLE' }
          });
        }

        const lockerName = pkg.box?.locker?.name || 'L';
        const boxNumber = pkg.box?.number || '?';

        const pageHtml = renderPage(`
          <div class="success-icon">&#10003;</div>
          <h2 class="title">Locker Opened!</h2>
          <p class="subtitle">Locker: ${lockerName}-${boxNumber}</p>
          <div class="info-box">
            <p style="text-align: center;">Please take your package and close the door.</p>
          </div>
          <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      } catch (err) {
        console.error('Pickup error:', err);
        const pageHtml = renderPage(`
          <h2 class="title">Error</h2>
          <p class="error-msg">Something went wrong. Please try again.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } });
      }
    }
  }

  // Default redirect to home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}
