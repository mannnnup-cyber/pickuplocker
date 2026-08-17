import { createHash } from 'crypto';

const baseUrl = 'https://mlkd.bestwond.com';
const appId = process.env.BESTWOND_APP_ID || '';
const appSecret = process.env.BESTWOND_APP_SECRET || '';

if (!appId || !appSecret) {
  console.error('ERROR: Set BESTWOND_APP_ID and BESTWOND_APP_SECRET environment variables.');
  process.exit(1);
}

function getTimestamp(): number {
  return Date.now();
}

function createSign(params: Record<string, string | number>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const encodedParts: string[] = [];
  for (const key of sortedKeys) {
    encodedParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
  }
  return createHash('sha512').update(encodedParts.join('&') + secret).digest('hex');
}

console.log('=== Testing with New Backend Credentials ===\n');

const orderNo = 'ANDRE' + Date.now();

// Try with the backend login credentials as courier account
const params: Record<string, string | number> = {
  app_id: appId,
  timestamps: getTimestamp(),
  device_id: '2100018247',
  order_number: orderNo,
  user_mobile: '8761234567',
  user_email: 'test@pickup.com',
  courier_account: 'AndreBrown',
  courier_password: process.env.TEST_COURIER_PASSWORD || '',
};

if (!params.courier_password) {
  console.error('ERROR: Set TEST_COURIER_PASSWORD environment variable.');
  process.exit(1);
}

console.log('Order:', orderNo);
console.log('Courier:', params.courier_account, '/ [REDACTED]\n');

const signature = createSign(params, appSecret);
const url = `${baseUrl}/api/third/sync/kd/order/?sign=${signature}`;

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(params),
})
  .then(r => r.text())
  .then(text => {
    console.log('Response:', text);
    try {
      const data = JSON.parse(text);
      if (data.code === 0) {
        console.log('\n✅ SUCCESS!');
      }
    } catch {}
  })
  .catch(e => console.error('Error:', e));
