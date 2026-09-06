import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { createClient } from '@/lib/supabase/server';

/**
 * The cookie carrying the one-time OAuth state.
 *
 * Exported so the callback checks the same name, and prefixed `__Host-` so the
 * browser refuses it unless it is Secure, path=/ and has no Domain - which stops
 * a sibling subdomain from writing a state the callback would then trust. The
 * prefix is dropped in development, where there is no HTTPS to satisfy it.
 */
export const OAUTH_STATE_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-google_oauth_state' : 'google_oauth_state';

/** Long enough to finish a consent screen, short enough not to linger. */
const STATE_TTL_SECONDS = 10 * 60;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oauth2Client = getGoogleOAuthClient();

    // calendar.events alone, deliberately.
    //
    // calendar.readonly used to sit alongside it and granted nothing this app
    // uses: calendar.events already covers reading and writing events, which is
    // all the sync does — it lists events carrying our own private extended
    // property, then inserts or updates one. readonly additionally exposed every
    // calendar the person can see, including ones HostFlow has no business
    // reading, and it is a sensitive scope that has to be justified to Google
    // like any other. Asking for less is both easier to consent to and easier
    // to defend.
    const scopes = ['https://www.googleapis.com/auth/calendar.events'];

    // A random, single-use state held in an HttpOnly cookie.
    //
    // It used to be the user's own id, which is not a secret: every people cell
    // on a shared board carries one. Anyone holding a colleague's id could run
    // the consent screen against their OWN Google account, hand back that id as
    // the state, and have the callback bind their calendar to the colleague's
    // HostFlow account. The state now proves only that this browser started the
    // flow; the callback takes the identity from the session, never from here.
    const state = randomBytes(32).toString('base64url');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to always get refresh token
      state,
    });

    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // must survive the redirect back from Google
      path: '/',
      maxAge: STATE_TTL_SECONDS,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[Google OAuth] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
