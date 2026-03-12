import crypto from 'crypto';

// Try BOTH base URLs and see which one works
const baseUrls = [
  'https://api.bestwond.com',
  'https://mlkd.bestwond.com',
];

const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';
const deviceId = '2100018247';

function getTimestamp(): number {
  return Date.now();
}

function urlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/%20/g, '+');
}

async function generateSignature(params: Record<string, string | number>, secret: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  
  let d = '';
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const isLast = i === sortedKeys.length - 1;
    
    if (isLast) {
      d += key + '=' + urlEncode(String(params[key])) + secret;
    } else {
      d += key + '=' + urlEncode(String(params[key])) + '&';
    }
  }
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(d);
  const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const orderNo = `SYNC-${Date.now()}`;

const params: Record<string, string | number> = {
  app_id: appId,
  timestamps: getTimestamp(),
  device_id: deviceId,
  order_number: orderNo,
  user_mobile: '8761234567',
  user_email: 'test@pickup.com',
  courier_account: '123',
  courier_password: '123',
};

console.log('=== Testing Third Party Sync API ===');
console.log('Order Number:', orderNo);
console.log('Courier: 123 / 123');
console.log('');

async function testApi(baseUrl: string) {
  console.log(`\n--- Testing base URL: ${baseUrl} ---`);
  
  try {
    const signature = await generateSignature(params, appSecret);
    const url = `${baseUrl}/api/third/sync/kd/order/?sign=${signature}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });

    const text = await response.text();
    console.log('Response:', text.substring(0, 300));
    
    try {
      const data = JSON.parse(text);
      if (data.code === 0) {
        console.log('\n✅ SUCCESS!');
        return true;
      }
    } catch (e) {}
  } catch (error) {
    console.log('Error:', error);
  }
  return false;
}

async function main() {
  for (const baseUrl of baseUrls) {
    const success = await testApi(baseUrl);
    if (success) break;
  }
}

main();
