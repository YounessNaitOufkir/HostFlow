import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncAssigneeCalendars } from '@/lib/calendarSync';

/**
 * Writes a task into the Google Calendar of the people assigned to it.
 *
 * Both the caller and the target list have to be checked. The route used to take
 * `userIds` straight from the body with no session at all, which let anyone write
 * events into anyone's calendar. Now:
 *
 *   1. the caller must be signed in,
 *   2. the task is re-read through their own RLS-scoped client, so a task they
 *      cannot see does not exist as far as this route is concerned,
 *   3. only ids actually assigned on that task are synced — the body cannot widen
 *      the audience.
 *
 * Steps 2 and 3 live in lib/calendarSync, shared with the Claude connector.
 */
export async function POST(request: Request) {
  try {
    const { userIds, task } = await request.json();

    if (!Array.isArray(userIds) || !task || !task.id) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncAssigneeCalendars(supabase, userIds, task);
    if (result.notFound) {
      return NextResponse.json({ error: 'Task not found' }, { status: 403 });
    }

    // A person with no calendar connected has always counted as a failure here.
    const failed = result.failed + result.skipped;
    return NextResponse.json({
      success: failed === 0 && result.reauthRequired === 0,
      synced: result.synced,
      failed,
      reauthRequired: result.reauthRequired,
    });
  } catch (error) {
    console.error('[Google Sync API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
