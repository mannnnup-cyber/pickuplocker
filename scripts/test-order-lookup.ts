import { 
  getBoxSaveOrderInfoWithCredentials,
  getBoxListWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';
const orderNo = 'TEST-1772668891195';

async function main() {
  console.log('=== Looking for Order ===');
  console.log('Order Number:', orderNo);
  console.log('');

  // Try to get order info
  console.log('1. Querying order info API...');
  const orderInfo = await getBoxSaveOrderInfoWithCredentials(deviceId, orderNo, credentials);
  console.log('Order Info Result:', JSON.stringify(orderInfo, null, 2));
  console.log('');

  // Check box list for this order
  console.log('2. Checking box list for order...');
  const boxList = await getBoxListWithCredentials(deviceId, credentials);
  if (boxList.code === 0 && boxList.data) {
    const boxes = boxList.data as any[];
    const matchingBox = boxes.find(b => b.order_no === orderNo);
    if (matchingBox) {
      console.log('Found order in box:', matchingBox.box_name);
      console.log('Box details:', JSON.stringify(matchingBox, null, 2));
    } else {
      console.log('Order NOT found in any box');
      console.log('');
      console.log('Boxes with orders:');
      const occupied = boxes.filter(b => b.order_no);
      if (occupied.length === 0) {
        console.log('  No occupied boxes');
      } else {
        occupied.forEach(b => {
          console.log(`  Box ${b.box_name}: ${b.order_no}`);
        });
      }
    }
  }

  console.log('');
  console.log('=== Test Complete ===');
}

main().catch(console.error);
