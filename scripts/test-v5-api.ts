import crypto from 'crypto';

// v5 CW01 Demo API endpoints
const baseUrl = 'https://api.bestwond.com';
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

async function callApi(endpoint: string, params: Record<string, string | number>) {
  const signature = await generateSignature(params, appSecret);
  const url = `${baseUrl}${endpoint}?sign=${signature}`;

  console.log(`\nCalling: ${endpoint}`);
  console.log('Params:', JSON.stringify(params, null, 2));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PickupLocker/1.0',
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  console.log('Response:', text.substring(0, 500));
  
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  console.log('=== Testing v5 Order APIs ===');
  console.log('');

  const orderNo = `V5-${Date.now()}`;

  // Test 1: Set save order (v5 version)
  const params1: Record<string, string | number> = {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    user_id: 'user123',
    code: '123456',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
  
  const result1 = await callApi('/api/iot/v5/set/save/order/', params1);
  
  // Test 2: Sync save order
  const params2: Record<string, string | number> = {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    order_no: orderNo,
    box_size: 'L',
  };
  
  const result2 = await callApi('/api/iot/sync/save/order/', params2);
  
  // Test 3: Get can save boxes
  const params3: Record<string, string | number> = {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    box_size: 'L',
  };
  
  const result3 = await callApi('/api/iot/v5/get/can/save/box/', params3);
}

main();
