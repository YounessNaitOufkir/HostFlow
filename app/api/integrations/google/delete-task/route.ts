import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteTaskFromGoogleCalendar } from '@/lib/google-calendar';

/**
 * Removes the calendar event(s) for a task, called right before the task
 * itself is soft-deleted in HostFlow.
 *
 * Mirrors the auth shape of /api/integrations/google/sync: the caller must be
 * signed in, and the task is re-read through their own RLS-scoped client so a
 * task they cannot see does not exist as far as this route is concerned. This
 * has to run BEFORE the item's own deleted_at is set - it needs the item's
 * still-live column_values to know who to clean up for.
 */
export async function POST(request: Request) {
  try {
    const { taskId } = await request.json();

    if (typeof taskId !== 'string' || !taskId) {
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
      .eq('id', taskId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Task not found' }, { status: 403 });
    }

    // Everyone possibly named on the task - same broad scan as the sync
    // route, since a person id can only ever come from a people column.
    const assigned = new Set<string>();
    for (const value of Object.values(item.column_values ?? {})) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') assigned.add(entry);
        }
      }
    }

    if (assigned.size === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const results = await Promise.allSettled(
      Array.from(assigned).map((userId) => deleteTaskFromGoogleCalendar(userId, taskId))
    );

    const deleted = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('[Google Delete Task API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
