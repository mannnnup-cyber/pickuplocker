import { 
  expressSaveOrTakeWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing Express Save API (Open Box Directly) ===');
  console.log('');
  
  // Use the save code from the order we created earlier
  const saveCode = '387450'; // From our test order PKP-1772669895526
  
  console.log('Attempting to open box using save code:', saveCode);
  console.log('Box size: L');
  console.log('Action type: save');
  console.log('');
  
  const result = await expressSaveOrTakeWithCredentials(
    deviceId,
    'L',       // Large box
    saveCode,  // The save code
    'save',    // Action type
    credentials
  );
  
  console.log('Result:', JSON.stringify(result, null, 2));
  
  if (result.code === 0 && result.data) {
    console.log('');
    console.log('✅ SUCCESS!');
    console.log('Box opened:', result.data.box_name);
    console.log('Order No:', result.data.order_no);
  } else {
    console.log('');
    console.log('❌ Failed');
    console.log('Error:', result.msg);
  }
}

main().catch(console.error);
