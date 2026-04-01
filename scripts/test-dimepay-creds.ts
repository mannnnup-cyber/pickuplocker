// Test DimePay credentials
// Run with: npx tsx scripts/test-dimepay-creds.ts

const clientId = process.env.DIMEPAY_CLIENT_ID || process.env.DIMEPAY_LIVE_CLIENT_ID;
const secretKey = process.env.DIMEPAY_SECRET_KEY || process.env.DIMEPAY_LIVE_SECRET_KEY;

console.log('=== DimePay Credentials Test ===\n');

if (!clientId) {
  console.log('❌ No Client ID found in environment');
} else {
  console.log('Client ID:', clientId.substring(0, 12) + '...');
  console.log('Client ID length:', clientId.length);
  console.log('Client ID prefix:', clientId.split('_')[0]);
}

if (!secretKey) {
  console.log('❌ No Secret Key found in environment');
} else {
  console.log('Secret Key:', secretKey.substring(0, 8) + '...');
  console.log('Secret Key length:', secretKey.length);
}

// Test JWT creation
if (clientId && secretKey) {
  const crypto = require('crypto');
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: clientId,
    id: 'TEST-' + Date.now(),
    total: 150,
    subtotal: 150,
    description: 'Test Payment',
    currency: 'JMD',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  
  const base64UrlEncode = (obj: object) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };
  
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;
  
  console.log('\n=== Generated JWT ===');
  console.log('JWT (first 100 chars):', jwt.substring(0, 100) + '...');
  
  // Decode payload to verify
  const decodedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString());
  console.log('\n=== JWT Payload ===');
  console.log('iss:', decodedPayload.iss);
  console.log('id:', decodedPayload.id);
  console.log('total:', decodedPayload.total);
}
