import crypto from 'crypto';

const appId = 'bw_86b83996147111f';
const appSecret = '86b83aa4147111f18bd500163e198b20';
const deviceId = '2100018247';
const baseUrl = 'https://api.bestwond.com';

async function main() {
  const timestamps = Math.floor(Date.now() / 1000);

  // Build params for open box
  const params: Record<string, string | number> = {
    app_id: appId,
    timestamps: timestamps,
    device_number: deviceId,
    lock_address: '0103',
    use_type: 'S',
  };

  // Sort and build signature string
  const sortedKeys = Object.keys(params).sort();
  const encodedParams = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const stringToSign = encodedParams + appSecret;

  // Generate SHA512 signature
  const signature = crypto.createHash('sha512').update(stringToSign).digest('hex');

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║     BESTWOND API - OPEN BOX REQUEST & RESPONSE DOCUMENTATION          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Account Info
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ ACCOUNT INFORMATION                                                   │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log(`│ App ID        : ${appId.padEnd(52)}│`);
  console.log(`│ App Secret    : ${appSecret.padEnd(52)}│`);
  console.log(`│ Device Number : ${deviceId.padEnd(52)}│`);
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // API Endpoint
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ API ENDPOINT                                                          │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log(`│ POST ${baseUrl}/api/iot/open/box/`.padEnd(70) + '│');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Request Parameters
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ REQUEST PARAMETERS (JSON Body)                                         │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log('│ {                                                                     │');
  console.log(`│   "app_id": "${appId}",                                              │`);
  console.log(`│   "timestamps": ${timestamps},                                        │`);
  console.log(`│   "device_number": "${deviceId}",                                     │`);
  console.log('│   "lock_address": "0103",                                             │');
  console.log('│   "use_type": "S"                                                     │');
  console.log('│ }                                                                     │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Signature
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ SIGNATURE GENERATION                                                  │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log('│ Method: SHA512(sorted_params + app_secret)                            │');
  console.log(`│ String: ${stringToSign.substring(0, 60)}...`.padEnd(70) + '│');
  console.log(`│ Sign  : ${signature.substring(0, 60)}...`.padEnd(70) + '│');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Make the actual API call
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ API RESPONSE                                                          │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');

  try {
    const response = await fetch(`${baseUrl}/api/iot/open/box/?sign=${signature}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await response.json() as {
      code: number;
      msg: string;
      data?: {
        status: string;
        msg: string;
        task_id?: number;
      };
    };

    console.log('│                                                                       │');
    console.log(`│ HTTP Status: ${response.status}                                                       │`);
    console.log(`│ Response Code: ${data.code}                                                    │`);
    console.log(`│ Response Msg: ${data.msg}`.padEnd(70) + '│');
    console.log('│                                                                       │');

    if (data.data) {
      console.log('│ Device Response:                                                      │');
      console.log(`│   - status: "${data.data.status}"`                                             );
      console.log(`│   - msg: "${data.data.msg}"`.substring(0, 66).padEnd(70) + '│');
      if (data.data.task_id) {
        console.log(`│   - task_id: ${data.data.task_id}`                                              );
      }
    }

    console.log('│                                                                       │');
    console.log('│ ⚠️  ERROR: "The device uqkey is error, Please ask seller!"            │');
    console.log('│                                                                       │');

  } catch (e) {
    console.log(`│ Error: ${e}`.padEnd(70) + '│');
  }

  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Summary
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│ ISSUE SUMMARY                                                         │');
  console.log('├───────────────────────────────────────────────────────────────────────┤');
  console.log('│ The device is returning "uqkey error" which indicates the device      │');
  console.log('│ is not properly linked/registered to this app account.                │');
  console.log('│                                                                       │');
  console.log('│ We are requesting that device 2100018247 be linked to app             │');
  console.log('│ bw_86b83996147111f so we can control the locker boxes.                │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('');
}

main().catch(console.error);
