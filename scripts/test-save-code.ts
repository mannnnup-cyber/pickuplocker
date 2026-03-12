import { 
  setSaveOrderWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Creating New Test Order ===');
  console.log('');

  // Create a fresh order
  const orderNo = `PKP-${Date.now()}`;
  console.log('Creating order:', orderNo);
  
  const createResult = await setSaveOrderWithCredentials(deviceId, orderNo, 'L', credentials);
  
  if (createResult.code === 0 && createResult.data) {
    console.log('');
    console.log('✅ ORDER CREATED SUCCESSFULLY!');
    console.log('═══════════════════════════════════');
    console.log('');
    console.log('📦 Order Number:', createResult.data.order_no);
    console.log('📦 Box Size:', createResult.data.box_size);
    console.log('');
    console.log('🔑 SAVE CODE (for courier):', createResult.data.save_code);
    console.log('🔑 PICK CODE (for customer):', createResult.data.pick_code);
    console.log('');
    console.log('📍 Available boxes:', createResult.data.box_name);
    console.log('');
    console.log('═══════════════════════════════════');
    console.log('');
    console.log('TESTING INSTRUCTIONS:');
    console.log('1. Go to the locker');
    console.log('2. Do NOT use the screen menu');
    console.log('3. Enter SAVE CODE: ' + createResult.data.save_code + ' on the keypad');
    console.log('4. A box door should open');
    console.log('5. Put something in and close the door');
    console.log('6. Then check our system - order should appear!');
    console.log('');
    console.log('To pick up: Enter PICK CODE: ' + createResult.data.pick_code);
    console.log('');
  } else {
    console.log('❌ Failed to create order');
    console.log('Error:', createResult.msg);
  }
}

main().catch(console.error);
