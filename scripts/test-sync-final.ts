import { createHash } from 'crypto';

// Jamaica demo base URL  
const baseUrl = 'https://mlkd.bestwond.com';
const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';

function getTimestamp(): number {
  return Date.now();
}

function createSign(params: Record<string, string | number>, secret: string): string {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  
  // Build URL-encoded string
  const encodedParts: string[] = [];
  for (const key of sortedKeys) {
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(params[key]));
    encodedParts.push(`${encodedKey}=${encodedValue}`);
  }
  
  // Join with &
  const paramsStr = encodedParts.join('&');
  
  // Append secret
  const stringToSign = paramsStr + secret;
  
  // SHA-512
  return createHash('sha512').update(stringToSign).digest('hex');
}

console.log('=== Testing Third Party Sync API ===\n');

const orderNo = 'TEST' + Date.now();

const params: Record<string, string | number> = {
  app_id: appId,
  timestamps: getTimestamp(),
  device_id: '2100018247',
  order_number: orderNo,
  user_mobile: '8761234567',
  user_email: 'test@pickup.com',
  courier_account: '123',
  courier_password: '123',
};

console.log('Order:', orderNo);
console.log('Courier: 123 / 123\n');

const signature = createSign(params, appSecret);
const url = `${baseUrl}/api/third/sync/kd/order/?sign=${signature}`;

console.log('Signature:', signature.substring(0, 40) + '...\n');

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
        console.log('\nTest at locker:');
        console.log('1. Select "Drop off"');
        console.log('2. Login: 123 / 123');
        console.log('3. Tracking:', orderNo);
      }
    } catch {}
  })
  .catch(e => console.error('Error:', e));
