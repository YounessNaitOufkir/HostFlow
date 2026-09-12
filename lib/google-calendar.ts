import { google, calendar_v3 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/server';

export const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};

/**
 * The calendar event id for a task, derived rather than remembered.
 *
 * Google accepts a caller-supplied event id and enforces that it is unique on
 * the calendar, which is what makes syncing a task idempotent without a lock:
 * two runs racing each other produce the same id, one insert wins and the other
 * is told the event already exists.
 *
 * The id must be base32hex - the characters 0-9 and a-v, at least five long. A
 * UUID with its dashes removed is 32 hex characters, which is already inside
 * that alphabet, so it only needs a prefix to keep it clearly ours.
 */
export function googleEventIdFor(taskId: string): string {
  return `hf${taskId.replace(/-/g, "").toLowerCase()}`;
}

/**
 * What a sync actually did. It used to return nothing at all.
 *
 * Every failure was caught and turned into a console.error, so the route above
 * answered `{ success: true, synced: N }` whether or not a single event had been
 * written. A refresh token that Google had stopped accepting looked exactly like
 * a working one, for weeks.
 */
export type SyncOutcome =
  | { ok: true }
  | { ok: false; reason: "no-date" | "not-connected" }
  /** The stored grant is dead. The tokens have been cleared; the user must reconnect. */
  | { ok: false; reason: "reauth-required" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Whether Google is refusing the grant itself rather than having a bad moment.
 *
 * This is the one error worth acting on: invalid_grant means the refresh token
 * will never work again — revoked, expired, or issued by a different client — so
 * retrying is pointless and the stored copy is worse than useless, because
 * google_connected is `google_refresh_token is not null` and a dead token
 * therefore still reads as "Connected".
 *
 * Deliberately narrow. A timeout or a 5xx must NOT disconnect anybody.
 */
function isInvalidGrant(error: unknown): boolean {
  const e = error as { message?: string; response?: { data?: { error?: string } } };
  return (
    e?.response?.data?.error === "invalid_grant" ||
    (typeof e?.message === "string" && e.message.includes("invalid_grant"))
  );
}

/**
 * A calendar client authorized as `userId`, plus the plumbing every caller
 * needs: token refresh persisted back to the row it came from, and a
 * `clearGrant` to call when Google itself has rejected the refresh token.
 *
 * Pulled out of syncTaskToGoogleCalendar so deleteTaskFromGoogleCalendar and
 * disconnectGoogleCalendar don't each reimplement the same token dance.
 */
async function getAuthorizedCalendar(userId: string): Promise<
  | { ok: true; calendar: calendar_v3.Calendar; clearGrant: () => Promise<void> }
  | { ok: false; reason: "not-connected" }
> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!integration || !integration.google_refresh_token) {
    return { ok: false, reason: "not-connected" };
  }

  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: integration.google_access_token,
    refresh_token: integration.google_refresh_token,
  });

  // Automatically handle token refresh and update DB if refreshed
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      await supabase
        .from('user_integrations')
        .update({
          google_access_token: tokens.access_token || integration.google_access_token,
          google_refresh_token: tokens.refresh_token || integration.google_refresh_token,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    }
  });

  const clearGrant = async () => {
    // Say so in the only place the app can: the stored connection. Leaving a
    // dead token in place is what let the settings screen show "Connected to
    // Google Calendar" for weeks while nothing was written.
    console.error(
      `[Google Calendar] the grant for ${userId} is no longer valid; clearing it so the UI stops claiming a connection.`
    );
    await supabase
      .from('user_integrations')
      .update({
        google_access_token: null,
        google_refresh_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  };

  return { ok: true, calendar: google.calendar({ version: 'v3', auth: oauth2Client }), clearGrant };
}

/**
 * Marks every event this app writes, independent of which task it came from.
 *
 * hostflow_task_id alone lets a sync find ITS OWN event again, but disconnecting
 * has to find every event across every task without knowing their ids up front.
 * Google's privateExtendedProperty filter only matches an exact key=value pair,
 * not "key is present", so a second constant-valued property is what makes
 * "list everything HostFlow ever wrote for this user" possible.
 */
const HOSTFLOW_MARKER = 'hostflow_synced';

export async function syncTaskToGoogleCalendar(
  userId: string,
  task: { id: string, name: string, start?: string, end?: string, boardName?: string }
): Promise<SyncOutcome> {
  if (!task.start) return { ok: false, reason: "no-date" }; // Need at least a start date

  const auth = await getAuthorizedCalendar(userId);
  if (!auth.ok) return { ok: false, reason: auth.reason };
  const { calendar } = auth;

  // Event Details
  const event: calendar_v3.Schema$Event = {
    summary: `[HostFlow] ${task.name}`,
    description: `Task from board: ${task.boardName || 'Unknown'}\nView in HostFlow.`,
  };

  // If there's an end date, use it, otherwise assume 1-day all-day event
  if (task.start && task.end) {
    event.start = { date: task.start.split('T')[0] };
    const endDate = new Date(task.end);
    endDate.setDate(endDate.getDate() + 1); // Google Calendar exclusive end date for all-day events
    event.end = { date: endDate.toISOString().split('T')[0] };
  } else if (task.start) {
    event.start = { date: task.start.split('T')[0] };
    const endDate = new Date(task.start);
    endDate.setDate(endDate.getDate() + 1);
    event.end = { date: endDate.toISOString().split('T')[0] };
  }

  const body = {
    ...event,
    extendedProperties: {
      private: { hostflow_task_id: task.id, [HOSTFLOW_MARKER]: '1' }
    }
  };

  try {
    // An event this task created before ids were derived, if there is one.
    //
    // Those carry a Google-generated id, so they cannot be found by calculating
    // one. Updating whichever exists keeps its history rather than leaving it
    // behind as a duplicate of the event written below.
    const legacy = await calendar.events.list({
      calendarId: 'primary',
      privateExtendedProperty: [`hostflow_task_id=${task.id}`],
    });

    const wanted = googleEventIdFor(task.id);
    const previous = (legacy.data.items ?? []).find((e) => e.id && e.id !== wanted);

    if (previous) {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: previous.id!,
        requestBody: body,
      });
      return { ok: true };
    }

    // The id is derived from the task, so the insert is the lock.
    //
    // This used to list, find nothing, and insert - so two syncs running
    // together both found nothing and both inserted, and the task appeared
    // twice in the calendar. Google enforces id uniqueness, so now one insert
    // wins and the other comes back 409 and updates instead. No claim to take
    // and none to leave behind if the process dies mid-way.
    try {
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: { ...body, id: wanted },
      });
    } catch (insertError: any) {
      const status = insertError?.code ?? insertError?.response?.status;
      if (status !== 409) throw insertError;

      // Already there - either this task synced before, or another run beat us
      // to it by milliseconds. Same outcome either way.
      await calendar.events.update({
        calendarId: 'primary',
        eventId: wanted,
        requestBody: body,
      });
    }

    return { ok: true };
  } catch (error) {
    if (isInvalidGrant(error)) {
      await auth.clearGrant();
      return { ok: false, reason: "reauth-required" };
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Google Calendar Sync] Failed for user ${userId}:`, error);
    return { ok: false, reason: "failed", message };
  }
}

/**
 * Removes the calendar event for one task, if this app ever wrote one.
 *
 * Called when a task is deleted in HostFlow — otherwise the event just sits on
 * the user's calendar forever, since nothing else ever tells Google to remove
 * it. Looks up both the deterministic id and, same as the sync path, an older
 * event that predates deterministic ids.
 */
export async function deleteTaskFromGoogleCalendar(
  userId: string,
  taskId: string
): Promise<SyncOutcome> {
  const auth = await getAuthorizedCalendar(userId);
  if (!auth.ok) return { ok: false, reason: auth.reason };
  const { calendar } = auth;

  try {
    const wanted = googleEventIdFor(taskId);
    const matches = await calendar.events.list({
      calendarId: 'primary',
      privateExtendedProperty: [`hostflow_task_id=${taskId}`],
    });
    const ids = new Set([wanted, ...(matches.data.items ?? []).map((e) => e.id).filter((id): id is string => !!id)]);

    for (const eventId of ids) {
      try {
        await calendar.events.delete({ calendarId: 'primary', eventId });
      } catch (deleteError: any) {
        const status = deleteError?.code ?? deleteError?.response?.status;
        // 404/410/"Resource has been deleted" all mean the outcome we wanted
        // already holds - the event is gone. Only a real failure propagates.
        if (status !== 404 && status !== 410 && status !== 400) throw deleteError;
      }
    }

    return { ok: true };
  } catch (error) {
    if (isInvalidGrant(error)) {
      await auth.clearGrant();
      return { ok: false, reason: "reauth-required" };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Google Calendar Delete] Failed for user ${userId}, task ${taskId}:`, error);
    return { ok: false, reason: "failed", message };
  }
}

