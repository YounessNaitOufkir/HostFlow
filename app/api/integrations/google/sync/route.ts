import { NextResponse } from 'next/server';
import { syncTaskToGoogleCalendar } from '@/lib/google-calendar';

export async function POST(request: Request) {
  try {
    const { userIds, task } = await request.json();

    if (!userIds || !task || !task.id) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Sync for all provided users concurrently
    await Promise.allSettled(
      userIds.map((userId: string) => syncTaskToGoogleCalendar(userId, task))
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Google Sync API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
