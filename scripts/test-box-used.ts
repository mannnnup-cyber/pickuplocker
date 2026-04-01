import { 
  getBoxUsedInfoWithCredentials, 
  getStorableBoxDoorsWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing Box Used Info API ===');
  
  // Test 1: Box Used Info (KD endpoint - might show all orders)
  console.log('1. Testing Box Used Info...');
  const usedResult = await getBoxUsedInfoWithCredentials(deviceId, credentials);
  console.log('Box Used Info:', JSON.stringify(usedResult, null, 2));
  console.log('');

  // Test 2: Storable Box Doors
  console.log('2. Testing Storable Box Doors (S)...');
  const storableS = await getStorableBoxDoorsWithCredentials(deviceId, 'S', credentials);
  console.log('Storable S:', JSON.stringify(storableS, null, 2));
  console.log('');

  console.log('3. Testing Storable Box Doors (M)...');
  const storableM = await getStorableBoxDoorsWithCredentials(deviceId, 'M', credentials);
  console.log('Storable M:', JSON.stringify(storableM, null, 2));
  console.log('');

  console.log('=== Test Complete ===');
}

main().catch(console.error);
