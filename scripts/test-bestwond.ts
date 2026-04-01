import { getBoxListWithCredentials, getBoxLogWithCredentials, getDeviceStatusWithCredentials, type BestwondCredentials } from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing Bestwond API ===');
  console.log('Device ID:', deviceId);
  console.log('App ID:', credentials.appId);
  console.log('');

  // Test 1: Device Status
  console.log('1. Testing Device Status...');
  const statusResult = await getDeviceStatusWithCredentials(deviceId, credentials);
  console.log('Device Status:', JSON.stringify(statusResult, null, 2));
  console.log('');

  // Test 2: Box List
  console.log('2. Testing Box List...');
  const boxListResult = await getBoxListWithCredentials(deviceId, credentials);
  console.log('Box List Code:', boxListResult.code);
  console.log('Box List Message:', boxListResult.msg);
  
  if (boxListResult.code === 0 && boxListResult.data) {
    const boxes = Array.isArray(boxListResult.data) ? boxListResult.data : [];
    const occupied = boxes.filter((b: any) => b.order_no);
    console.log('Total Boxes:', boxes.length);
    console.log('Occupied Boxes:', occupied.length);
    if (occupied.length > 0) {
      console.log('Occupied boxes details:');
      occupied.forEach((b: any) => {
        console.log(`  Box ${b.box_name}: order=${b.order_no}, size=${b.box_size}, save_time=${b.save_time}`);
      });
    }
  }
  console.log('');

  // Test 3: Box Log
  console.log('3. Testing Box Log...');
  const logResult = await getBoxLogWithCredentials(deviceId, credentials, {
    pageNum: 1,
    pageSize: 20,
  });
  console.log('Box Log Code:', logResult.code);
  console.log('Box Log Message:', logResult.msg);
  console.log('Box Log Data:', JSON.stringify(logResult.data, null, 2).substring(0, 500));
  console.log('');

  console.log('=== Test Complete ===');
}

main().catch(console.error);
