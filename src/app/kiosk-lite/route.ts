import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Simple HTML template for Android 5.1 compatibility
function html(content: string, styles: string = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Smart Locker - Kiosk</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
      min-height: 100vh;
      color: #ffffff;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 2px solid #3d5a80;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 28px;
      color: #ee6c4d;
    }
    .header p {
      color: #98c1d9;
      margin-top: 5px;
    }
    .screen {
      display: none;
    }
    .screen.active {
      display: block;
    }
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
      transition: all 0.3s ease;
    }
    .btn-primary {
      background: #ee6c4d;
      color: white;
    }
    .btn-primary:hover, .btn-primary:active {
      background: #d45a3d;
    }
    .btn-secondary {
      background: #3d5a80;
      color: white;
    }
    .btn-secondary:hover, .btn-secondary:active {
      background: #2d4a70;
    }
    .btn-success {
      background: #4CAF50;
      color: white;
    }
    .btn-success:hover, .btn-success:active {
      background: #45a049;
    }
    .btn-back {
      background: transparent;
      border: 2px solid #98c1d9;
      color: #98c1d9;
      padding: 15px 30px;
      display: inline-block;
      width: auto;
      font-size: 18px;
    }
    .title {
      text-align: center;
      font-size: 28px;
      margin-bottom: 30px;
      color: #ee6c4d;
    }
    .subtitle {
      text-align: center;
      font-size: 18px;
      color: #98c1d9;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 18px;
      color: #98c1d9;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 15px;
      font-size: 20px;
      border: 2px solid #3d5a80;
      border-radius: 8px;
      background: #0d1b2a;
      color: white;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: #ee6c4d;
    }
    .box-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 20px 0;
    }
    .box-btn {
      padding: 20px;
      font-size: 20px;
      background: #3d5a80;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    .box-btn:disabled {
      background: #1e3a5f;
      color: #666;
      cursor: not-allowed;
    }
    .box-btn.selected {
      background: #ee6c4d;
    }
    .box-btn.small { background: #2196F3; }
    .box-btn.medium { background: #4CAF50; }
    .box-btn.large { background: #FF9800; }
    .box-btn.xlarge { background: #9C27B0; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      margin: 20px 0;
      font-size: 14px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
    .qr-container {
      text-align: center;
      padding: 20px;
      background: white;
      border-radius: 10px;
      margin: 20px 0;
    }
    .qr-container img {
      max-width: 250px;
    }
    .success-icon {
      text-align: center;
      font-size: 80px;
      color: #4CAF50;
      margin: 20px 0;
    }
    .info-box {
      background: #1e3a5f;
      padding: 20px;
      border-radius: 10px;
      margin: 15px 0;
    }
    .info-box p {
      margin: 10px 0;
      font-size: 18px;
    }
    .info-box .label {
      color: #98c1d9;
    }
    .info-box .value {
      color: white;
      font-weight: bold;
    }
    .payment-details {
      background: #0d1b2a;
      padding: 15px;
      border-radius: 8px;
      margin: 10px 0;
      border: 1px solid #3d5a80;
    }
    .payment-details p {
      margin: 8px 0;
    }
    .nav-buttons {
      display: flex;
      justify-content: space-between;
      margin-top: 30px;
    }
    .center {
      text-align: center;
    }
    @media (max-width: 480px) {
      .box-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .btn {
        font-size: 20px;
        padding: 20px;
      }
    }
    ${styles}
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

// Home Screen
function homeScreen() {
  return html(`
    <div class="screen active" id="home">
      <h2 class="title">Welcome</h2>
      <p class="subtitle">What would you like to do?</p>
      
      <form action="/kiosk-lite?action=dropoff" method="get">
        <button type="submit" class="btn btn-primary">DROP-OFF</button>
      </form>
      
      <form action="/kiosk-lite?action=pickup" method="get">
        <button type="submit" class="btn btn-secondary">PICKUP</button>
      </form>
    </div>
  `);
}

// GET handler - display screens
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const step = searchParams.get('step');
  const boxId = searchParams.get('boxId');
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Home screen
  if (!action) {
    return new NextResponse(homeScreen(), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // DROP-OFF flow
  if (action === 'dropoff') {
    if (!step) {
      // Step 1: Enter customer info
      return new NextResponse(html(`
        <div class="screen active">
          <h2 class="title">Drop-Off</h2>
          <p class="subtitle">Step 1: Customer Information</p>
          
          ${error ? `<p style="color: #ff6b6b; text-align: center;">${error}</p>` : ''}
          
          <form action="/kiosk-lite" method="get">
            <input type="hidden" name="action" value="dropoff">
            <input type="hidden" name="step" value="2">
            
            <div class="form-group">
              <label>Customer Name</label>
              <input type="text" name="name" required placeholder="Enter name">
            </div>
            
            <div class="form-group">
              <label>Phone Number</label>
              <input type="tel" name="phone" required placeholder="Enter phone">
            </div>
            
            <div class="form-group">
              <label>Email (Optional)</label>
              <input type="email" name="email" placeholder="Enter email">
            </div>
            
            <button type="submit" class="btn btn-primary">Continue</button>
          </form>
          
          <div class="nav-buttons">
            <a href="/kiosk-lite" class="btn btn-back">Back</a>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }

    if (step === '2') {
      const name = searchParams.get('name');
      const phone = searchParams.get('phone');
      const email = searchParams.get('email');

      if (!name || !phone) {
        return NextResponse.redirect(new URL('/kiosk-lite?action=dropoff&error=Name and phone are required', request.url));
      }

      // Get available boxes
      const boxes = await prisma.box.findMany({
        where: { status: 'AVAILABLE' },
        include: { locker: true },
        orderBy: [{ locker: { name: 'asc' } }, ['S', 'M', 'L', 'XL'].indexOf('size') === -1 ? 999 : ['S', 'M', 'L', 'XL'].indexOf('size')]
      });

      if (boxes.length === 0) {
        return new NextResponse(html(`
          <div class="screen active">
            <h2 class="title">No Lockers Available</h2>
            <p class="subtitle" style="color: #ff6b6b;">All lockers are currently in use.</p>
            <p style="text-align: center; margin: 20px 0;">Please try again later or contact support.</p>
            <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
          </div>
        `), { headers: { 'Content-Type': 'text/html' } });
      }

      // Group boxes by size
      const sizeColors: Record<string, string> = {
        'S': 'small',
        'M': 'medium', 
        'L': 'large',
        'XL': 'xlarge'
      };

      const boxButtons = boxes.map(box => 
        `<button type="submit" name="boxId" value="${box.id}" class="box-btn ${sizeColors[box.size] || ''}">${box.locker?.name || 'L'}-${box.number}</button>`
      ).join('');

      return new NextResponse(html(`
        <div class="screen active">
          <h2 class="title">Select Locker</h2>
          <p class="subtitle">Step 2: Choose an available locker</p>
          
          <div class="legend">
            <div class="legend-item"><div class="legend-color" style="background: #2196F3;"></div> Small</div>
            <div class="legend-item"><div class="legend-color" style="background: #4CAF50;"></div> Medium</div>
            <div class="legend-item"><div class="legend-color" style="background: #FF9800;"></div> Large</div>
            <div class="legend-item"><div class="legend-color" style="background: #9C27B0;"></div> X-Large</div>
          </div>
          
          <form action="/kiosk-lite" method="get">
            <input type="hidden" name="action" value="dropoff">
            <input type="hidden" name="step" value="3">
            <input type="hidden" name="name" value="${name}">
            <input type="hidden" name="phone" value="${phone}">
            <input type="hidden" name="email" value="${email || ''}">
            
            <div class="box-grid">
              ${boxButtons}
            </div>
          </form>
          
          <div class="nav-buttons">
            <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }

    if (step === '3' && boxId) {
      const name = searchParams.get('name');
      const phone = searchParams.get('phone');
      const email = searchParams.get('email');

      // Get box details
      const box = await prisma.box.findUnique({
        where: { id: boxId },
        include: { locker: true }
      });

      if (!box) {
        return NextResponse.redirect(new URL('/kiosk-lite?action=dropoff&error=Locker not found', request.url));
      }

      // Generate pickup code
      const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

      return new NextResponse(html(`
        <div class="screen active">
          <h2 class="title">Confirm Drop-Off</h2>
          <p class="subtitle">Step 3: Review and confirm</p>
          
          <div class="info-box">
            <p><span class="label">Locker:</span> <span class="value">${box.locker?.name || 'L'}-${box.number}</span></p>
            <p><span class="label">Size:</span> <span class="value">${box.size}</span></p>
            <p><span class="label">Customer:</span> <span class="value">${name}</span></p>
            <p><span class="label">Phone:</span> <span class="value">${phone}</span></p>
            ${email ? `<p><span class="label">Email:</span> <span class="value">${email}</span></p>` : ''}
          </div>
          
          <form action="/kiosk-lite" method="post">
            <input type="hidden" name="action" value="dropoff">
            <input type="hidden" name="boxId" value="${boxId}">
            <input type="hidden" name="name" value="${name}">
            <input type="hidden" name="phone" value="${phone}">
            <input type="hidden" name="email" value="${email || ''}">
            
            <button type="submit" class="btn btn-success">CONFIRM - OPEN LOCKER</button>
          </form>
          
          <div class="nav-buttons">
            <a href="/kiosk-lite?action=dropoff&step=2&name=${encodeURIComponent(name || '')}&phone=${encodeURIComponent(phone || '')}&email=${encodeURIComponent(email || '')}" class="btn btn-back">Back</a>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }
  }

  // PICKUP flow
  if (action === 'pickup') {
    if (!step) {
      return new NextResponse(html(`
        <div class="screen active">
          <h2 class="title">Pickup</h2>
          <p class="subtitle">Enter your pickup code</p>
          
          ${error ? `<p style="color: #ff6b6b; text-align: center;">${error}</p>` : ''}
          
          <form action="/kiosk-lite" method="get">
            <input type="hidden" name="action" value="pickup">
            <input type="hidden" name="step" value="2">
            
            <div class="form-group">
              <label>Pickup Code</label>
              <input type="text" name="code" required placeholder="Enter 4-digit code" maxlength="4" pattern="[0-9]{4}">
            </div>
            
            <button type="submit" class="btn btn-primary">Find Package</button>
          </form>
          
          <div class="nav-buttons">
            <a href="/kiosk-lite" class="btn btn-back">Back</a>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }

    if (step === '2' && code) {
      // Find package by pickup code
      const pkg = await prisma.package.findFirst({
        where: { 
          pickupCode: code,
          status: { in: ['STORED', 'PAYMENT_PENDING'] }
        },
        include: { 
          box: { include: { locker: true } },
          customer: true
        }
      });

      if (!pkg) {
        return new NextResponse(html(`
          <div class="screen active">
            <h2 class="title">Not Found</h2>
            <p class="subtitle" style="color: #ff6b6b;">No package found with code: ${code}</p>
            <p style="text-align: center; margin: 20px 0;">Please check your code and try again.</p>
            <a href="/kiosk-lite?action=pickup" class="btn btn-primary">Try Again</a>
            <a href="/kiosk-lite" class="btn btn-back">Back to Home</a>
          </div>
        `), { headers: { 'Content-Type': 'text/html' } });
      }

      const lockerName = pkg.box?.locker?.name || 'L';
      const boxNumber = pkg.box?.number || '?';
      const customerName = pkg.customer?.name || 'Customer';
      const hasPayment = pkg.status === 'PAYMENT_PENDING';

      return new NextResponse(html(`
        <div class="screen active">
          <h2 class="title">Package Found</h2>
          <p class="subtitle">Locker: ${lockerName}-${boxNumber}</p>
          
          <div class="info-box">
            <p><span class="label">Customer:</span> <span class="value">${customerName}</span></p>
            <p><span class="label">Locker:</span> <span class="value">${lockerName}-${boxNumber}</span></p>
            <p><span class="label">Dropped:</span> <span class="value">${pkg.createdAt?.toLocaleDateString() || 'N/A'}</span></p>
            ${hasPayment ? `<p style="color: #ee6c4d; font-weight: bold;">Payment Required</p>` : ''}
          </div>
          
          <form action="/kiosk-lite" method="post">
            <input type="hidden" name="action" value="pickup">
            <input type="hidden" name="code" value="${code}">
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
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }
  }

  // Default to home
  return new NextResponse(homeScreen(), {
    headers: { 'Content-Type': 'text/html' },
  });
}

// POST handler - process actions
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get('action') as string;

  // DROP-OFF submission
  if (action === 'dropoff') {
    const boxId = formData.get('boxId') as string;
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email
