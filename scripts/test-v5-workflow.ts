import crypto from 'crypto';

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
  params.app_id = appId;
  params.timestamps = getTimestamp();
  
  const signature = await generateSignature(params, appSecret);
  const url = `${baseUrl}${endpoint}?sign=${signature}`;

  console.log(`\n=== ${endpoint} ===`);
  console.log('Params:', JSON.stringify(params));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PickupLocker/1.0',
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.substring(0, 300) };
  }
}

async function main() {
  console.log('=== Testing v5 Workflow ===');
  console.log('Device:', deviceId);
  console.log('App ID:', appId);

  // Step 1: Set save order
  const orderCode = 'USER' + Date.now();
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const step1 = await callApi('/api/iot/v5/set/save/order/', {
    device_number: deviceId,
    user_id: 'COURIER_123',  // Courier account
    code: orderCode,
    start_date: startDate,
    end_date: endDate,
  });
  console.log('Step 1 Result:', JSON.stringify(step1, null, 2));

  // Step 2: Get available boxes
  const step2 = await callApi('/api/iot/v5/get/can/save/box/', {
    device_number: deviceId,
    box_size: 'L',
  });
  console.log('Step 2 Available Boxes:', JSON.stringify(step2, null, 2).substring(0, 500));

  // Step 3: Get order
  const step3 = await callApi('/api/iot/v5/get/order/', {
    device_number: deviceId,
    user_id: 'COURIER_123',
    code: orderCode,
  });
  console.log('Step 3 Order:', JSON.stringify(step3, null, 2));
}

main();
