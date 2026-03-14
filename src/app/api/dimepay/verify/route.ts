import { NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';

export async function GET() {
  try {
    const config = await getDimepayConfig();

    // Check if ANY credentials are set
    const hasCredentials = config.hasApiCredentials || config.hasClientCredentials;

    if (!hasCredentials) {
      return NextResponse.json({
        success: false,
        error: 'DimePay not configured',
        details: {
          mode: config.sandboxMode ? 'sandbox' : 'live',
          // API Key format
          hasApiKey: !!config.apiKey,
          hasMerchantId: !!config.merchantId,
          // Client ID format
          hasClientId: !!config.clientId,
          hasSecretKey: !!config.secretKey,
          message: 'Please set either API Key + Merchant ID OR Client ID + Secret Key in Settings'
        }
      });
    }

    const results: Record<string, unknown> = {
      config: {
        baseUrl: config.baseUrl,
        sandboxMode: config.sandboxMode,
        mode: config.sandboxMode ? 'sandbox' : 'live',
        useApiFormat: config.useApiFormat,
        // Show which credentials are being used
        credentials: config.useApiFormat ? {
          type: 'API Key + Merchant ID',
          apiKeyPrefix: config.apiKey?.substring(0, 8) + '...' || 'N/A',
          merchantId: config.merchantId
        } : {
          type: 'Client ID + Secret Key',
          clientIdPrefix: config.clientId?.substring(0, 10) + '...' || 'N/A',
          hasSecretKey: !!config.secretKey
        }
      },
      tests: []
    };

    // Test 1: Basic DNS/Connectivity check to api.dimepay.com
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
    if (config.useApiFormat) {
      // Validate API Key format
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
    } else {
      // Validate Client ID format
      const expectedPrefix = config.sandboxMode ? 'ck_test_' : 'ck_live_';
      if (config.clientId && !config.clientId.startsWith(expectedPrefix)) {
        results.tests.push({
          name: 'Credential Validation',
          success: false,
          message: `Client ID should start with ${expectedPrefix} for ${config.sandboxMode ? 'sandbox' : 'live'} mode`
        });
      } else if (config.clientId) {
        results.tests.push({
          name: 'Credential Validation',
          success: true,
          message: `Client ID has correct prefix (${expectedPrefix})`
        });
      }
    }

    // DimePay uses SDK-based integration for payments
    results.tests.push({
      name: 'Integration Info',
      success: true,
      message: 'DimePay uses SDK-based integration. Configure webhook: https://your-domain.com/api/webhooks/dimepay'
    });

    const allTestsPassed = results.tests.every((t: {success: boolean}) => t.success);

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed ? 'DimePay configuration looks good!' : 'DimePay configuration has issues',
      results
    });

  } catch (error) {
    console.error('DimePay verify error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
