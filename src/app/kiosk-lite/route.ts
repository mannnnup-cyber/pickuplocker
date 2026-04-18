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
      -webkit-appearance: none;
      appearance: none;
      -webkit-tap-highlight-color: rgba(0,0,0,0);
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
      text-decoration: none;
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
      -webkit-appearance: none;
      appearance: none;
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
      -webkit-appearance: none;
      appearance: none;
      -webkit-tap-highlight-color: rgba(0,0,0,0);
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
    .code-display {
      text-align: center;
      font-size: 48px;
      color: #ee6c4d;
      font-weight: bold;
      padding: 20px;
      background: #0d1b2a;
      border-radius: 10px;
      margin: 15px 0;
      border: 2px solid #3d5a80;
      letter-spacing: 8px;
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
    .error-msg {
      color: #ff6b6b;
      text-align: center;
      margin-bottom: 15px;
      font-size: 16px;
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

// GET handler - display screens only
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const error = searchParams.get('error');

  // Home screen
  if (!action) {
    return new NextResponse(html(`
      <div class="screen active" id="home">
        <h2 class="title">Welcome</h2>
        <p class="subtitle">What would you like to do?</p>

        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
          <input type="hidden" name="step" value="1">
          <button type="submit" class="btn btn-primary">DROP-OFF</button>
        </form>

        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
          <input type="hidden" name="step" value="1">
          <button type="submit" class="btn btn-secondary">PICKUP</button>
        </form>
      </div>
    `), { headers: { 'Content-Type': 'text/html' } });
  }

  // DROP-OFF: Enter customer info
  if (action === 'dropoff') {
    return new NextResponse(html(`
      <div class="screen active">
        <h2 class="title">Drop-Off</h2>
        <p class="subtitle">Step 1: Customer Information</p>

        ${error ? `<p class="error-msg">${error}</p>` : ''}

        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="dropoff">
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

  // PICKUP: Enter pickup code
  if (action === 'pickup') {
    return new NextResponse(html(`
      <div class="screen active">
        <h2 class="title">Pickup</h2>
        <p class="subtitle">Enter your pickup code</p>

        ${error ? `<p class="error-msg">${error}</p>` : ''}

        <form action="/api/kiosk-action" method="POST">
          <input type="hidden" name="flow" value="pickup">
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

  // Default to home
  return new NextResponse(html(`
    <div class="screen active" id="home">
      <h2 class="title">Welcome</h2>
      <p class="subtitle">What would you like to do?</p>

      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="1">
        <button type="submit" class="btn btn-primary">DROP-OFF</button>
      </form>

      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="pickup">
        <input type="hidden" name="step" value="1">
        <button type="submit" class="btn btn-secondary">PICKUP</button>
      </form>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}

// POST handler - redirect to GET for simple navigation, 
// or forward to /api/kiosk-action for data processing
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const flow = formData.get('flow') as string;
  const step = formData.get('step') as string;

  // Step 1: Just redirect to the appropriate GET page for form entry
  if (step === '1') {
    if (flow === 'dropoff') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=dropoff', request.url));
    }
    if (flow === 'pickup') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=pickup', request.url));
    }
  }

  // All other steps should be handled by /api/kiosk-action
  // But just in case someone POSTs here directly, redirect to home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}
