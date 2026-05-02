import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = [
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
  ];
  
  for (const template of templates) {
    await prisma.smsTemplate.upsert({
      where: { key: template.key },
      update: template,
      create: template,
    });
  }
  
  console.log('SMS templates created/updated');
  
  const allTemplates = await prisma.smsTemplate.findMany();
  console.log('All templates:', allTemplates.map(t => t.key));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
