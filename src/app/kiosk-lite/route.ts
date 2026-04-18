import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// HTML escape function to prevent XSS
function esc(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared CSS - Android 5.1 compatible (no CSS Grid, webkit prefixes)
const SHARED_CSS = `
  * { -webkit-box-sizing: border-box; box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: -webkit-linear-gradient(135deg, #111111 0%, #1a1a2e 100%);
    background: linear-gradient(135deg, #111111 0%, #1a1a2e 100%);
    min-height: 100vh;
    color: #ffffff;
    -webkit-text-size-adjust: 100%;
  }
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    text-align: center;
    padding: 20px 0;
    border-bottom: 3px solid #FFD439;
    margin-bottom: 25px;
  }
  .header h1 {
    font-size: 32px;
    color: #FFD439;
    letter-spacing: 3px;
  }
  .header p {
    color: #999999;
    margin-top: 5px;
    font-size: 14px;
  }
  .title {
    text-align: center;
    font-size: 26px;
    margin-bottom: 20px;
    color: #FFD439;
    font-weight: bold;
  }
  .subtitle {
    text-align: center;
    font-size: 16px;
    color: #999999;
    margin-bottom: 20px;
  }
  .btn {
    display: block;
    width: 100%;
    padding: 22px 20px;
    margin: 12px 0;
    font-size: 22px;
    font-weight: bold;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    text-decoration: none;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    min-height: 48px;
  }
  .btn-primary {
    background: #FFD439;
    color: #111111;
  }
  .btn-primary:hover, .btn-primary:active {
    background: #e6c035;
  }
  .btn-secondary {
    background: #333333;
    color: #ffffff;
    border: 2px solid #FFD439;
  }
  .btn-secondary:hover, .btn-secondary:active {
    background: #444444;
  }
  .btn-success {
    background: #4CAF50;
    color: white;
  }
  .btn-success:hover, .btn-success:active {
    background: #45a049;
  }
  .btn-back {
    display: inline-block;
    background: transparent;
    border: 2px solid #666666;
    color: #999999;
    padding: 14px 30px;
    font-size: 16px;
    font-weight: bold;
    border-radius: 8px;
    text-decoration: none;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
  }
  .form-group {
    margin-bottom: 20px;
  }
  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 16px;
    color: #FFD439;
    font-weight: bold;
  }
  .form-group input {
    width: 100%;
    padding: 18px;
    font-size: 24px;
    border: 2px solid #333333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #ffffff;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    text-align: center;
    letter-spacing: 5px;
  }
  .form-group input:focus {
    outline: none;
    border-color: #FFD439;
  }
  .info-box {
    background: #1a1a1a;
    padding: 20px;
    border-radius: 10px;
    margin: 15px 0;
    border: 1px solid #333333;
  }
  .info-box p {
    margin: 8px 0;
    font-size: 16px;
  }
  .label {
    color: #999999;
  }
  .value {
    color: #ffffff;
    font-weight: bold;
  }
  .code-display {
    text-align: center;
    font-size: 48px;
    color: #FFD439;
    font-weight: bold;
    padding: 25px;
    background: #1a1a1a;
    border-radius: 10px;
    margin: 15px 0;
    border: 2px solid #FFD439;
    letter-spacing: 10px;
  }
  .success-icon {
    text-align: center;
    font-size: 72px;
    color: #4CAF50;
    margin: 15px 0;
  }
  .error-msg {
    color: #ff6b6b;
    text-align: center;
    margin-bottom: 15px;
    font-size: 16px;
  }
  .nav-buttons {
    margin-top: 25px;
  }
  .box-grid {
    display: -webkit-flex;
    display: flex;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    margin: 15px -5px;
  }
  .box-option {
    -webkit-flex: 0 0 calc(50% - 10px);
    flex: 0 0 calc(50% - 10px);
    margin: 5px;
  }
  .box-option .btn {
    margin: 0;
  }
  .box-S { background: #2196F3; color: white; }
  .box-M { background: #4CAF50; color: white; }
  .box-L { background: #FF9800; color: white; }
  .box-XL { background: #9C27B0; color: white; }
  .legend {
    display: -webkit-flex;
    display: flex;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    gap: 10px;
    -webkit-justify-content: center;
    justify-content: center;
    margin: 15px 0;
    font-size: 13px;
  }
  .legend-item {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    gap: 5px;
  }
  .legend-color {
    width: 18px;
    height: 18px;
    border-radius: 3px;
  }
  .option-card {
    background: #1a1a1a;
    border: 2px solid #333333;
    border-radius: 10px;
    padding: 20px;
    margin: 10px 0;
  }
  .option-card h3 {
    color: #FFD439;
    font-size: 18px;
    margin-bottom: 5px;
  }
  .option-card p {
    color: #999999;
    font-size: 14px;
  }
  .payment-details {
    background: #1a1a1a;
    padding: 15px;
    border-radius: 8px;
    margin: 10px 0;
    border: 1px solid #FFD439;
  }
  .qr-container {
    text-align: center;
    padding: 20px;
    background: #ffffff;
    border-radius: 10px;
    margin: 15px auto;
    max-width: 300px;
  }
  .qr-container img {
    max-width: 250px;
  }
  @media (max-width: 480px) {
    .btn { font-size: 18px; padding: 18px 15px; }
    .title { font-size: 22px; }
    .code-display { font-size: 36px; letter-spacing: 6px; }
  }
`;

function renderPage(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no">
  <title>Pickup - Smart Locker</title>
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

const HTML_HEADERS = {
  'Content-Type': 'text/html',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

// GET handler - display screens
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const error = searchParams.get('error');
  const msg = searchParams.get('msg');

  // ---- HOME SCREEN ----
  if (!action) {
    return new NextResponse(renderPage(`
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
      <p style="text-align:center; margin-top:30px; color:#666; font-size:12px;">Available 24/7</p>
    `), { headers: HTML_HEADERS });
  }

  // ---- DROP-OFF OPTIONS ----
  if (action === 'dropoff') {
    return new NextResponse(renderPage(`
      <h2 class="title">Drop-Off</h2>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="enter_save_code">
        <button type="submit" class="btn btn-primary">I have a Drop-off Code</button>
      </form>
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="select_size">
        <button type="submit" class="btn btn-secondary">Buy a Drop-off Code</button>
      </form>
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="courier_login">
        <button type="submit" class="btn btn-secondary">I'm a Courier</button>
      </form>
      <div class="nav-buttons">
        <a href="/kiosk-lite" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- DROP-OFF: ENTER SAVE CODE ----
  if (action === 'dropoff-save') {
    return new NextResponse(renderPage(`
      <h2 class="title">Drop-Off</h2>
      <p class="subtitle">Enter your 6-digit save code</p>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="use_save_code">
        <div class="form-group">
          <label>Save Code</label>
          <input type="text" name="saveCode" required placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric">
        </div>
        <button type="submit" class="btn btn-primary">OPEN LOCKER</button>
      </form>
      <div class="nav-buttons">
        <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- DROP-OFF: SELECT BOX SIZE TO BUY ----
  if (action === 'dropoff-size') {
    return new NextResponse(renderPage(`
      <h2 class="title">Buy a Drop-off Code</h2>
      <p class="subtitle">Select box size - Pay via DimePay QR</p>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background:#2196F3"></div> Small</div>
        <div class="legend-item"><div class="legend-color" style="background:#4CAF50"></div> Medium</div>
        <div class="legend-item"><div class="legend-color" style="background:#FF9800"></div> Large</div>
        <div class="legend-item"><div class="legend-color" style="background:#9C27B0"></div> X-Large</div>
      </div>
      <div class="box-grid">
        <div class="box-option">
          <form action="/api/kiosk-action" method="POST">
            <input type="hidden" name="flow" value="dropoff">
            <input type="hidden" name="step" value="buy_enter_phone">
            <input type="hidden" name="boxSize" value="S">
            <button type="submit" class="btn box-S">Small<br>$150 JMD</button>
          </form>
        </div>
        <div class="box-option">
          <form action="/api/kiosk-action" method="POST">
            <input type="hidden" name="flow" value="dropoff">
            <input type="hidden" name="step" value="buy_enter_phone">
            <input type="hidden" name="boxSize" value="M">
            <button type="submit" class="btn box-M">Medium<br>$200 JMD</button>
          </form>
        </div>
        <div class="box-option">
          <form action="/api/kiosk-action" method="POST">
            <input type="hidden" name="flow" value="dropoff">
            <input type="hidden" name="step" value="buy_enter_phone">
            <input type="hidden" name="boxSize" value="L">
            <button type="submit" class="btn box-L">Large<br>$300 JMD</button>
          </form>
        </div>
        <div class="box-option">
          <form action="/api/kiosk-action" method="POST">
            <input type="hidden" name="flow" value="dropoff">
            <input type="hidden" name="step" value="buy_enter_phone">
            <input type="hidden" name="boxSize" value="XL">
            <button type="submit" class="btn box-XL">X-Large<br>$400 JMD</button>
          </form>
        </div>
      </div>
      <div class="nav-buttons">
        <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- DROP-OFF: BUY - ENTER PHONE ----
  if (action === 'dropoff-phone') {
    const boxSize = searchParams.get('boxSize') || '';
    const prices: Record<string,string> = { S:'150', M:'200', L:'300', XL:'400' };
    const sizeLabels: Record<string,string> = { S:'Small', M:'Medium', L:'Large', XL:'X-Large' };
    return new NextResponse(renderPage(`
      <h2 class="title">Buy Drop-off Code</h2>
      <p class="subtitle">${esc(sizeLabels[boxSize] || boxSize)} - $${prices[boxSize] || '???'} JMD</p>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="buy_create_payment">
        <input type="hidden" name="boxSize" value="${esc(boxSize)}">
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone" required placeholder="876-XXX-XXXX" inputmode="tel">
        </div>
        <div class="form-group">
          <label>Email (Optional)</label>
          <input type="email" name="email" placeholder="you@email.com">
        </div>
        <button type="submit" class="btn btn-primary">PAY NOW</button>
      </form>
      <div class="nav-buttons">
        <a href="/kiosk-lite?action=dropoff-size" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- DROP-OFF: COURIER LOGIN ----
  if (action === 'courier-login') {
    return new NextResponse(renderPage(`
      <h2 class="title">Courier Login</h2>
      <p class="subtitle">Enter your courier PIN</p>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="dropoff">
        <input type="hidden" name="step" value="courier_auth">
        <div class="form-group">
          <label>Courier PIN</label>
          <input type="password" name="pin" required placeholder="Enter PIN" maxlength="6" inputmode="numeric">
        </div>
        <button type="submit" class="btn btn-primary">LOGIN</button>
      </form>
      <div class="nav-buttons">
        <a href="/kiosk-lite?action=dropoff" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- PICKUP: ENTER CODE ----
  if (action === 'pickup') {
    return new NextResponse(renderPage(`
      <h2 class="title">Pickup</h2>
      <p class="subtitle">Enter your 6-digit pickup code</p>
      ${error ? `<p class="error-msg">${esc(error)}</p>` : ''}
      <form action="/api/kiosk-action" method="POST">
        <input type="hidden" name="flow" value="pickup">
        <input type="hidden" name="step" value="lookup">
        <div class="form-group">
          <label>Pickup Code</label>
          <input type="text" name="pickCode" required placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric">
        </div>
        <button type="submit" class="btn btn-primary">FIND MY PACKAGE</button>
      </form>
      <div class="nav-buttons">
        <a href="/kiosk-lite" class="btn btn-back">Back</a>
      </div>
    `), { headers: HTML_HEADERS });
  }

  // ---- ERROR SCREEN ----
  if (action === 'error') {
    return new NextResponse(renderPage(`
      <h2 class="title">Oops!</h2>
      <p class="error-msg">${esc(msg || 'Something went wrong')}</p>
      <a href="/kiosk-lite" class="btn btn-primary">Back to Home</a>
    `), { headers: HTML_HEADERS });
  }

  // Default: home
  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}

// POST handler - only for step=1 redirects
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const flow = formData.get('flow') as string;
  const step = formData.get('step') as string;

  if (step === '1') {
    if (flow === 'dropoff') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=dropoff', request.url));
    }
    if (flow === 'pickup') {
      return NextResponse.redirect(new URL('/kiosk-lite?action=pickup', request.url));
    }
  }

  return NextResponse.redirect(new URL('/kiosk-lite', request.url));
}
