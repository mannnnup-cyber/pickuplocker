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

  console.log(`\nCalling: ${endpoint}`);
  
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
    return { raw: text };
  }
}

async function main() {
  console.log('=== Verifying Order in System ===');
  console.log('');
  
  // The order we created
  const orderNo = 'V5-1772939086496';
  
  // Check box list - should show if box 12 is occupied
  console.log('1. Checking box list...');
  const boxList = await callApi('/api/iot/device/box/list/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
  });
  
  if (boxList.code === 0 && boxList.data) {
    const box12 = boxList.data.find((b: any) => b.box_name === '12');
    if (box12) {
      console.log('Box 12 status:');
      console.log('  - Order No:', box12.order_no || 'EMPTY');
      console.log('  - Status:', box12.order_no ? 'OCCUPIED' : 'AVAILABLE');
    }
  }
  
  // Check box logs for this order
  console.log('\n2. Checking box logs for box 12...');
  const boxLog = await callApi('/api/iot/device/box/log/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    box_name: '12',
    page_num: 1,
    page_size: 10,
  });
  
  if (boxLog.code === 0 && boxLog.data?.list) {
    console.log('Recent logs for box 12:', boxLog.data.list.length);
    boxLog.data.list.slice(0, 3).forEach((log: any) => {
      console.log(`  ${log.action_time}: ${log.remark}`);
    });
  }
  
  // Try to get order info
  console.log('\n3. Checking order info...');
  const orderInfo = await callApi('/api/iot/kd/get/order/info/', {
    app_id: appId,
    timestamps: getTimestamp(),
    device_number: deviceId,
    order_no: orderNo,
  });
  
  console.log('Order Info Result:', JSON.stringify(orderInfo, null, 2));
}

main();
