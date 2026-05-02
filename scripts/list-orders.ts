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
  const signature = await generateSignature(params, appSecret);
  const url = `${baseUrl}${endpoint}?sign=${signature}`;

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
  console.log('=== Checking for Orders in System ===\n');

  // Check v5 get orders
  console.log('1. Getting v5 orders list...');
  const orders = await callApi('/api/iot/v5/get/orders/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    page_num: 1,
    page_size: 20,
  });
  console.log('v5 Orders:', JSON.stringify(orders, null, 2).substring(0, 1000));

  // Check KD get order info for the order we created
  console.log('\n2. Checking KD order info...');
  const kdOrder = await callApi('/api/iot/kd/get/order/info/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    order_no: 'V5-1772939086496',
  });
  console.log('KD Order:', JSON.stringify(kdOrder, null, 2));

  // Get device box used info
  console.log('\n3. Checking box used info...');
  const usedInfo = await callApi('/api/iot/kd/device/box/used/info/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
  });
  console.log('Used Info:', JSON.stringify(usedInfo, null, 2).substring(0, 500));
}

main();
