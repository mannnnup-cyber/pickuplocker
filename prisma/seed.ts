import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create devices
  const device1 = await prisma.device.upsert({
    where: { deviceId: '2100012858' },
    update: {},
    create: {
      deviceId: '2100012858',
      name: 'Main Lobby Locker',
      location: 'Kingston Mall',
      description: 'Primary locker at Kingston Mall entrance',
      totalBoxes: 24,
      availableBoxes: 18,
      status: 'ONLINE',
    },
  });

  const device2 = await prisma.device.upsert({
    where: { deviceId: '2100012859' },
    update: {},
    create: {
      deviceId: '2100012859',
      name: 'Office Building Locker',
      location: 'New Kingston Business District',
      description: 'Locker for business district deliveries',
      totalBoxes: 36,
      availableBoxes: 12,
      status: 'ONLINE',
    },
  });

  // Create boxes for device 1
  for (let i = 1; i <= 24; i++) {
    await prisma.box.upsert({
      where: { deviceId_boxNumber: { deviceId: device1.id, boxNumber: i } },
      update: {},
      create: {
        boxNumber: i,
        deviceId: device1.id,
        status: i <= 18 ? 'AVAILABLE' : 'OCCUPIED',
        size: i <= 8 ? 'S' : i <= 16 ? 'M' : i <= 20 ? 'L' : 'XL',
      },
    });
  }

  // Create boxes for device 2
  for (let i = 1; i <= 36; i++) {
    await prisma.box.upsert({
      where: { deviceId_boxNumber: { deviceId: device2.id, boxNumber: i } },
      update: {},
      create: {
        boxNumber: i,
        deviceId: device2.id,
        status: i <= 12 ? 'AVAILABLE' : 'OCCUPIED',
        size: i <= 12 ? 'S' : i <= 24 ? 'M' : i <= 30 ? 'L' : 'XL',
      },
    });
  }

  // Create sample couriers
  const courier1 = await prisma.courier.upsert({
    where: { code: 'KE' },
    update: {},
    create: {
      name: 'Knutsford Express',
      code: 'KE',
      contactPerson: 'John Smith',
      phone: '876-555-1000',
      email: 'logistics@knutsford.com',
      address: 'Kingston, Jamaica',
      status: 'ACTIVE',
      balance: 5000,
      creditLimit: 10000,
      autoReload: true,
      autoReloadAmount: 2000,
      minBalance: 1000,
      totalDropOffs: 45,
      totalSpent: 15000,
    },
  });

  const courier2 = await prisma.courier.upsert({
    where: { code: 'ZM' },
    update: {},
    create: {
      name: 'ZipMail',
      code: 'ZM',
      contactPerson: 'Jane Doe',
      phone: '876-555-2000',
      email: 'support@zipmail.com',
      address: 'New Kingston, Jamaica',
      status: 'ACTIVE',
      balance: 2500,
      creditLimit: 5000,
      autoReload: false,
      totalDropOffs: 23,
      totalSpent: 8500,
    },
  });

  const courier3 = await prisma.courier.upsert({
    where: { code: 'DH' },
    update: {},
    create: {
      name: 'Dirty Hand Designs',
      code: 'DH',
      contactPerson: 'Mark Brown',
      phone: '876-555-3000',
      email: 'info@dirtyhanddesigns.com',
      address: 'UTech Campus, Kingston',
      status: 'ACTIVE',
      balance: 10000,
      creditLimit: 20000,
      autoReload: true,
      autoReloadAmount: 5000,
      minBalance: 2000,
      totalDropOffs: 120,
      totalSpent: 45000,
    },
  });

  // Create sample customers
  const customer1 = await prisma.user.upsert({
    where: { email: 'john.brown@email.com' },
    update: {},
    create: {
      email: 'john.brown@email.com',
      name: 'John Brown',
      phone: '876-555-0101',
      role: 'CUSTOMER',
    },
  });

  const customer2 = await prisma.user.upsert({
    where: { email: 'sarah.jones@email.com' },
    update: {},
    create: {
      email: 'sarah.jones@email.com',
      name: 'Sarah Jones',
      phone: '876-555-0202',
      role: 'CUSTOMER',
    },
  });

  // Create admin user
  await prisma.user.upsert({
    where: { email: 'admin@dirtyhand.com' },
    update: {},
    create: {
      email: 'admin@dirtyhand.com',
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  // Create sample orders
  const existingOrders = await prisma.order.count();
  if (existingOrders === 0) {
    await prisma.order.createMany({
      data: [
        {
          orderNumber: 'DH-20250115-001',
          trackingCode: '123456',
          customerId: customer1.id,
          customerName: 'John Brown',
          customerPhone: '876-555-0101',
          deviceId: device1.id,
          boxNumber: 5,
          status: 'STORED',
          storageStartAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          storageDays: 2,
          storageFee: 0,
        },
        {
          orderNumber: 'DH-20250114-003',
          trackingCode: '789012',
          customerId: customer2.id,
          customerName: 'Sarah Jones',
          customerPhone: '876-555-0202',
          deviceId: device2.id,
          boxNumber: 12,
          status: 'STORED',
          storageStartAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          storageDays: 5,
          storageFee: 200,
          courierName: 'Knutsford Express',
          courierId: courier1.id,
        },
      ],
    });
  }

  // Create system settings
  const existingSettings = await prisma.setting.count();
  if (existingSettings === 0) {
    await prisma.setting.createMany({
      data: [
        { key: 'free_storage_days', value: '3', description: 'Number of free storage days' },
        { key: 'tier1_fee', value: '100', description: 'Daily fee for days 4-7 (JMD)' },
        { key: 'tier2_fee', value: '150', description: 'Daily fee for days 8-14 (JMD)' },
        { key: 'tier3_fee', value: '200', description: 'Daily fee for days 15-30 (JMD)' },
        { key: 'max_storage_days', value: '30', description: 'Maximum storage days before abandoned' },
        { key: 'brand_name', value: 'Pickup', description: 'Brand name for display' },
        { key: 'contact_phone', value: '876-XXX-XXXX', description: 'Contact phone number' },
        { key: 'contact_email', value: 'support@pickupja.com', description: 'Contact email address' },
      ],
    });
  }

  // Create SMS templates
  const existingSmsTemplates = await prisma.smsTemplate.count();
  if (existingSmsTemplates === 0) {
    await prisma.smsTemplate.createMany({
      data: [
        {
          key: 'pickup_notification',
          name: 'Pickup Notification',
          description: 'Sent when a package is stored in the locker',
          template: 'Hi {{customerName}}! Your package is ready for pickup.\n\n📦 Tracking Code: {{trackingCode}}\n📍 Location: {{location}}\n⏰ Free pickup until: {{expiryDate}}\n\nVisit pickupja.com and enter your code to collect.\n\n{{signature}}',
          variables: JSON.stringify(['customerName', 'trackingCode', 'location', 'expiryDate', 'signature']),
          isActive: true,
        },
        {
          key: 'pickup_confirmation',
          name: 'Pickup Confirmation',
          description: 'Sent when customer picks up their package',
          template: 'Hi {{customerName}}! You have successfully picked up your package. Thank you for using Pickup!\n\n{{signature}}',
          variables: JSON.stringify(['customerName', 'signature']),
          isActive: true,
        },
        {
          key: 'storage_fee',
          name: 'Storage Fee Notice',
          description: 'Sent when storage fee applies',
          template: 'Hi {{customerName}}, your package has been stored for {{storageDays}} days. Storage fee: JMD ${{fee}}. Please pay when picking up.\n\n{{signature}}',
          variables: JSON.stringify(['customerName', 'storageDays', 'fee', 'signature']),
          isActive: true,
        },
        {
          key: 'overdue_reminder',
          name: 'Overdue Reminder',
          description: 'Sent when package is approaching abandonment',
          template: 'Hi {{customerName}}, your package has been stored for {{storageDays}} days. Total fee: JMD ${{totalFee}}. Please pick up within {{daysUntilAbandoned}} days to avoid abandonment. Contact {{supportPhone}} for help.\n\n{{signature}}',
          variables: JSON.stringify(['customerName', 'storageDays', 'totalFee', 'daysUntilAbandoned', 'supportPhone', 'signature']),
          isActive: true,
        },
      ],
    });
  }

  console.log('Seed completed successfully!');
  console.log('Created:');
  console.log('  - 2 Devices (lockers)');
  console.log('  - 60 Boxes');
  console.log('  - 3 Couriers (Knutsford Express, ZipMail, Dirty Hand Designs)');
  console.log('  - 3 Users (2 customers, 1 admin)');
  console.log('  - 2 Sample orders');
  console.log('  - 8 System settings');
  console.log('  - 4 SMS templates');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
