import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Bestwond settings
  await prisma.setting.upsert({
    where: { key: 'bestwond_appId' },
    update: { value: 'bw_86b83996147111f' },
    create: { key: 'bestwond_appId', value: 'bw_86b83996147111f' },
  });

  await prisma.setting.upsert({
    where: { key: 'bestwond_appSecret' },
    update: { value: '86b83aa4147111f18bd500163e198b20' },
    create: { key: 'bestwond_appSecret', value: '86b83aa4147111f18bd500163e198b20' },
  });

  await prisma.setting.upsert({
    where: { key: 'bestwond_deviceId' },
    update: { value: '2100018247' },
    create: { key: 'bestwond_deviceId', value: '2100018247' },
  });

  await prisma.setting.upsert({
    where: { key: 'bestwond_baseUrl' },
    update: { value: 'https://api.bestwond.com' },
    create: { key: 'bestwond_baseUrl', value: 'https://api.bestwond.com' },
  });

  await prisma.setting.upsert({
    where: { key: 'bestwond_enabled' },
    update: { value: 'true' },
    create: { key: 'bestwond_enabled', value: 'true' },
  });

  // Device settings
  await prisma.setting.upsert({
    where: { key: 'device_1_name' },
    update: { value: 'Primary Locker' },
    create: { key: 'device_1_name', value: 'Primary Locker' },
  });

  console.log('Settings seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
