import { NextResponse } from 'next/server';
import { syncDisputesFromPayPal } from '@/server/sync/disputes';

export async function POST(req: Request) {
  try {
    const result = await syncDisputesFromPayPal();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('API /disputes/sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync disputes',
      },
      { status: 500 }
    );
  }
}
