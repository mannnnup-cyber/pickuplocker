import { NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';

export async function GET() {
  try {
    const config = await getDimepayConfig();

    // Check if credentials are set based on mode
    const hasCredentials = config.sandboxMode 
      ? !!(config.sandboxClientId && config.sandboxSecretKey)
      : !!(config.liveClientId && config.liveSecretKey);

    if (!hasCredentials) {
      return NextResponse.json({
        success: false,
        error: 'DimePay not configured',
        details: {
          mode: config.sandboxMode ? 'sandbox' : 'live',
          sandboxClientIdSet: !!config.sandboxClientId,
          sandboxSecretKeySet: !!config.sandboxSecretKey,
          liveClientIdSet: !!config.liveClientId,
          liveSecretKeySet: !!config.liveSecretKey,
          message: `Please set ${config.sandboxMode ? 'Sandbox' : 'Live'} credentials in Settings`
        }
      });
    }

    const results: Record<string, unknown> = {
      config: {
        baseUrl: config.baseUrl,
        sandboxMode: config.sandboxMode,
        mode: config.sandboxMode ? 'sandbox' : 'live',
        clientIdPrefix: (config.sandboxMode ? config.sandboxClientId : config.liveClientId)?.substring(0, 10) + '...' || 'N/A',
        hasClientId: !!(config.sandboxMode ? config.sandboxClientId : config.liveClientId),
        hasSecretKey: !!(config.sandboxMode ? config.sandboxSecretKey : config.liveSecretKey),
      },
      tests: []
    };

    // Test 1: Basic DNS/Connectivity check to api.dimepay.com
    try {
      const dnsStart = Date.now();
      const dnsTest = await fetch(config.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      const dnsLatency = Date.now() - dnsStart;

      results.tests.push({
        name: 'DNS/Connectivity',
        success: true,
        status: dnsTest.status,
        latency: dnsLatency,
        message: `DimePay server reachable (${dnsTest.status})`
      });
    } catch (dnsError) {
      results.tests.push({
        name: 'DNS/Connectivity',
        success: false,
        error: dnsError instanceof Error ? dnsError.message : 'Unknown error',
        message: 'Cannot reach DimePay server'
      });

      return NextResponse.json({
        success: false,
        error: 'Cannot reach DimePay server',
        results
      });
    }

    // Validate Client ID prefix
    const clientId = config.sandboxMode ? config.sandboxClientId : config.liveClientId;
    if (config.sandboxMode && clientId && !clientId.startsWith('ck_test_')) {
      results.tests.push({
        name: 'Credential Validation',
        success: false,
        message: 'Warning: Sandbox mode is on but Client ID does not start with ck_test_'
      });
    } else if (!config.sandboxMode && clientId && !clientId.startsWith('ck_live_')) {
      results.tests.push({
        name: 'Credential Validation',
        success: false,
        message: 'Warning: Live mode is on but Client ID does not start with ck_live_'
      });
    } else {
      results.tests.push({
        name: 'Credential Validation',
        success: true,
        message: `Client ID has correct prefix (${config.sandboxMode ? 'ck_test_' : 'ck_live_'})`
      });
    }

    // DimePay uses SDK-based integration, not direct API calls
    // The actual payment flow uses initPayment() from @dimepay/web-sdk
    results.tests.push({
      name: 'Integration Method',
      success: true,
      message: 'DimePay uses SDK-based integration (initPayment). Configure webhook URL: https://your-domain.com/api/webhooks/dimepay'
    });

    const allTestsPassed = results.tests.every((t: {success: boolean}) => t.success);

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed ? 'DimePay configuration looks good!' : 'DimePay configuration has issues',
      results,
      note: 'DimePay uses client-side SDK for payments. Make sure your domain is authorized in DimePay dashboard.'
    });

  } catch (error) {
    console.error('DimePay verify error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
