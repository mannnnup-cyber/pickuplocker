import { NextRequest, NextResponse } from 'next/server';
import { 
  getBoxListWithCredentials, 
  getBoxLogWithCredentials,
  getBoxUsedInfoWithCredentials,
  getConfigAsync,
  type BestwondCredentials 
} from '@/lib/bestwond';

// Debug endpoint to investigate ALL available historical data from Bestwond
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    
    const config = await getConfigAsync();
    
    if (!config.appId || !config.appSecret) {
      return NextResponse.json({ 
        error: 'Bestwond credentials not configured' 
      }, { status: 401 });
    }

    // Use provided deviceId or global one
    const targetDeviceId = deviceId || config.deviceId;
    
    const credentials: BestwondCredentials = {
      appId: config.appId,
      appSecret: config.appSecret,
      baseUrl: config.baseUrl || 'https://api.bestwond.com',
    };

    const results: Record<string, unknown> = {
      deviceId: targetDeviceId,
      appId: config.appId.substring(0, 15) + '...',
      timestamp: new Date().toISOString(),
    };

    // 1. Get current box list - shows ALL boxes regardless of app_id
    console.log('=== Fetching Box List ===');
    const boxList = await getBoxListWithCredentials(targetDeviceId, credentials);
    results['boxList'] = {
      code: boxList.code,
      msg: boxList.msg,
      total: Array.isArray(boxList.data) ? boxList.data.length : 0,
      occupied: Array.isArray(boxList.data) 
        ? boxList.data.filter((b: { order_no?: string | null }) => b.order_no).length 
        : 0,
      boxes: Array.isArray(boxList.data) 
        ? boxList.data.map((b: { 
            box_name: string; 
            box_size?: string; 
            order_no?: string | null; 
            save_time?: string; 
            pick_code?: string;
          }) => ({
            name: b.box_name,
            size: b.box_size,
            order_no: b.order_no,
            save_time: b.save_time,
            pick_code: b.pick_code,
          }))
        : [],
    };

    // 2. Get box usage info via Express API
    console.log('=== Fetching Box Used Info ===');
    const boxUsedInfo = await getBoxUsedInfoWithCredentials(targetDeviceId, credentials);
    results['boxUsedInfo'] = {
      code: boxUsedInfo.code,
      msg: boxUsedInfo.msg,
      data: boxUsedInfo.data,
    };

    // 3. Try box log API with different parameters
    console.log('=== Testing Box Log API ===');
    
    // Test 1: Standard log request
    const logTest1 = await getBoxLogWithCredentials(targetDeviceId, credentials, {
      pageNum: 1,
      pageSize: 100,
    });
    results['boxLog_standard'] = {
      code: logTest1.code,
      msg: logTest1.msg,
      data: logTest1.data,
    };

    // Test 2: Try fetching logs for each occupied box individually
    const occupiedBoxes = Array.isArray(boxList.data) 
      ? boxList.data.filter((b: { order_no?: string | null }) => b.order_no)
      : [];
    
    if (occupiedBoxes.length > 0) {
      const boxLogs: Record<string, unknown> = {};
      
      for (const box of occupiedBoxes.slice(0, 3)) { // Limit to first 3 boxes
        const boxNo = parseInt((box as { box_name: string }).box_name, 10);
        const logResult = await getBoxLogWithCredentials(targetDeviceId, credentials, {
          boxNo: boxNo,
          pageNum: 1,
          pageSize: 50,
        });
        boxLogs[(box as { box_name: string }).box_name] = {
          code: logResult.code,
          msg: logResult.msg,
          data: logResult.data,
        };
      }
      
      results['boxLogs_perBox'] = boxLogs;
    }

    // 4. Summary and Recommendations
    interface SummaryBox {
      name: string;
      save_time?: string;
    }
    
    const summary = {
      totalBoxes: (results['boxList'] as { total: number }).total,
      occupiedBoxes: (results['boxList'] as { occupied: number }).occupied,
      canSeeAllOccupiedBoxes: true, // boxList shows all boxes regardless of app_id
      canSeeHistoricalLogs: logTest1.code === 0,
      logApiError: logTest1.code !== 0 ? `${logTest1.code}: ${logTest1.msg}` : null,
      notes: [] as string[],
    };

    // Add analysis notes
    if (summary.occupiedBoxes > 0) {
      summary.notes.push(`✓ Found ${summary.occupiedBoxes} occupied box(es) in box list`);
      summary.notes.push('✓ Box list API shows ALL occupied boxes regardless of which app created them');
      
      // Check if we have order details
      const boxes = (results['boxList'] as { boxes: SummaryBox[] }).boxes || [];
      const boxesWithDetails = boxes.filter(b => b.save_time);
      if (boxesWithDetails.length > 0) {
        summary.notes.push(`✓ ${boxesWithDetails.length} box(es) have save_time details`);
      }
    }

    if (logTest1.code !== 0) {
      summary.notes.push('⚠ Box log API returns error - likely because each app_id can only see its own logs');
      summary.notes.push('⚠ Historical activity from other apps (like Business WW) cannot be retrieved');
    } else {
      summary.notes.push('✓ Box log API working - can see historical activity');
    }

    // What data IS available
    summary.notes.push('');
    summary.notes.push('=== DATA VISIBILITY ===');
    summary.notes.push('✅ Current occupancy (boxList): Visible for ALL orders regardless of app_id');
    summary.notes.push('❌ Historical logs (boxLog): Only visible for orders created with your app_id');
    summary.notes.push('⚠️  Order details: Limited to what boxList returns (order_no, save_time, pick_code)');

    results['summary'] = summary;

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    console.error('Debug box history error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
