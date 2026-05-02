import { getBoxLogWithCredentials, getBoxListWithCredentials, type BestwondCredentials } from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function main() {
  console.log('=== Testing All Box Logs ===');
  
  // Get all boxes
  const boxList = await getBoxListWithCredentials(deviceId, credentials);
  if (boxList.code !== 0 || !boxList.data) {
    console.log('Failed to get box list');
    return;
  }

  const boxes = boxList.data as any[];
  console.log(`Checking logs for ${boxes.length} boxes...`);
  console.log('');

  const allLogs: any[] = [];

  // Check first 10 boxes for activity
  for (let i = 0; i < Math.min(10, boxes.length); i++) {
    const box = boxes[i];
    const boxNo = parseInt(box.box_name, 10);
    
    const logResult = await getBoxLogWithCredentials(deviceId, credentials, {
      boxNo,
      pageNum: 1,
      pageSize: 5,
    });

    if (logResult.code === 0 && logResult.data) {
      const data = logResult.data as { list?: any[] };
      if (data.list && data.list.length > 0) {
        console.log(`Box ${box.box_name}: ${data.list.length} log entries`);
        allLogs.push(...data.list);
      }
    }
  }

  console.log('');
  console.log(`Total logs found: ${allLogs.length}`);
  
  if (allLogs.length > 0) {
    console.log('');
    console.log('Most recent logs:');
    allLogs
      .sort((a, b) => new Date(b.action_time).getTime() - new Date(a.action_time).getTime())
      .slice(0, 5)
      .forEach(log => {
        console.log(`  ${log.action_time} - Box ${log.box_name} - Action: ${log.action} - ${log.remark}`);
      });
  }

  console.log('');
  console.log('=== Test Complete ===');
}

main().catch(console.error);
