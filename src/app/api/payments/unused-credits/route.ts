import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Unused Drop-off Credits API
 * 
 * Shows payments that were made but the save code was never used
 * (Customer paid but never dropped off an item)
 * 
 * GET /api/payments/unused-credits
 */
export async function GET(request: NextRequest) {
  try {
    // Get all SDK payment sessions from settings
    const settings = await db.setting.findMany({
      where: {
        key: { startsWith: 'sdk_payment_' }
      }
    });

    const unusedCredits: Array<{
      paymentReference: string;
      amount: number;
      boxSize: string;
      saveCode: string;
      pickCode: string;
      customerPhone: string;
      customerEmail: string | null;
      createdAt: string;
      completedAt: string | null;
      status: string;
    }> = [];

    for (const setting of settings) {
      try {
        const paymentData = JSON.parse(setting.value);
        
        // Only process completed payments
        if (paymentData.status !== 'COMPLETED') continue;

        const saveCode = paymentData.metadata?.saveCode;
        if (!saveCode) continue;

        // Check if this save code was ever used (exists in ExpressOrder)
        const existingOrder = await db.expressOrder.findFirst({
          where: { saveCode }
        });

        // If no order exists, this credit was paid for but never used
        if (!existingOrder) {
          unusedCredits.push({
            paymentReference: setting.key.replace('sdk_payment_', ''),
            amount: paymentData.amount,
            boxSize: paymentData.metadata?.boxSize || 'Unknown',
            saveCode,
            pickCode: paymentData.metadata?.pickCode || 'N/A',
            customerPhone: paymentData.metadata?.customerPhone || 'Unknown',
            customerEmail: paymentData.metadata?.customerEmail || null,
            createdAt: new Date(paymentData.createdAt).toISOString(),
            completedAt: paymentData.completedAt ? new Date(paymentData.completedAt).toISOString() : null,
            status: 'UNUSED',
          });
        }
      } catch (parseError) {
        console.error('Failed to parse payment setting:', setting.key);
      }
    }

    // Also check demo payments
    const demoSettings = await db.setting.findMany({
      where: {
        key: { startsWith: 'demo_payment_' }
      }
    });

    for (const setting of demoSettings) {
      try {
        const paymentData = JSON.parse(setting.value);
        
        if (paymentData.status !== 'COMPLETED') continue;

        const saveCode = paymentData.saveCode;
        if (!saveCode) continue;

        const existingOrder = await db.expressOrder.findFirst({
          where: { saveCode }
        });

        if (!existingOrder) {
          unusedCredits.push({
            paymentReference: setting.key.replace('demo_payment_', ''),
            amount: paymentData.amount,
            boxSize: paymentData.boxSize || 'Unknown',
            saveCode,
            pickCode: paymentData.pickCode || 'N/A',
            customerPhone: paymentData.phone || 'Unknown',
            customerEmail: paymentData.email || null,
            createdAt: new Date(paymentData.createdAt).toISOString(),
            completedAt: null,
            status: 'UNUSED (DEMO)',
          });
        }
      } catch (parseError) {
        console.error('Failed to parse demo payment setting:', setting.key);
      }
    }

    // Sort by created date descending (newest first)
    unusedCredits.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Calculate total value of unused credits
    const totalValue = unusedCredits.reduce((sum, credit) => sum + credit.amount, 0);

    return NextResponse.json({
      success: true,
      data: unusedCredits,
      summary: {
        count: unusedCredits.length,
        totalValue,
        oldestUnused: unusedCredits.length > 0 ? unusedCredits[unusedCredits.length - 1].createdAt : null,
        newestUnused: unusedCredits.length > 0 ? unusedCredits[0].createdAt : null,
      },
    });

  } catch (error) {
    console.error('Unused credits API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch unused credits',
    }, { status: 500 });
  }
}