/**
 * Removes every event this app ever wrote for `userId`, then clears their
 * stored grant.
 *
 * Disconnecting used to only null the tokens, so the calendar kept every
 * event HostFlow had ever synced — "disconnected" looked nothing like it.
 * The delete pass runs BEFORE the tokens are cleared, since it needs a live
 * grant to call Google at all; a grant that is already dead just means there
 * is nothing to clean up, not a reason to fail the disconnect.
 */
export async function disconnectGoogleCalendar(
  userId: string
): Promise<{ ok: true; deleted: number } | { ok: false; reason: string }> {
  const supabase = createAdminClient();
  const auth = await getAuthorizedCalendar(userId);

  let deleted = 0;
  if (auth.ok) {
    try {
      let pageToken: string | undefined;
      const eventIds: string[] = [];
      do {
        const page = await auth.calendar.events.list({
          calendarId: 'primary',
          privateExtendedProperty: [`${HOSTFLOW_MARKER}=1`],
          pageToken,
        });
        for (const e of page.data.items ?? []) if (e.id) eventIds.push(e.id);
        pageToken = page.data.nextPageToken ?? undefined;
      } while (pageToken);

      const results = await Promise.allSettled(
        eventIds.map((eventId) =>
          auth.calendar.events.delete({ calendarId: 'primary', eventId }).catch((err: any) => {
            const status = err?.code ?? err?.response?.status;
            if (status === 404 || status === 410 || status === 400) return; // already gone
            throw err;
          })
        )
      );
      deleted = results.filter((r) => r.status === 'fulfilled').length;
    } catch (error) {
      // A listing failure (expired access token that failed to refresh, a
      // transient 5xx) must not block disconnecting - the user asked this app
      // to let go of their calendar, and it can still do that below even if
      // it could not clean up every event first.
      console.error(`[Google Calendar Disconnect] Cleanup failed for user ${userId}:`, error);
    }
  }

  await supabase
    .from('user_integrations')
    .update({ google_access_token: null, google_refresh_token: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { ok: true, deleted };
}
