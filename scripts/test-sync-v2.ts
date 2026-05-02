import crypto from 'crypto';

// Jamaica demo base URL
const baseUrl = 'https://mlkd.bestwond.com';
const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';

function getTimestamp(): number {
  return Date.now();
}

// Python-style URL encoding (like the demo uses)
function createSign(params: Record<string, string | number>, secret: string): string {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  
  // Build URL-encoded string
  const encodedParts: string[] = [];
  for (const key of sortedKeys) {
    // Standard URL encoding (like Python's urlencode)
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(params[key]));
    encodedParts.push(`${encodedKey}=${encodedValue}`);
  }
  
  // Join with &
  const paramsStr = encodedParts.join('&');
  
  // Append secret
  const stringToSign = paramsStr + secret;
  
  console.log('String to sign:', stringToSign.substring(0, 150) + '...');
  
  // SHA-512
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToSign);
  const hashBuffer = crypto.subtle.digestSync('SHA-512', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log('=== Testing Sync API v2 ===\n');

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
  
  const signature = createSign(params, appSecret);
  const url = `${baseUrl}/api/third/sync/kd/order/?sign=${signature}`;

  console.log('Signature:', signature.substring(0, 40) + '...\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const text = await response.text();
    console.log('Response:', text);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
