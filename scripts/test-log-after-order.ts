import { getBoxLogWithCredentials, type BestwondCredentials } from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing Box Log After Order Creation ===');
  
  // Test box log with various parameters
  console.log('1. Box Log (no filter)...');
  const log1 = await getBoxLogWithCredentials(deviceId, credentials, { pageNum: 1, pageSize: 20 });
  console.log('Result:', JSON.stringify(log1, null, 2));
  console.log('');

  // Test with specific box
  console.log('2. Box Log (box 02)...');
  const log2 = await getBoxLogWithCredentials(deviceId, credentials, { boxNo: 2, pageNum: 1, pageSize: 20 });
  console.log('Result:', JSON.stringify(log2, null, 2));
  console.log('');

  console.log('=== Test Complete ===');
}

main().catch(console.error);
