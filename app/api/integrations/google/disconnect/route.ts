import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { disconnectGoogleCalendar } from '@/lib/google-calendar';

/**
 * Disconnects the CALLER's own Google Calendar - never takes a userId from
 * the body, so there is nothing here for one signed-in user to point at
 * another's integration.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await disconnectGoogleCalendar(user.id);
  return NextResponse.json(result);
}
