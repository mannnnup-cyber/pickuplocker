import { NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';

export async function GET() {
  try {
    const config = await getDimepayConfig();

    // Check if SDK credentials are set (Client ID + Secret Key)
    const hasSdkCredentials = !!(config.clientId && config.secretKey);
    const hasApiCredentials = !!(config.apiKey && config.merchantId);
    const hasCredentials = hasSdkCredentials || hasApiCredentials;

    if (!hasCredentials) {
      return NextResponse.json({
        success: false,
        error: 'DimePay not configured',
        details: {
          mode: config.sandboxMode ? 'sandbox' : 'live',
          // SDK credentials (preferred)
          hasClientId: !!config.clientId,
          hasSecretKey: !!config.secretKey,
          // API credentials (alternative)
          hasApiKey: !!config.apiKey,
          hasMerchantId: !!config.merchantId,
          message: 'Please set Client ID + Secret Key (for SDK) OR API Key + Merchant ID in Settings'
        }
      });
    }

    const results: Record<string, unknown> = {
      config: {
        baseUrl: config.baseUrl,
        sandboxMode: config.sandboxMode,
        mode: config.sandboxMode ? 'sandbox' : 'live',
        integrationType: hasSdkCredentials ? 'SDK/Widget' : 'Direct API',
        credentials: hasSdkCredentials ? {
          type: 'Client ID + Secret Key (SDK)',
          clientIdPrefix: config.clientId?.substring(0, 15) + '...',
          hasSecretKey: !!config.secretKey,
          validPrefix: config.sandboxMode 
            ? config.clientId?.startsWith('ck_test_')
            : config.clientId?.startsWith('ck_live_')
        } : {
          type: 'API Key + Merchant ID (Direct)',
          apiKeyPrefix: config.apiKey?.substring(0, 8) + '...',
          merchantId: config.merchantId
        }
      },
      tests: []
    };

    // Test 1: DNS/Connectivity check
    try {
      const dnsStart = Date.now();
      const dnsTest = await fetch(config.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
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

    // Test 2: Validate credentials format
    if (hasSdkCredentials) {
      const expectedPrefix = config.sandboxMode ? 'ck_test_' : 'ck_live_';
      const hasValidPrefix = config.clientId?.startsWith(expectedPrefix);
      
      if (!hasValidPrefix) {
        results.tests.push({
          name: 'Credential Validation',
          success: false,
          message: `Client ID should start with ${expectedPrefix} for ${config.sandboxMode ? 'sandbox' : 'live'} mode. Current prefix: ${config.clientId?.substring(0, 10)}...`
        });
      } else {
        results.tests.push({
          name: 'Credential Validation',
          success: true,
          message: `Client ID has correct prefix (${expectedPrefix})`
        });
      }
    } else {
      // API Key format validation
      if (config.apiKey && !config.apiKey.startsWith('sk_')) {
        results.tests.push({
          name: 'Credential Validation',
          success: false,
          message: 'API Key should start with sk_ prefix'
        });
      } else {
        results.tests.push({
          name: 'Credential Validation',
          success: true,
          message: 'API Key has correct format (sk_ prefix)'
        });
      }
    }

    // Test 3: SDK Integration info
    results.tests.push({
      name: 'Integration Info',
      success: true,
      message: hasSdkCredentials 
        ? 'Ready for SDK/Widget integration. Use initPayment() with the SDK config.'
        : 'Using Direct API mode. Consider switching to SDK credentials for embedded widget.',
      note: 'Webhook URL: https://pickuplocker.vercel.app/api/webhooks/dimepay'
    });

    const allTestsPassed = results.tests.every((t: {success: boolean}) => t.success);

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed 
        ? 'DimePay configuration looks good!' 
        : 'DimePay configuration has issues',
      results,
      recommendation: hasSdkCredentials 
        ? 'SDK credentials configured. Frontend can use @dimepay/web-sdk initPayment()'
        : 'Consider adding Client ID + Secret Key for better SDK/Widget integration'
    });

  } catch (error) {
    console.error('DimePay verify error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
