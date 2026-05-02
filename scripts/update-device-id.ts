// Update device ID in settings
import { db } from '../src/lib/db';

async function main() {
  // Check existing devices
  const devices = await db.device.findMany();
  console.log('Existing devices:', devices.map(d => ({ id: d.id, deviceId: d.deviceId, name: d.name })));
  
  // Update or create correct device
  const correctDeviceId = '2100018247';
  
  for (const device of devices) {
    if (device.deviceId !== correctDeviceId) {
      console.log(`Updating device ${device.deviceId} -> ${correctDeviceId}`);
      await db.device.update({
        where: { id: device.id },
        data: { 
          deviceId: correctDeviceId,
          bestwondAppId: 'bw_86b83996147111f',
          bestwondAppSecret: '86b83aa4147111f18bd500163e198b20',
        }
      });
    }
  }
  
  // Ensure settings are updated
  const settings = [
    { key: 'bestwond_appId', value: 'bw_86b83996147111f', description: 'Bestwond App ID' },
    { key: 'bestwond_appSecret', value: '86b83aa4147111f18bd500163e198b20', description: 'Bestwond App Secret' },
    { key: 'bestwond_deviceId', value: correctDeviceId, description: 'Bestwond Device ID' },
  ];
  
  for (const setting of settings) {
    await db.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
    console.log(`Updated setting: ${setting.key}`);
  }
  
  console.log('\nDone! Device ID updated to:', correctDeviceId);
  
  // Verify
  const updatedDevices = await db.device.findMany();
  console.log('\nUpdated devices:', updatedDevices.map(d => ({ deviceId: d.deviceId, name: d.name })));
}

main().catch(console.error);
