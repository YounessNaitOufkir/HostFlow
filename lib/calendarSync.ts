import type { SupabaseClient } from "@supabase/supabase-js";
import { syncTaskToGoogleCalendar } from "@/lib/google-calendar";

/**
 * Write a task into the Google Calendar of the people assigned to it.
 *
 * Shared by /api/integrations/google/sync (the app) and the Claude connector.
 * `supabase` must be the CALLER's client, never the service role:
 *
 *   1. the task is re-read through the caller's own row-level security, so a
 *      task they cannot see does not exist as far as this is concerned,
 *   2. only ids actually assigned on that task are synced - the caller cannot
 *      widen the audience.
 */
export interface CalendarSyncResult {
  synced: number;
  failed: number;
  reauthRequired: number;
  /** Assignees with no Google account connected, or a task with no date: nothing to write. */
  skipped: number;
  /** The caller cannot see the task. */
  notFound?: boolean;
}

export async function syncAssigneeCalendars(
  supabase: SupabaseClient,
  userIds: string[],
  task: { id: string; name: string; start?: string; end?: string; boardName?: string }
): Promise<CalendarSyncResult> {
  const { data: item, error } = await supabase
    .from("items")
    .select("id, column_values")
    .eq("id", task.id)
    .single();
  if (error || !item) return { synced: 0, failed: 0, reauthRequired: 0, skipped: 0, notFound: true };

  const assigned = new Set<string>();
  for (const value of Object.values((item.column_values ?? {}) as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") assigned.add(entry);
      }
    }
  }

  const targets = userIds.filter((id): id is string => typeof id === "string" && assigned.has(id));
  if (targets.length === 0) return { synced: 0, failed: 0, reauthRequired: 0, skipped: 0 };

  const results = await Promise.allSettled(targets.map((userId) => syncTaskToGoogleCalendar(userId, task)));

  let synced = 0;
  let failed = 0;
  let reauthRequired = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.status !== "fulfilled") { failed++; continue; }
    if (result.value.ok) { synced++; continue; }
    if (result.value.reason === "reauth-required") reauthRequired++;
    else if (result.value.reason === "no-date" || result.value.reason === "not-connected") skipped++;
    else failed++;
  }
  return { synced, failed, reauthRequired, skipped };
}
