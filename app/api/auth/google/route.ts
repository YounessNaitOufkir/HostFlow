import { NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oauth2Client = getGoogleOAuthClient();

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to always get refresh token
      state: user.id, // Pass the user ID in the state to map it on callback
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[Google OAuth] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
