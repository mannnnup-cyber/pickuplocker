// Test Bestwond with CORRECT device ID
import crypto from 'crypto';

const APP_ID = 'bw_86b83996147111f';
const APP_SECRET = '86b83aa4147111f18bd500163e198b20';
const BASE_URL = 'https://api.bestwond.com';
const DEVICE_ID = '2100018247'; // CORRECT device ID!

function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

async function generateSignature(params: Record<string, string | number>, appSecret: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  const stringToSign = `${encodedParams}${appSecret}`;
  
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
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/device/line/status/?sign=${signature}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Device Status:', JSON.stringify(data, null, 2));
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
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/device/box/list/?sign=${signature}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Box List Response code:', data.code, 'msg:', data.msg);
    
    if (data.code === 0 && data.data) {
      console.log(`Found ${data.data.length} boxes`);
      console.log('First 3 boxes:', JSON.stringify(data.data.slice(0, 3), null, 2));
      
      // Show available boxes
      const available = data.data.filter((b: { order_no: string | null }) => !b.order_no);
      console.log(`\nAvailable (empty) boxes: ${available.length}`);
      available.slice(0, 5).forEach((b: { box_name: string; box_size: string }) => {
        console.log(`  Box ${b.box_name} (Size: ${b.box_size || 'unknown'})`);
      });
    }
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testOpenBox(boxNo: number) {
  console.log(`\n=== TEST 3: Open Box ${boxNo} ===`);
  
  // First get box list to find lock_address
  const boxListParams: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
  };
  
  const boxListSig = await generateSignature(boxListParams, APP_SECRET);
  const boxListUrl = `${BASE_URL}/api/iot/device/box/list/?sign=${boxListSig}`;
  
  let lockAddress = `01${boxNo.toString(16).toLowerCase().padStart(2, '0')}`;
  
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
        console.log(`Found lock_address for box ${boxNo}: ${lockAddress}`);
      } else {
        console.log(`Box ${boxNo} not found, using default lock_address: ${lockAddress}`);
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
    use_type: 'S',
  };
  
  console.log('Open box params:', JSON.stringify(params, null, 2));
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/open/box/?sign=${signature}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Open Box Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testExpressOrder() {
  console.log('\n=== TEST 4: Create Express Order ===');
  
  const orderNo = `EXP-${Date.now()}`;
  const boxSize = 'M';
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
    device_number: DEVICE_ID,
    order_no: orderNo,
    box_size: boxSize,
  };
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/kd/set/save/order/?sign=${signature}`;
  
  console.log('Creating order:', orderNo, 'Box size:', boxSize);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Express Order Response:', JSON.stringify(data, null, 2));
    
    if (data.code === 0 && data.data) {
      console.log('\n*** GENERATED CODES ***');
      console.log('Save Code:', data.data.save_code);
      console.log('Pick Code:', data.data.pick_code);
      console.log('Box Name:', data.data.box_name);
    }
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
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/kd/order/save/or/take/?sign=${signature}`;
  
  console.log('Action:', actionType, 'Code:', actionCode);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    const data = await response.json();
    console.log('Express Save/Take Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('Bestwond API Test with CORRECT Device ID');
  console.log('========================================');
  console.log('APP_ID:', APP_ID);
  console.log('DEVICE_ID:', DEVICE_ID, '<-- CORRECT!');
  
  // Test 1: Device status
  const status = await testDeviceStatus();
  
  // Test 2: Box list
  const boxes = await testBoxList();
  
  // Test 3: Open a specific box (uncomment to test)
  // await testOpenBox(1);
  
  // Test 4: Create express order
  const order = await testExpressOrder();
  
  // Test 5: Use the save code (if order was created)
  if (order?.code === 0 && order?.data?.save_code) {
    console.log('\n>>> Now testing save code <<<');
    await testExpressSaveOrTake(order.data.save_code, 'save');
  }
  
  console.log('\n========================================');
  console.log('Tests Complete');
  console.log('========================================');
}

main().catch(console.error);
