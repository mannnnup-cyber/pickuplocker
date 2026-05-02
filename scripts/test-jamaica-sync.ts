import crypto from 'crypto';

// Jamaica demo uses mlkd.bestwond.com base URL
const baseUrl = 'https://mlkd.bestwond.com';
const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';

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

async function main() {
  console.log('=== Testing Jamaica Sync API ===');
  console.log('Base URL:', baseUrl);
  console.log('');

  const orderNo = 'JAM-' + Date.now();
  
  // Exact format from Jamaica demo
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
  console.log('Courier: 123 / 123');
  console.log('');

  const signature = await generateSignature(params, appSecret);
  const url = `${baseUrl}/api/third/sync/kd/order/?sign=${signature}`;

  console.log('String to sign:');
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    console.log(`  ${key}=${params[key]}`);
  }
  console.log('');
  console.log('Signature:', signature.substring(0, 40) + '...');
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const text = await response.text();
    console.log('HTTP Status:', response.status);
    console.log('Response:', text);
    
    try {
      const data = JSON.parse(text);
      if (data.code === 0) {
        console.log('\n✅ SUCCESS!');
        console.log('\nNow test at locker:');
        console.log('1. Select "Drop off"');
        console.log('2. Login: 123 / 123');
        console.log('3. Enter tracking:', orderNo);
      }
    } catch (e) {}
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
