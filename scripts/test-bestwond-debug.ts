// Test script to debug Bestwond API calls
// Run with: bun run scripts/test-bestwond-debug.ts

import crypto from 'crypto';

const APP_ID = 'bw_86b83996147111f';
const APP_SECRET = '86b83aa4147111f18bd500163e198b20';
const BASE_URL = 'https://api.bestwond.com';
const DEVICE_ID = '2100018247'; // Correct device ID

// Generate Unix timestamp in seconds
function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Generate SHA512 signature
async function generateSignature(params: Record<string, string | number>, appSecret: string): Promise<string> {
  // Sort parameters alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  
  // Build URL-encoded string
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  // Append app secret
  const stringToSign = `${encodedParams}${appSecret}`;
  
  console.log('String to sign:', stringToSign.substring(0, 100) + '...');
  
  // SHA512 hash using Web Crypto API
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function testDeviceStatus() {
  console.log('\n=== TEST 1: Device Status ===');
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
  };
  
  console.log('Params:', params);
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/device/line/status/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testBoxList() {
  console.log('\n=== TEST 2: Box List ===');
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
  };
  
  console.log('Params:', params);
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/device/box/list/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 2000));
    
    if (data.data && Array.isArray(data.data)) {
      console.log(`\nTotal boxes: ${data.data.length}`);
      console.log('First 3 boxes:', JSON.stringify(data.data.slice(0, 3), null, 2));
    }
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testOpenBox(boxNo: number) {
  console.log('\n=== TEST 3: Open Box ===');
  
  // First get box list to find lock_address
  const boxListParams: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
  };
  
  const boxListSig = await generateSignature(boxListParams, APP_SECRET);
  const boxListUrl = `${BASE_URL}/api/iot/device/box/list/?sign=${boxListSig}`;
  
  let lockAddress = `01${boxNo.toString(16).toLowerCase().padStart(2, '0')}`; // Default HEX format
  
  try {
    const boxListResponse = await fetch(boxListUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxListParams),
    });
    const boxListData = await boxListResponse.json();
    
    if (boxListData.code === 0 && boxListData.data) {
      const box = boxListData.data.find((b: { box_name: string }) => parseInt(b.box_name, 10) === boxNo);
      if (box?.lock_address) {
        lockAddress = box.lock_address;
        console.log(`Found lock_address for box ${boxNo}:`, lockAddress);
      }
    }
  } catch (e) {
    console.log('Could not fetch box list, using default lock_address:', lockAddress);
  }
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
    lock_address: lockAddress,
    use_type: 'S', // Single open
  };
  
  console.log('Params:', { ...params, app_id: APP_ID.substring(0, 10) + '...' });
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/open/box/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testExpressSaveOrder() {
  console.log('\n=== TEST 4: Express Save Order ===');
  
  const orderNo = `TEST-${Date.now()}`;
  const boxSize = 'M';
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
    order_no: orderNo,
    box_size: boxSize,
  };
  
  console.log('Params:', { ...params, app_id: APP_ID.substring(0, 10) + '...' });
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/kd/set/save/order/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testExpressSaveOrTake(actionCode: string, actionType: 'save' | 'take') {
  console.log(`\n=== TEST 5: Express ${actionType.toUpperCase()} ===`);
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
    box_size: 'M',
    action_code: actionCode,
    action_type: actionType,
  };
  
  console.log('Params:', { ...params, app_id: APP_ID.substring(0, 10) + '...', action_code: actionCode });
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/kd/order/save/or/take/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testDoorStatus(lockAddress: string) {
  console.log('\n=== TEST 6: Door Status ===');
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
    lock_address: lockAddress,
  };
  
  console.log('Params:', params);
  
  const signature = await generateSignature(params, APP_SECRET);
  console.log('Signature:', signature.substring(0, 32) + '...');
  
  const url = `${BASE_URL}/api/iot/device/box/status/?sign=${signature}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Run all tests
async function main() {
  console.log('========================================');
  console.log('Bestwond API Debug Test');
  console.log('========================================');
  console.log('APP_ID:', APP_ID);
  console.log('APP_SECRET:', APP_SECRET.substring(0, 8) + '...');
  console.log('DEVICE_ID:', DEVICE_ID);
  console.log('BASE_URL:', BASE_URL);
  
  // Test 1: Device Status
  await testDeviceStatus();
  
  // Test 2: Box List
  const boxList = await testBoxList();
  
  // Test 3: Open Box (box 1)
  // await testOpenBox(1);
  
  // Test 4: Express Save Order
  // const orderResult = await testExpressSaveOrder();
  // if (orderResult?.data?.save_code) {
  //   console.log('\n*** Save code generated:', orderResult.data.save_code);
  //   console.log('*** Pick code generated:', orderResult.data.pick_code);
  //   
  //   // Test 5: Use the save code
  //   await testExpressSaveOrTake(orderResult.data.save_code, 'save');
  // }
  
  // Test 6: Door Status for a box
  // await testDoorStatus('0101'); // box 1
  
  console.log('\n========================================');
  console.log('Tests Complete');
  console.log('========================================');
}

main().catch(console.error);
