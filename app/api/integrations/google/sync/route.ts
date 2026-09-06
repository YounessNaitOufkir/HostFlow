import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncTaskToGoogleCalendar } from '@/lib/google-calendar';

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

    // RLS decides this: no row means the caller cannot reach the task.
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, column_values')
      .eq('id', task.id)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Task not found' }, { status: 403 });
    }

    // Everyone actually named on the task, from the stored row rather than the body.
    const assigned = new Set<string>();
    for (const value of Object.values(item.column_values ?? {})) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') assigned.add(entry);
        }
      }
    }

    const targets = userIds.filter(
      (id: unknown): id is string => typeof id === 'string' && assigned.has(id)
    );

    if (targets.length === 0) {
      return NextResponse.json({ success: true, synced: 0 });
    }

    const results = await Promise.allSettled(
      targets.map((userId: string) => syncTaskToGoogleCalendar(userId, task))
    );

    // Report what happened rather than the number of people asked.
    //
    // This returned `synced: targets.length` unconditionally, because the sync
    // swallowed its own errors and returned nothing. A calendar that had not
    // accepted a single event for weeks reported a clean success on every edit.
    let synced = 0;
    let failed = 0;
    let reauthRequired = 0;
    for (const result of results) {
      if (result.status !== "fulfilled") { failed++; continue; }
      if (result.value.ok) { synced++; continue; }
      if (result.value.reason === "reauth-required") reauthRequired++;
      else failed++;
    }

    return NextResponse.json({
      success: failed === 0 && reauthRequired === 0,
      synced,
      failed,
      // The client can tell the reader their calendar needs reconnecting, which
      // is the one failure they can actually do something about.
      reauthRequired,
    });
  } catch (error) {
    console.error('[Google Sync API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
