import { NextResponse } from 'next/server';
import { 
  getConfigAsync, 
  getBoxListWithCredentials, 
  getBoxLogWithCredentials,
  getDeviceStatusWithCredentials,
  getBoxUsedInfoWithCredentials
} from '@/lib/bestwond';

// Debug endpoint to investigate Bestwond API data visibility
export async function GET() {
  try {
    const config = await getConfigAsync();
    
    if (!config.deviceId || !config.appId) {
      return NextResponse.json({ 
        error: 'Bestwond credentials not configured',
        hasDeviceId: !!config.deviceId,
        hasAppId: !!config.appId,
      });
    }

    const results: Record<string, unknown> = {
      config: {
        deviceId: config.deviceId,
        appIdPrefix: config.appId.substring(0, 15) + '...',
      }
    };

    // Test 1: Device Status
    const deviceStatus = await getDeviceStatusWithCredentials(config.deviceId, config);
    results['deviceStatus'] = {
      code: deviceStatus.code,
      msg: deviceStatus.msg,
      data: deviceStatus.data,
    };

    // Test 2: Box List - Shows ALL boxes and their occupancy state
    // This is the key test - does it show boxes occupied by OTHER apps?
    const boxList = await getBoxListWithCredentials(config.deviceId, config);
    results['boxList'] = {
      code: boxList.code,
      msg: boxList.msg,
      totalBoxes: Array.isArray(boxList.data) ? boxList.data.length : 0,
      occupiedBoxes: Array.isArray(boxList.data) 
        ? boxList.data.filter((b: any) => b.order_no).map((b: any) => ({
            box_name: b.box_name,
            box_size: b.box_size,
            order_no: b.order_no,
            save_time: b.save_time,
            pick_code: b.pick_code,
          }))
        : [],
    };

    // Test 3: Box Used Info API - Specifically for express/locker usage
    const boxUsedInfo = await getBoxUsedInfoWithCredentials(config.deviceId, config);
    results['boxUsedInfo'] = {
      code: boxUsedInfo.code,
      msg: boxUsedInfo.msg,
      data: boxUsedInfo.data,
    };

    // Test 4: Box Logs - Likely filtered by app_id
    const boxLog = await getBoxLogWithCredentials(config.deviceId, config, {
      pageNum: 1,
      pageSize: 50,
    });
    results['boxLog'] = {
      code: boxLog.code,
      msg: boxLog.msg,
      totalLogs: (boxLog.data as any)?.list?.length || 0,
      logs: (boxLog.data as any)?.list?.slice(0, 10) || [],
    };

    // Analysis
    const analysis = {
      boxListShowsOccupiedFromOtherApps: false,
      boxLogFilteredByAppId: false,
      notes: [] as string[],
    };

    // If box list shows occupied boxes but log shows 0 entries,
    // it means the boxes are occupied by a different app_id
    const occupiedCount = (results['boxList'] as any).occupiedBoxes.length;
    const logCount = (results['boxLog'] as any).totalLogs;
    
    if (occupiedCount > 0 && logCount === 0) {
      analysis.notes.push(`⚠️ ${occupiedCount} boxes are occupied but 0 logs visible - likely occupied by different app_id`);
    } else if (occupiedCount > 0 && logCount > 0) {
      // Check if log count matches what we expect
      analysis.notes.push(`✓ ${occupiedCount} occupied boxes and ${logCount} logs visible`);
    } else if (occupiedCount === 0 && logCount > 0) {
      analysis.notes.push(`No currently occupied boxes but ${logCount} historical logs visible`);
    } else {
      analysis.notes.push('No occupied boxes and no logs visible');
    }

    results['analysis'] = analysis;

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
