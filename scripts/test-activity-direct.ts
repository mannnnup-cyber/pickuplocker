import { 
  getBoxListWithCredentials,
  getBoxLogWithCredentials,
  type BestwondCredentials 
} from '../src/lib/bestwond';

const credentials: BestwondCredentials = {
  appId: 'bw_86b83996147111f',
  appSecret: '86b83aa4147111f18bd500163e198b20',
  baseUrl: 'https://api.bestwond.com',
};

const deviceId = '2100018247';

async function getActivity() {
  console.log('=== Testing Activity API Logic ===');
  
  // Get box list
  const boxListResult = await getBoxListWithCredentials(deviceId, credentials);
  
  const occupiedBoxes: any[] = [];
  const activityLogs: any[] = [];
  
  if (boxListResult.code === 0 && boxListResult.data) {
    const boxes = Array.isArray(boxListResult.data) ? boxListResult.data : [];
    
    for (const box of boxes) {
      if (box.order_no) {
        occupiedBoxes.push({
          boxName: box.box_name,
          boxSize: box.box_size,
          orderNo: box.order_no,
          saveTime: box.save_time,
        });
      }
    }
    
    console.log(`Found ${boxes.length} boxes, ${occupiedBoxes.length} occupied`);
    
    // Get logs for each box (first 10)
    const boxesToQuery = boxes.slice(0, 10);
    
    const logPromises = boxesToQuery.map(async (box: any) => {
      const boxNo = parseInt(box.box_name, 10);
      if (isNaN(boxNo)) return [];
      
      const logResult = await getBoxLogWithCredentials(deviceId, credentials, {
        boxNo,
        pageNum: 1,
        pageSize: 5,
      });

      if (logResult.code === 0 && logResult.data) {
        const logData = logResult.data as { list?: any[] };
        return logData.list || [];
      }
      return [];
    });

    const logResults = await Promise.allSettled(logPromises);
    
    for (const result of logResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        activityLogs.push(...result.value);
      }
    }
    
    // Sort by time
    activityLogs.sort((a, b) => new Date(b.action_time).getTime() - new Date(a.action_time).getTime());
    
    console.log(`Found ${activityLogs.length} activity logs`);
    console.log('');
    console.log('Recent logs:');
    activityLogs.slice(0, 5).forEach(log => {
      console.log(`  ${log.action_time} - Box ${log.box_name} - ${log.remark}`);
    });
  }
  
  return { occupiedBoxes, activityLogs };
}

getActivity().catch(console.error);
