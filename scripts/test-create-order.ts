import { 
  setSaveOrderWithCredentials,
  getBoxListWithCredentials,
  getBoxSaveOrderInfoWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing Create Order ===');
  
  // Generate unique order number
  const orderNo = `TEST-${Date.now()}`;
  
  console.log('Creating order:', orderNo);
  
  // Create order
  const createResult = await setSaveOrderWithCredentials(deviceId, orderNo, 'M', credentials);
  console.log('Create Order Result:', JSON.stringify(createResult, null, 2));
  console.log('');

  if (createResult.code === 0 && createResult.data) {
    const data = createResult.data;
    console.log('Order created successfully!');
    console.log('- Order No:', data.order_no);
    console.log('- Box Name:', data.box_name);
    console.log('- Box Size:', data.box_size);
    console.log('- Save Code:', data.save_code, '(give this to courier)');
    console.log('- Pick Code:', data.pick_code, '(give this to customer)');
    console.log('');

    // Check order info
    console.log('Checking order info...');
    const infoResult = await getBoxSaveOrderInfoWithCredentials(deviceId, data.order_no!, credentials);
    console.log('Order Info:', JSON.stringify(infoResult, null, 2));
    console.log('');

    // Check box list now
    console.log('Checking box list...');
    const boxList = await getBoxListWithCredentials(deviceId, credentials);
    if (boxList.code === 0 && boxList.data) {
      const occupied = (boxList.data as any[]).filter(b => b.order_no);
      console.log('Occupied boxes:', occupied.length);
      occupied.forEach(b => {
        console.log(`  Box ${b.box_name}: order=${b.order_no}`);
      });
    }
  } else {
    console.log('Failed to create order');
    console.log('Error:', createResult.msg);
  }

  console.log('');
  console.log('=== Test Complete ===');
}

main().catch(console.error);
