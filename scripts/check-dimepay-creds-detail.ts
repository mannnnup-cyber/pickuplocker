// Check DimePay credentials format
// Run with: npx tsx scripts/check-dimepay-creds-detail.ts

console.log('=== DimePay Credential Format Check ===\n');

console.log('Expected formats:');
console.log('- Sandbox Client ID: ck_test_xxxxx');
console.log('- Live Client ID: ck_live_xxxxx');
console.log('- Or just: ck_xxxxx (newer format)');
console.log('');

const testIds = [
  'ck_LGKMlNpFiRr63ce0s621VuGLjYdey',
  'ck_test_abc123',
  'ck_live_xyz789',
];

testIds.forEach(id => {
  const prefix = id.split('_').slice(0, 2).join('_');
  const isTest = id.includes('_test_');
  const isLive = id.includes('_live_');
  const isNew = id.startsWith('ck_') && !isTest && !isLive;
  
  console.log(`${id}`);
  console.log(`  Prefix: ${prefix}`);
  console.log(`  Is Sandbox: ${isTest}`);
  console.log(`  Is Live: ${isLive}`);
  console.log(`  Is New Format: ${isNew}`);
  console.log('');
});
