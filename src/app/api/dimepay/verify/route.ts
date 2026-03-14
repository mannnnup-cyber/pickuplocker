import { NextResponse } from 'next/server';
import { getDimepayConfig } from '@/lib/settings';

export async function GET() {
  try {
    const config = await getDimepayConfig();

    // Check if credentials are set
    if (!config.apiKey || !config.merchantId) {
      return NextResponse.json({
        success: false,
        error: 'DimePay not configured',
        details: {
          apiKeySet: !!config.apiKey,
          merchantIdSet: !!config.merchantId,
          message: 'Please set API Key and Merchant ID in Settings'
        }
      });
    }

    const testUrl = `${config.baseUrl}/payments?limit=1`;
    const results: Record<string, unknown> = {
      config: {
        baseUrl: config.baseUrl,
        sandboxMode: config.sandboxMode,
        merchantId: config.merchantId,
        apiKeyLength: config.apiKey?.length || 0,
        apiKeyPrefix: config.apiKey?.substring(0, 8) + '...' || 'N/A'
      },
      testUrl: testUrl,
      tests: []
    };

    // Test 1: Basic DNS/Connectivity check
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
        message: `Base URL reachable (${dnsTest.status})`
      });
    } catch (dnsError) {
      results.tests.push({
        name: 'DNS/Connectivity',
        success: false,
        error: dnsError instanceof Error ? dnsError.message : 'Unknown error',
        message: 'Cannot reach DimePay server - check URL or network'
      });

      // If we can't even reach the base URL, return early
      return NextResponse.json({
        success: false,
        error: 'Cannot reach DimePay server',
        results
      });
    }

    // Test 2: API Authentication test
    try {
      const apiStart = Date.now();
      const apiTest = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Merchant-ID': config.merchantId,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      const apiLatency = Date.now() - apiStart;

      let responseDetails: Record<string, unknown> = {
        status: apiTest.status,
        statusText: apiTest.statusText,
        latency: apiLatency
      };

      // Try to get response body
      try {
        const responseText = await apiTest.text();
        if (responseText) {
          try {
            responseDetails.body = JSON.parse(responseText);
          } catch {
            responseDetails.body = responseText.substring(0, 500);
          }
        }
      } catch {
        responseDetails.body = 'Could not read response';
      }

      if (apiTest.ok) {
        results.tests.push({
          name: 'API Authentication',
          success: true,
          ...responseDetails,
          message: 'API connection successful!'
        });

        return NextResponse.json({
          success: true,
          message: 'DimePay connection verified',
          results
        });
      } else if (apiTest.status === 401) {
        results.tests.push({
          name: 'API Authentication',
          success: false,
          ...responseDetails,
          message: 'Invalid API Key - check your credentials'
        });
      } else if (apiTest.status === 403) {
        results.tests.push({
          name: 'API Authentication',
          success: false,
          ...responseDetails,
          message: 'Access forbidden - check Merchant ID'
        });
      } else if (apiTest.status === 404) {
        results.tests.push({
          name: 'API Authentication',
          success: false,
          ...responseDetails,
          message: 'Endpoint not found - API may use different path structure'
        });
      } else {
        results.tests.push({
          name: 'API Authentication',
          success: false,
          ...responseDetails,
          message: `API returned status ${apiTest.status}`
        });
      }
    } catch (apiError) {
      results.tests.push({
        name: 'API Authentication',
        success: false,
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        message: 'Failed to call DimePay API'
      });
    }

    // Test 3: Try alternative endpoints
    const alternativeEndpoints = [
      '/health',
      '/status',
      '/merchant',
      '/merchants/me',
      '/cards',
      '/transactions'
    ];

    for (const endpoint of alternativeEndpoints) {
      try {
        const altUrl = `${config.baseUrl}${endpoint}`;
        const altTest = await fetch(altUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'X-Merchant-ID': config.merchantId,
          },
          signal: AbortSignal.timeout(5000)
        });

        if (altTest.ok) {
          results.tests.push({
            name: `Alternative: ${endpoint}`,
            success: true,
            status: altTest.status,
            url: altUrl,
            message: 'Working endpoint found!'
          });
          break;
        }
      } catch {
        // Skip failed alternative tests
      }
    }

    return NextResponse.json({
      success: results.tests.some((t: {success: boolean}) => t.success),
      results
    });

  } catch (error) {
    console.error('DimePay test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
