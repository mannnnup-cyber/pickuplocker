import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function renderPage(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Locker</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #1a1a2e; min-height: 100vh; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #16213e; margin-bottom: 20px; }
    .header h1 { color: #e94560; font-size: 28px; }
    .header p { color: #0f3460; margin-top: 5px; }
    .title { text-align: center; font-size: 24px; margin-bottom: 20px; color: #e94560; }
    .subtitle { color: #888; margin-bottom: 20px; text-align: center; }
    .btn { display: block; width: 100%; padding: 20px; margin: 15px 0; font-size: 22px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; text-align: center; }
    .btn-primary { background: #e94560; color: white; }
    .btn-secondary { background: #0f3460; color: white; }
    .btn-success { background: #4CAF50; color: white; }
    .btn-back { background: transparent; border: 2px solid #888; color: #888; padding: 15px; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; color: #aaa; }
    .form-group input { width: 100%; padding: 15px; font-size: 18px; border: 2px solid #0f3460; border-radius: 8px; background: #16213e; color: white; }
    .box-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
    .box-btn { padding: 20px 10px; font-size: 18px; background: #0f3460; color: white; border: none; border-radius: 8px; cursor: pointer; }
    .box-S { background: #2196F3; }
    .box-M { background: #4CAF50; }
    .box-L { background: #FF9800; }
    .box-XL { background: #9C27B0; }
    .info-box { background: #16213e; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .info-box p { margin: 8px 0; }
    .label { color: #888; }
    .value { color: white; font-weight: bold; }
    .success-icon { text-align: center; font-size: 60px; color: #4CAF50; margin: 20px 0; }
    .code-display { text-align: center; font-size: 36px; color: #e94560; font-weight: bold; padding: 20px; background: #16213e; border-radius: 8px; margin: 15px 0; }
    .error { color: #e94560; text-align: center; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 15px 0; font-size: 14px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-color { width: 16px; height: 16px; border-radius: 3px; }
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

  // DROP-OFF FLOW
  if (flow === 'dropoff') {
    // Step 2: Select locker
    if (step === '2') {
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;

      if (!name || !phone) {
        const html = renderPage(`
          <h2 class="title">Error</h2>
          <p class="subtitle error">Name and phone are required</p>
          <a href="/kiosk-lite?action=dropoff" class="btn btn-primary">Try Again</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }

      // Get available boxes
      const boxes = await prisma.box.findMany({
        where: { status: 'AVAILABLE' },
        include: { locker: true },
        take: 12
      });

      if (boxes.length === 0) {
        const html = renderPage(`
          <h2 class="title">No Lockers Available</h2>
          <p class="subtitle">All lockers are currently in use.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }

      const boxButtons = boxes.map(box => `
        <button type="submit" name="boxId" value="${box.id}" class="box-btn box-${box.size}">
          ${(box.locker?.name || 'L')}-${box.number}
        </button>
      `).join('');

      const html = renderPage(`
        <h2 class="title">Select Locker</h2>
        <p class="subtitle">Step 2: Choose an available locker</p>
        <div class="legend">
          <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div> S</div>
          <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div> M</div>
          <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div> L</div>
          <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div> XL</div>
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="3">
          <input type="hidden" name="name" value="${name}">
          <input type="hidden" name="phone" value="${phone}">
          <input type="hidden" name="email" value="${email || ''}">
          <div class="box-grid">${boxButtons}</div>
        </form>
        <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
      `);
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 3: Confirm
    if (step === '3') {
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;
      const boxId = formData.get('boxId') as string;

      const box = await prisma.box.findUnique({
        where: { id: boxId },
        include: { locker: true }
      });

      if (!box) {
        const html = renderPage(`
          <h2 class="title">Error</h2>
          <p class="subtitle error">Locker not found</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }

      const html = renderPage(`
        <h2 class="title">Confirm Drop-Off</h2>
        <p class="subtitle">Step 3: Review and confirm</p>
        <div class="info-box">
          <p><span class="label">Locker:</span> <span class="value">${box.locker?.name || 'L'}-${box.number}</span></p>
          <p><span class="label">Size:</span> <span class="value">${box.size}</span></p>
          <p><span class="label">Customer:</span> <span class="value">${name}</span></p>
          <p><span class="label">Phone:</span> <span class="value">${phone}</span></p>
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
        <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
      `);
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 4: Complete drop-off
    if (step === '4') {
      const boxId = formData.get('boxId') as string;
      const name = formData.get('name') as string;
      const phone = formData.get('phone') as string;
      const email = formData.get('email') as string;

      try {
        const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

        let customer = await prisma.customer.findFirst({ where: { phone } });
        if (!customer) {
          customer = await prisma.customer.create({
            data: { name, phone, email: email || null }
          });
        }

        const box = await prisma.box.findUnique({
          where: { id: boxId },
          include: { locker: true }
        });

        await prisma.package.create({
          data: {
            customerId: customer.id,
            boxId,
            pickupCode,
            status: 'STORED',
            storedAt: new Date()
          }
        });

        await prisma.box.update({
          where: { id: boxId },
          data: { status: 'OCCUPIED' }
        });

        const html = renderPage(`
          <div class="success-icon">✓</div>
          <h2 class="title">Locker Opened!</h2>
          <p class="subtitle">Place your package inside</p>
          <div class="info-box">
            <p class="subtitle">Your Pickup Code:</p>
            <div class="code-display">${pickupCode}</div>
            <p class="subtitle">Save this code to retrieve your package!</p>
          </div>
          <div class="info-box">
            <p><span class="label">Locker:</span> <span class="value">${box?.locker?.name || 'L'}-${box?.number}</span></p>
          </div>
          <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      } catch (err) {
        console.error('Drop-off error:', err);
        const html = renderPage(`
          <h2 class="title">Error</h2>
          <p class="subtitle error">Something went wrong. Please try again.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }
    }
  }

  // PICKUP FLOW
  if (flow === 'pickup') {
    // Step 2: Find package
    if (step === '2') {
      const code = formData.get('code') as string;

      const pkg = await prisma.package.findFirst({
        where: { pickupCode: code, status: 'STORED' },
        include: { box: { include: { locker: true } }, customer: true }
      });

      if (!pkg) {
        const html = renderPage(`
          <h2 class="title">Not Found</h2>
          <p class="subtitle error">No package found with code: ${code}</p>
          <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
          <a href="/kiosk-lite" class="btn btn-back">Back to Home</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }

      const html = renderPage(`
        <h2 class="title">Package Found</h2>
        <p class="subtitle">Locker: ${pkg.box?.locker?.name || 'L'}-${pkg.box?.number}</p>
        <div class="info-box">
          <p><span class="label">Customer:</span> <span class="value">${pkg.customer?.name || 'N/A'}</span></p>
          <p><span class="label">Locker:</span> <span class="value">${pkg.box?.locker?.name || 'L'}-${pkg.box?.number}</span></p>
        </div>
        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
          <input type="hidden" name="step" value="3">
          <input type="hidden" name="packageId" value="${pkg.id}">
          <button type="submit" class="btn btn-success">OPEN LOCKER</button>
        </form>
        <a href="/kiosk-lite?action=pickup" class="btn btn-back">Back</a>
      `);
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Step 3: Complete pickup
    if (step === '3') {
      const packageId = formData.get('packageId') as string;

      try {
        const pkg = await prisma.package.findUnique({
          where: { id: packageId },
          include: { box: { include: { locker: true } } }
        });

        if (!pkg) {
          const html = renderPage(`
            <h2 class="title">Error</h2>
            <p class="subtitle error">Package not found</p>
            <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
          `);
          return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
        }

        await prisma.package.update({
          where: { id: packageId },
          data: { status: 'PICKED_UP', pickedUpAt: new Date() }
        });

        if (pkg.boxId) {
          await prisma.box.update({
            where: { id: pkg.boxId },
            data: { status: 'AVAILABLE' }
          });
        }

        const html = renderPage(`
          <div class="success-icon">✓</div>
          <h2 class="title">Locker Opened!</h2>
          <p class="subtitle">Locker: ${pkg.box?.locker?.name || 'L'}-${pkg.box?.number}</p>
          <div class="info-box">
            <p class="subtitle">Please take your package and close the door.</p>
          </div>
          <a href="/kiosk-lite" class="btn btn-primary">DONE</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      } catch (err) {
        console.error('Pickup error:', err);
        const html = renderPage(`
          <h2 class="title">Error</h2>
          <p class="subtitle error">Something went wrong. Please try again.</p>
          <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
        `);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      }
    }
  }

  // Default redirect
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}
