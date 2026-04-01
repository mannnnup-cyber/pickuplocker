import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get device 2100018247
  let device = await prisma.device.findUnique({
    where: { deviceId: '2100018247' }
  });
  
  if (!device) {
    // Create device 2100018247
    device = await prisma.device.create({
      data: {
        deviceId: '2100018247',
        name: 'Locker 2100018247',
        totalBoxes: 36,
        availableBoxes: 36,
        status: 'ONLINE',
        bestwondAppId: 'bw_86b83996147111f',
        bestwondAppSecret: '86b83aa4147111f18bd500163e198b20',
      }
    });
    console.log('Created device 2100018247');
  } else {
    console.log('Device 2100018247 already exists');
  }
  
  // Add boxes if not exist
  const existingBoxes = await prisma.box.count({ where: { deviceId: device.id } });
  if (existingBoxes === 0) {
    for (let i = 1; i <= 36; i++) {
      await prisma.box.create({
        data: {
          boxNumber: i,
          deviceId: device.id,
          status: 'AVAILABLE',
        }
      });
    }
    console.log('Created 36 boxes for device 2100018247');
  }
  
  // Create device 2100012858 if not exists
  let device1 = await prisma.device.findUnique({
    where: { deviceId: '2100012858' }
  });
  
  if (!device1) {
    device1 = await prisma.device.create({
      data: {
        deviceId: '2100012858',
        name: 'Locker 2100012858',
        totalBoxes: 24,
        availableBoxes: 24,
        status: 'ONLINE',
        bestwondAppId: 'bw_57c12404463d11e',
        bestwondAppSecret: '57c12512463d11eeb63500163e198b20',
      }
    });
    console.log('Created device 2100012858');
    
    for (let i = 1; i <= 24; i++) {
      await prisma.box.create({
        data: {
          boxNumber: i,
          deviceId: device1.id,
          status: 'AVAILABLE',
        }
      });
    }
    console.log('Created 24 boxes for device 2100012858');
  } else {
    console.log('Device 2100012858 already exists');
  }
  
  // List all devices
  const allDevices = await prisma.device.findMany({
    select: { id: true, deviceId: true, name: true, bestwondAppId: true }
  });
  console.log('\nAll devices:', allDevices);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
