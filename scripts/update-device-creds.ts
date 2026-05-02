// Script to update device 2100018247 with correct Bestwond credentials
// Run with: npx tsx scripts/update-device-creds.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deviceId = '2100018247';
  const bestwondAppId = 'bw_86b83996147111f';
  const bestwondAppSecret = '86b83aa4147111f18bd500163e198b20';

  console.log('=== Updating Device Credentials ===');
  console.log('Device ID:', deviceId);
  console.log('App ID:', bestwondAppId);
  console.log('App Secret:', bestwondAppSecret.substring(0, 8) + '...');
  console.log();

  // Find the device
  const existingDevice = await prisma.device.findUnique({
    where: { deviceId }
  });

  if (!existingDevice) {
    console.log('❌ Device not found. Creating new device...');
    
    const newDevice = await prisma.device.create({
      data: {
        deviceId,
        name: `Locker ${deviceId}`,
        totalBoxes: 36,
        availableBoxes: 36,
        status: 'ONLINE',
        bestwondAppId,
        bestwondAppSecret,
      }
    });
    
    console.log('✅ Device created:', newDevice.id);
    
    // Create boxes
    for (let i = 1; i <= 36; i++) {
      await prisma.box.create({
        data: {
          boxNumber: i,
          deviceId: newDevice.id,
          status: 'AVAILABLE',
        }
      });
    }
    console.log('✅ Created 36 boxes');
    
  } else {
    console.log('Found device:', existingDevice.id);
    console.log('Current credentials:');
    console.log('  App ID:', existingDevice.bestwondAppId || '(not set)');
    console.log('  App Secret:', existingDevice.bestwondAppSecret ? '(set)' : '(not set)');
    
    // Update the device with credentials
    const updated = await prisma.device.update({
      where: { deviceId },
      data: {
        bestwondAppId,
        bestwondAppSecret,
      }
    });
    
    console.log();
    console.log('✅ Device updated with credentials!');
    console.log('New App ID:', updated.bestwondAppId);
    console.log('New App Secret:', updated.bestwondAppSecret ? '(set)' : '(not set)');
  }

  // Verify the update
  const verify = await prisma.device.findUnique({
    where: { deviceId },
    select: { deviceId: true, name: true, bestwondAppId: true, bestwondAppSecret: true }
  });
  
  console.log();
  console.log('=== Verification ===');
  console.log('Device ID:', verify?.deviceId);
  console.log('Name:', verify?.name);
  console.log('Has App ID:', !!verify?.bestwondAppId);
  console.log('Has App Secret:', !!verify?.bestwondAppSecret);
  
  if (verify?.bestwondAppId === bestwondAppId && verify?.bestwondAppSecret === bestwondAppSecret) {
    console.log();
    console.log('✅ SUCCESS: Credentials match expected values!');
  } else {
    console.log();
    console.log('❌ ERROR: Credentials do not match!');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
