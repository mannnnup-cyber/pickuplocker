import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get all available boxes grouped by size
    const boxes = await prisma.box.findMany({
      where: {
        status: 'AVAILABLE',
      },
      select: {
        id: true,
        size: true,
        boxNumber: true,
        device: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
      },
    });

    // Group by size
    const sizeCounts: Record<string, number> = {
      S: 0,
      M: 0,
      L: 0,
      XL: 0,
    };

    boxes.forEach((box) => {
      const size = box.size || 'M'; // Default to M if no size
      if (sizeCounts.hasOwnProperty(size)) {
        sizeCounts[size]++;
      } else {
        sizeCounts.M++; // Fallback to M
      }
    });

    return NextResponse.json({
      success: true,
      sizes: Object.entries(sizeCounts).map(([code, available]) => ({
        code,
        available,
      })),
      totalAvailable: boxes.length,
      boxes: boxes.slice(0, 10), // Return first 10 for preview
    });
  } catch (error) {
    console.error('Error fetching box availability:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch box availability',
        sizes: [
          { code: 'S', available: 0 },
          { code: 'M', available: 0 },
          { code: 'L', available: 0 },
          { code: 'XL', available: 0 },
        ],
        totalAvailable: 0,
      },
      { status: 500 }
    );
  }
}
