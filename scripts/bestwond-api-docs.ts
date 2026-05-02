import crypto from 'crypto';

const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';
const deviceId = '2100018247';
const baseUrl = 'https://api.bestwond.com';

// Generate timestamp
const timestamps = Math.floor(Date.now() / 1000);

// Build params for open box
const params = {
  app_id: appId,
  timestamps: timestamps,
  device_number: deviceId,
  lock_address: '0103',  // Box 3
  use_type: 'S',  // Single open
};

// Sort and build signature string
const sortedKeys = Object.keys(params).sort();
const encodedParams = sortedKeys
  .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key as keyof typeof params])}`)
  .join('&');

const stringToSign = encodedParams + appSecret;

// Generate SHA512 signature
const signature = crypto.createHash('sha512').update(stringToSign).digest('hex');

const jsonBody = JSON.stringify(params);

console.log('═══════════════════════════════════════════════════════════════');
console.log('       BESTWOND API - OPEN BOX REQUEST PARAMETERS');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('API ENDPOINT:');
console.log(`  ${baseUrl}/api/iot/open/box/?sign=${signature}`);
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('REQUEST BODY (JSON):');
console.log('───────────────────────────────────────────────────────────────');
console.log(JSON.stringify(params, null, 2));
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('PARAMETER DETAILS:');
console.log('───────────────────────────────────────────────────────────────');
console.log(`  app_id        : ${appId}`);
console.log(`  timestamps    : ${timestamps} (Unix timestamp in seconds)`);
console.log(`  device_number : ${deviceId}`);
console.log(`  lock_address  : 0103 (Box 3)`);
console.log(`  use_type      : S (Single open mode)`);
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('SIGNATURE GENERATION:');
console.log('───────────────────────────────────────────────────────────────');
console.log(`  App Secret    : ${appSecret}`);
console.log(`  String to Sign: ${stringToSign.substring(0, 80)}...`);
console.log(`  Signature     : ${signature}`);
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('CURL COMMAND:');
console.log('───────────────────────────────────────────────────────────────');
console.log(`curl -X POST "${baseUrl}/api/iot/open/box/?sign=${signature}" \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '${jsonBody}'`);
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
