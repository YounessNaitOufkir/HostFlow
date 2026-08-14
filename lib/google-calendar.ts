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

  try {
    // Try to find if this task already has an event in GCal
    // We can store the google_event_id in a new column on the item or just search by extended properties
    const res = await calendar.events.list({
      calendarId: 'primary',
      privateExtendedProperty: [`hostflow_task_id=${task.id}`],
    });

    const existingEvents = res.data.items;

    if (existingEvents && existingEvents.length > 0) {
      // Update existing
      const eventId = existingEvents[0].id!;
      await calendar.events.update({
        calendarId: 'primary',
        eventId,
        requestBody: {
          ...event,
          extendedProperties: {
            private: { hostflow_task_id: task.id }
          }
        }
      });
    } else {
      // Create new
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          ...event,
          extendedProperties: {
            private: { hostflow_task_id: task.id }
          }
        }
      });
    }
  } catch (error) {
    console.error(`[Google Calendar Sync] Failed for user ${userId}:`, error);
  }
}
