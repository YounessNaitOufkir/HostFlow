import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { OAUTH_STATE_COOKIE } from '../route';

/** Constant-time compare that tolerates differing lengths. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(`${url.origin}/?error=invalid_request`);
  }

  try {
    // Identity comes from the session, never from the callback URL.
    //
    // This used to read the user id straight out of `state` and upsert with the
    // service role, so anyone who knew a colleague's id - every people cell on a
    // shared board carries one - could run the consent screen against their own
    // Google account and have the victim's tasks sync into the attacker's
    // calendar. Two things stop that now: the session decides whose row is
    // written, and the state proves the flow began in this browser.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${url.origin}/?error=not_signed_in`);
    }

    const jar = await cookies();
    const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
    // Single use, whatever the outcome.
    jar.delete(OAUTH_STATE_COOKIE);

    if (!expected || !sameState(expected, state)) {
      return NextResponse.redirect(`${url.origin}/?error=invalid_state`);
    }

    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.access_token && tokens.refresh_token) {
      // Service role because user_integrations no longer grants the client any
      // access to the token columns; the row belongs to the session's user.
      const admin = createAdminClient();

      const { error } = await admin
        .from('user_integrations')
        .upsert({
          user_id: user.id,
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
