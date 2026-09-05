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

export async function syncTaskToGoogleCalendar(userId: string, task: { id: string, name: string, start?: string, end?: string, boardName?: string }) {
  if (!task.start) return; // Need at least a start date

  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!integration || !integration.google_refresh_token) {
    return; // User has not connected Google Calendar
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

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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
      private: { hostflow_task_id: task.id }
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
      return;
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
  } catch (error) {
    console.error(`[Google Calendar Sync] Failed for user ${userId}:`, error);
  }
}
