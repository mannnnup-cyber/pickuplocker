import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Device Credentials ===\n');
  
  // Find device 2100018247
  const device = await prisma.device.findUnique({
    where: { deviceId: '2100018247' },
    select: {
      id: true,
      deviceId: true,
      name: true,
      status: true,
      bestwondAppId: true,
      bestwondAppSecret: true,
      totalBoxes: true,
    }
  });
  
  if (!device) {
    console.log('❌ Device 2100018247 NOT FOUND in database');
    console.log('\nRun: npx tsx scripts/add-device.ts');
    return;
  }
  
  console.log('✅ Device found:');
  console.log('  ID:', device.id);
  console.log('  Device ID:', device.deviceId);
  console.log('  Name:', device.name);
  console.log('  Status:', device.status);
  console.log('  Total Boxes:', device.totalBoxes);
  console.log('  Bestwond App ID:', device.bestwondAppId || '❌ NOT SET');
  console.log('  Bestwond App Secret:', device.bestwondAppSecret ? `${device.bestwondAppSecret.substring(0, 8)}...` : '❌ NOT SET');
  
  // Check expected credentials
  const expectedAppId = 'bw_86b83996147111f';
  const expectedSecret = '86b83aa4147111f18bd500163e198b20';
  
  console.log('\n=== Credential Check ===');
  if (device.bestwondAppId === expectedAppId) {
    console.log('✅ App ID matches expected value');
  } else {
    console.log('❌ App ID mismatch!');
    console.log('   Expected:', expectedAppId);
    console.log('   Got:', device.bestwondAppId);
  }
  
  if (device.bestwondAppSecret === expectedSecret) {
    console.log('✅ App Secret matches expected value');
  } else {
    console.log('❌ App Secret mismatch!');
    console.log('   Expected:', expectedSecret);
    console.log('   Got:', device.bestwondAppSecret ? `${device.bestwondAppSecret.substring(0, 8)}...` : 'null');
  }
  
  // List all devices
  console.log('\n=== All Devices ===');
  const allDevices = await prisma.device.findMany({
    select: {
      id: true,
      deviceId: true,
      name: true,
      bestwondAppId: true,
      bestwondAppSecret: true,
    }
  });
  
  for (const d of allDevices) {
    const hasCreds = !!(d.bestwondAppId && d.bestwondAppSecret);
    console.log(`  ${d.deviceId} (${d.name}): ${hasCreds ? '✅ Has credentials' : '❌ No credentials'}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
