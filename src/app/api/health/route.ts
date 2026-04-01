import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Health check - short cache, no edge runtime due to DB access
export const revalidate = 5;

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  message: string;
  details?: Record<string, unknown>;
}

export async function GET() {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

  // 1. Database check
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    
    checks.push({
      name: 'Database',
      status: dbLatency < 100 ? 'healthy' : dbLatency < 500 ? 'degraded' : 'unhealthy',
      latency: dbLatency,
      message: 'Connected',
      details: { type: 'PostgreSQL (Supabase)' },
    });
  } catch (error) {
    checks.push({
      name: 'Database',
      status: 'unhealthy',
      message: 'Connection failed',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }

  // 2. Environment check
  const requiredEnvVars = [
    'DATABASE_URL',
    'BESTWOND_APP_ID',
    'BESTWOND_APP_SECRET',
    'TEXTBEE_API_KEY',
    'TEXTBEE_DEVICE_ID',
    'DIMEPAY_API_KEY',
    'DIMEPAY_MERCHANT_ID',
    'CRON_SECRET',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  checks.push({
    name: 'Environment',
    status: missingEnvVars.length === 0 ? 'healthy' : 'degraded',
    message: missingEnvVars.length === 0 
      ? 'All required variables set' 
      : `Missing: ${missingEnvVars.join(', ')}`,
    details: {
      required: requiredEnvVars.length,
      missing: missingEnvVars.length,
    },
  });

  // 3. Database stats
  try {
    const [deviceCount, orderCount, userCount] = await Promise.all([
      db.device.count(),
      db.order.count(),
      db.user.count(),
    ]);

    checks.push({
      name: 'Statistics',
      status: 'healthy',
      message: 'Data available',
      details: { devices: deviceCount, orders: orderCount, users: userCount },
    });
  } catch {
    checks.push({
      name: 'Statistics',
      status: 'degraded',
      message: 'Could not fetch stats',
    });
  }

  // Determine overall status
  const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');
  const hasDegraded = checks.some((c) => c.status === 'degraded');
  
  const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';
  const totalLatency = Date.now() - startTime;

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
    latency: totalLatency,
    checks,
  }, {
    status: overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503,
  });
}
