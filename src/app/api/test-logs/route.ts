import { NextRequest, NextResponse } from 'next/server';
import { 
  getBoxLogWithCredentials, 
  getBoxListWithCredentials,
  getConfigAsync,
  type BestwondCredentials 
} from '@/lib/bestwond';

// GET /api/test-logs - Test what historical data is available from Bestwond
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId') || '2100018247';
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    
    // Get credentials from settings/env
    const config = await getConfigAsync();
    
    if (!config.appId || !config.appSecret) {
      return NextResponse.json({
        success: false,
        error: 'Bestwond credentials not configured',
        hint: 'Set BESTWOND_APP_ID and BESTWOND_APP_SECRET in environment variables or Settings page',
        envCheck: {
          hasAppId: !!process.env.BESTWOND_APP_ID,
          hasAppSecret: !!process.env.BESTWOND_APP_SECRET,
          hasDeviceId: !!process.env.BESTWOND_DEVICE_ID,
        }
      }, { status: 401 });
    }
    
    const credentials: BestwondCredentials = {
      appId: config.appId,
      appSecret: config.appSecret,
      baseUrl: config.baseUrl || 'https://api.bestwond.com',
    };
    
    console.log('Testing logs for device:', deviceId);
    console.log('Using app_id:', config.appId.substring(0, 10) + '...');
    
    // Get box log with large page size
    console.log('Fetching box logs...');
    const logResult = await getBoxLogWithCredentials(deviceId, credentials, {
      pageNum: 1,
      pageSize: pageSize,
    });
    
    // Get current box status
    console.log('Fetching current box status...');
    const boxListResult = await getBoxListWithCredentials(deviceId, credentials);
    
    const response = {
      success: true,
      deviceId: deviceId,
      appId: config.appId.substring(0, 15) + '...',
      timestamp: new Date().toISOString(),
      boxLog: {
        code: logResult.code,
        msg: logResult.msg,
        total: 0,
        count: 0,
        logs: [] as Array<{
          taskId: number;
          boxName: string;
          action: string;
          actionTime: string;
          remark: string;
        }>,
      },
      currentBoxes: {
        code: boxListResult.code,
        msg: boxListResult.msg,
        total: 0,
        occupied: 0,
        boxes: [] as Array<{
          boxName: string;
          size: string;
          orderNo: string | null;
          pickCode: string | null;
          saveTime: string | null;
        }>,
      },
      analysis: {
        dateRange: null as { earliest: string; latest: string } | null,
        actions: {} as Record<string, number>,
        orderNumbersFound: [] as string[],
      },
    };
    
    // Process box log results
    if (logResult.code === 0 && logResult.data) {
      const logData = logResult.data as {
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
      response.boxLog.total = logData.total || logs.length;
      response.boxLog.count = logs.length;
      
      response.boxLog.logs = logs.map(log => ({
        taskId: log.task_id,
        boxName: log.box_name,
        action: log.action,
        actionTime: log.action_time,
        remark: log.remark,
      }));
      
      // Analyze logs
      const actions: Record<string, number> = {};
      const orderNumbers = new Set<string>();
      const dates: number[] = [];
      
      logs.forEach(log => {
        // Count actions
        actions[log.action] = (actions[log.action] || 0) + 1;
        
        // Extract order numbers from remarks
        if (log.remark) {
          const matches = log.remark.match(/\d{4,}/g);
          if (matches) {
            matches.forEach(m => orderNumbers.add(m));
          }
        }
        
        // Track dates
        const date = new Date(log.action_time).getTime();
        if (!isNaN(date)) dates.push(date);
      });
      
      response.analysis.actions = actions;
      response.analysis.orderNumbersFound = Array.from(orderNumbers).slice(0, 50);
      
      if (dates.length > 0) {
        response.analysis.dateRange = {
          earliest: new Date(Math.min(...dates)).toISOString(),
          latest: new Date(Math.max(...dates)).toISOString(),
        };
      }
    }
    
    // Process current box status
    if (boxListResult.code === 0 && boxListResult.data) {
      const boxes = Array.isArray(boxListResult.data) ? boxListResult.data : [];
      
      response.currentBoxes.total = boxes.length;
      
      const occupied = boxes.filter(b => (b as { order_no?: string | null }).order_no);
      response.currentBoxes.occupied = occupied.length;
      
      response.currentBoxes.boxes = occupied.map(box => {
        const b = box as {
          box_name: string;
          box_size?: string;
          order_no?: string | null;
          pick_code?: string;
          save_time?: string;
        };
        return {
          boxName: b.box_name,
          size: b.box_size || 'Unknown',
          orderNo: b.order_no || null,
          pickCode: b.pick_code || null,
          saveTime: b.save_time || null,
        };
      });
    }
    
    return NextResponse.json(response, { status: 200 });
    
  } catch (error) {
    console.error('Test logs error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
    }, { status: 500 });
  }
}
