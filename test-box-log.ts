// Test script to check what the box log API returns
import { getBoxLogWithCredentials, getBoxListWithCredentials, getConfigAsync, type BestwondCredentials } from './src/lib/bestwond';

async function testBoxLog() {
  console.log('=== TESTING BOX LOG API ===\n');
  
  // Get credentials
  const config = await getConfigAsync();
  
  if (!config.appId || !config.appSecret) {
    console.error('ERROR: No Bestwond credentials found!');
    console.log('Please set BESTWOND_APP_ID and BESTWOND_APP_SECRET in environment or settings');
    return;
  }
  
  const credentials: BestwondCredentials = {
    appId: config.appId,
    appSecret: config.appSecret,
    baseUrl: config.baseUrl || 'https://api.bestwond.com',
  };
  
  const deviceId = config.deviceId || '2100018247';
  
  console.log('Device ID:', deviceId);
  console.log('App ID:', config.appId.substring(0, 15) + '...');
  console.log('');
  
  // Get box log with large page size to see all history
  console.log('Fetching box logs (last 100 records)...\n');
  
  const result = await getBoxLogWithCredentials(deviceId, credentials, {
    pageNum: 1,
    pageSize: 100,
  });
  
  console.log('Response code:', result.code);
  console.log('Response msg:', result.msg);
  
  if (result.code === 0 && result.data) {
    const logData = result.data as { 
      list?: Array<{
        task_id: number;
        box_name: string;
        action: string;
        action_time: string;
        remark: string;
      }>;
      total?: number;
    };
    
    const logs = logData.list || [];
    console.log('\n=== BOX LOG RESULTS ===');
    console.log('Total records:', logData.total || logs.length);
    console.log('Records returned:', logs.length);
    
    if (logs.length > 0) {
      console.log('\n--- Recent Activity (first 30) ---');
      logs.slice(0, 30).forEach((log, idx) => {
        console.log(`${idx + 1}. Box ${log.box_name} | ${log.action.toUpperCase()} | ${log.action_time} | ${log.remark || 'no remark'}`);
      });
      
      // Check for order numbers in remarks
      const ordersFound = new Set<string>();
      logs.forEach(log => {
        if (log.remark) {
          // Extract order numbers (could be various formats)
          const matches = log.remark.match(/\d{4,}/g);
          if (matches) {
            matches.forEach(m => ordersFound.add(m));
          }
        }
      });
      
      if (ordersFound.size > 0) {
        console.log('\n--- Order Numbers Found in Logs ---');
        console.log(Array.from(ordersFound).slice(0, 20).join(', '));
      }
      
      // Check date range
      if (logs.length > 0) {
        const dates = logs.map(l => new Date(l.action_time).getTime()).filter(d => !isNaN(d));
        if (dates.length > 0) {
          const earliest = new Date(Math.min(...dates));
          const latest = new Date(Math.max(...dates));
          console.log('\n--- Date Range ---');
          console.log('Earliest record:', earliest.toLocaleString());
          console.log('Latest record:', latest.toLocaleString());
        }
      }
    } else {
      console.log('\nNo logs found.');
    }
  } else {
    console.log('Failed to get box logs. Code:', result.code, 'Msg:', result.msg);
  }
  
  // Also check the box list for currently occupied boxes
  console.log('\n=== CHECKING CURRENT BOX STATUS ===');
  
  const boxListResult = await getBoxListWithCredentials(deviceId, credentials);
  
  if (boxListResult.code === 0 && boxListResult.data) {
    const boxes = boxListResult.data as Array<{
      box_name: string;
      box_size?: string;
      order_no?: string | null;
      save_time?: string | null;
      pick_code?: string;
    }>;
    
    const occupied = boxes.filter(b => b.order_no);
    console.log('Total boxes:', boxes.length);
    console.log('Currently occupied:', occupied.length);
    
    if (occupied.length > 0) {
      console.log('\n--- Occupied Boxes ---');
      occupied.forEach(box => {
        console.log(`Box ${box.box_name} (${box.box_size || '?'}) | Order: ${box.order_no} | Pick Code: ${box.pick_code || 'N/A'} | Stored: ${box.save_time || 'N/A'}`);
      });
    }
  } else {
    console.log('Failed to get box list. Code:', boxListResult.code, 'Msg:', boxListResult.msg);
  }
}

testBoxLog().catch(console.error);
