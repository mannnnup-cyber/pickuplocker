// Test JWT generation for DimePay
import crypto from 'crypto';

// Get credentials from environment or use test values
const clientId = process.env.DIMEPAY_LIVE_CLIENT_ID || 'ck_rdq-r7tqOqdZ-MoY4cdkBbC2-CFj2';
const secretKey = process.env.DIMEPAY_LIVE_SECRET_KEY || '';

console.log('=== DimePay JWT Test ===\n');
console.log('Client ID:', clientId);
console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 4)}` : '(not set)');
console.log('Secret Key length:', secretKey.length);

if (!secretKey) {
  console.log('\n❌ No secret key provided. Set DIMEPAY_LIVE_SECRET_KEY env var.');
  process.exit(1);
}

// Create JWT
const header = {
  alg: 'HS256',
  typ: 'JWT'
};

const now = Math.floor(Date.now() / 1000);
const payload = {
  id: 'TEST-' + Date.now(),
  total: 154, // $154 JMD
  subtotal: 154,
  description: 'Test Payment',
  currency: 'JMD',
  tax: 0,
  fees: [],
  items: [],
  fulfilled: true,
  shippingPerson: {
    name: 'Test Customer',
    email: 'test@example.com',
    street: '',
    city: 'Kingston',
    countryCode: 'JM',
    countryName: 'Jamaica',
    postalCode: '',
    stateOrProvinceCode: '',
    stateOrProvinceName: '',
    phone: '8761234567',
  },
  billingPerson: {
    name: 'Test Customer',
    email: 'test@example.com',
    street: '',
    city: 'Kingston',
    countryCode: 'JM',
    countryName: 'Jamaica',
    postalCode: '',
    stateOrProvinceCode: '',
    stateOrProvinceName: '',
    phone: '8761234567',
  },
  iat: now,
  exp: now + 3600,
};

// Base64URL encode
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
console.log('Header (decoded):', JSON.stringify(header));
console.log('Payload (decoded):', JSON.stringify(payload, null, 2));
console.log('\nFull JWT:', jwt);

// Verify we can decode it
console.log('\n=== JWT Verification ===');
const parts = jwt.split('.');
const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
console.log('Decoded payload:', JSON.stringify(decodedPayload, null, 2));

// Check signature
const expectedSig = crypto
  .createHmac('sha256', secretKey)
  .update(`${parts[0]}.${parts[1]}`)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

console.log('\nSignature valid:', parts[2] === expectedSig);
