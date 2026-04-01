import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Email Logs API
 * 
 * GET - List all email activity logs
 * Shows emails sent to customers (payment confirmations, save codes, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const action = searchParams.get('action'); // Filter by action type

    // Build where clause - show email-related activities
    const where: any = {};
    if (action) {
      where.action = action;
    } else {
      // By default, show email-related activities
      where.action = {
        in: ['EMAIL_SENT', 'DROPOFF_CREDIT_PAYMENT', 'EMAIL_REPORT_SENT', 'PAYMENT_COMPLETED']
      };
    }

    // Fetch email activity logs
    const activities = await db.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count
    const total = await db.activity.count({ where });

    // Parse metadata and format for display
    const emailLogs = activities.map(activity => {
      let metadata = {};
      try {
        metadata = activity.metadata ? JSON.parse(activity.metadata as string) : {};
      } catch {
        metadata = {};
      }

      return {
        id: activity.id,
        action: activity.action,
        description: activity.description,
        createdAt: activity.createdAt,
        metadata,
      };
    });

    return NextResponse.json({
      success: true,
      data: emailLogs,
      total,
      hasMore: total > offset + limit,
    });

  } catch (error) {
    console.error('Email logs API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch email logs',
    }, { status: 500 });
  }
}
