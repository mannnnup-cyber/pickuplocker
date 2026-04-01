import { createHash } from 'crypto';

const baseUrl = 'https://mlkd.bestwond.com';
const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';

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
  courier_password: 'Andre2776@',
};

console.log('Order:', orderNo);
console.log('Courier: AndreBrown / Andre2776@\n');

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
