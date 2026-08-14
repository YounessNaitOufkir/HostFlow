import { NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const userId = url.searchParams.get('state');

  if (!code || !userId) {
    return NextResponse.redirect(`${url.origin}/?error=invalid_request`);
  }

  try {
    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.access_token && tokens.refresh_token) {
      const supabase = createAdminClient();

      const { error } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: userId,
          google_access_token: tokens.access_token,
          google_refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Google Callback] Supabase Error:', error);
        return NextResponse.redirect(`${url.origin}/?error=db_error`);
      }
    }

    return NextResponse.redirect(`${url.origin}/?success=google_connected`);
  } catch (error) {
    console.error('[Google Callback] Error:', error);
    return NextResponse.redirect(`${url.origin}/?error=oauth_error`);
  }
}
