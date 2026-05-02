// Check what devices are linked to this Bestwond account
import crypto from 'crypto';

const APP_ID = 'bw_86b83996147111f';
const APP_SECRET = '86b83aa4147111f18bd500163e198b20';
const BASE_URL = 'https://api.bestwond.com';

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

async function getDeviceList() {
  console.log('=== Getting Device List ===');
  
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
  };
  
  const signature = await generateSignature(params, APP_SECRET);
  const url = `${BASE_URL}/api/iot/device/list/?sign=${signature}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(params),
    });
    
    const text = await response.text();
    console.log('Raw response:', text.substring(0, 5000));
    
    try {
      const data = JSON.parse(text);
      console.log('\nParsed response:', JSON.stringify(data, null, 2));
      
      if (data.code === 0 && data.data) {
        console.log('\n=== DEVICES LINKED TO THIS APP ===');
        const devices = Array.isArray(data.data) ? data.data : [data.data];
        devices.forEach((device: { device_number?: string; name?: string; status?: string }) => {
          console.log(`- Device: ${device.device_number || 'unknown'}, Name: ${device.name || 'N/A'}, Status: ${device.status || 'unknown'}`);
        });
      } else if (data.code === 0 && !data.data) {
        console.log('\n⚠️ No devices found linked to this app!');
        console.log('You need to link your device to this app in the Bestwond dashboard.');
      } else {
        console.log('\n❌ Error:', data.msg || data.des || 'Unknown error');
      }
    } catch (parseError) {
      console.log('Failed to parse JSON. Raw text:', text);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

// Also test with a different endpoint to verify credentials work
async function testCredentials() {
  console.log('\n=== Testing Credentials ===');
  
  // Try a simple API that should work if credentials are valid
  const params: Record<string, string | number> = {
    app_id: APP_ID,
    timestamps: getTimestamp(),
  };
  
  const signature = await generateSignature(params, APP_SECRET);
  
  // Test webhook setting endpoint (this should work even without devices)
  const webhookParams = {
    ...params,
    save_notify_url: 'https://example.com/webhook/save',
    take_notify_url: 'https://example.com/webhook/take',
  };
  
  const webhookSig = await generateSignature(webhookParams, APP_SECRET);
  const url = `${BASE_URL}/api/iot/set/app/webhook/?sign=${webhookSig}`;
  
  console.log('Testing webhook endpoint...');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PickupLocker/1.0',
      },
      body: JSON.stringify(webhookParams),
    });
    
    const text = await response.text();
    console.log('Webhook test response:', text);
  } catch (error) {
    console.error('Webhook test failed:', error);
  }
}

async function main() {
  console.log('========================================');
  console.log('Bestwond Account & Device Check');
  console.log('========================================');
  console.log('APP_ID:', APP_ID);
  console.log('APP_SECRET:', APP_SECRET.substring(0, 8) + '...');
  
  await getDeviceList();
  await testCredentials();
  
  console.log('\n========================================');
  console.log('If no devices are shown, you need to:');
  console.log('1. Log into your Bestwond dashboard');
  console.log('2. Link the device to this app account');
  console.log('3. Or contact Bestwond support');
  console.log('========================================');
}

main().catch(console.error);
