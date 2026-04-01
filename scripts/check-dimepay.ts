// Check DimePay credentials in database
// Run with: npx tsx scripts/check-dimepay.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DimePay Configuration Check ===\n');
  
  const settings = await prisma.setting.findMany({
    where: {
      key: { startsWith: 'dimepay_' }
    }
  });
  
  if (settings.length === 0) {
    console.log('❌ No DimePay settings found in database!');
    console.log('\nYou need to configure DimePay credentials.');
    console.log('\nRun the SQL below in Supabase to add your credentials:');
    console.log(`
INSERT INTO settings (id, key, value, description, "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'dimepay_sandboxMode', 'false', 'Use sandbox mode (true/false)', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_live_clientId', 'YOUR_LIVE_CLIENT_ID', 'DimePay Live Client ID', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_live_secretKey', 'YOUR_LIVE_SECRET_KEY', 'DimePay Live Secret Key', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_sandbox_clientId', 'YOUR_SANDBOX_CLIENT_ID', 'DimePay Sandbox Client ID', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_sandbox_secretKey', 'YOUR_SANDBOX_SECRET_KEY', 'DimePay Sandbox Secret Key', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_enabled', 'true', 'Enable DimePay payments', NOW(), NOW()),
  (gen_random_uuid(), 'dimepay_passFeeToCustomer', 'true', 'Pass transaction fee to customer', NOW(), NOW());
`);
    return;
  }
  
  console.log('Current DimePay Settings:\n');
  for (const s of settings) {
    // Mask secrets
    let value = s.value || '(empty)';
    if (s.key.includes('secret') || s.key.includes('Secret')) {
      if (s.value && s.value.length > 12) {
        value = `${s.value.substring(0, 8)}...${s.value.substring(s.value.length - 4)}`;
      } else if (s.value) {
        value = '(too short)';
      }
    } else if (s.key.includes('clientId') || s.key.includes('ClientId')) {
      if (s.value && s.value.length > 12) {
        value = `${s.value.substring(0, 12)}...`;
      }
    }
    console.log(`  ${s.key}: ${value}`);
  }
  
  // Check if properly configured
  const sandboxMode = settings.find(s => s.key === 'dimepay_sandboxMode')?.value === 'true';
  const liveClientId = settings.find(s => s.key === 'dimepay_live_clientId')?.value;
  const liveSecretKey = settings.find(s => s.key === 'dimepay_live_secretKey')?.value;
  const sandboxClientId = settings.find(s => s.key === 'dimepay_sandbox_clientId')?.value;
  const sandboxSecretKey = settings.find(s => s.key === 'dimepay_sandbox_secretKey')?.value;
  
  const effectiveClientId = sandboxMode ? sandboxClientId : liveClientId;
  const effectiveSecretKey = sandboxMode ? sandboxSecretKey : liveSecretKey;
  
  console.log('\n=== Diagnosis ===');
  console.log(`Mode: ${sandboxMode ? 'SANDBOX' : 'LIVE'}`);
  console.log(`Client ID: ${effectiveClientId ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`Secret Key: ${effectiveSecretKey ? '✅ Set' : '❌ NOT SET'}`);
  
  if (!effectiveClientId || !effectiveSecretKey) {
    console.log('\n❌ PROBLEM: Missing credentials!');
    console.log(`\nYou need to set: dimepay_${sandboxMode ? 'sandbox' : 'live'}_clientId and dimepay_${sandboxMode ? 'sandbox' : 'live'}_secretKey`);
  } else {
    console.log('\n✅ Credentials appear to be configured.');
    console.log('\nIf you still get "account number invalid" error:');
    console.log('1. Check that the Client ID and Secret Key are correct');
    console.log('2. Make sure you\'re using the right mode (sandbox vs live)');
    console.log('3. Verify your DimePay account is active');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
