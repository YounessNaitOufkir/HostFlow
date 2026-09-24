import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Completes the Supabase OAuth (PKCE) handshake.
 *
 * The browser client uses the PKCE flow, so providers send the user back with a
 * `?code=` that still has to be traded for a session. That exchange has to happen
 * here, on the server, before anything renders: `proxy.ts` checks for a session on
 * every request, and if the code is still unspent at that point it sees a logged-out
 * visitor and bounces them to /login. The session would then be established
 * client-side a moment later, leaving the user sitting on the login page already
 * signed in — which is why signing in used to take two clicks.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  // The provider reports a refused consent screen this way, not by omitting `code`.
  // An expired/reused signup confirmation link reports itself the same way, with
  // error_code=otp_expired — flagged separately so /login can offer to resend it
  // instead of just showing an error.
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (oauthError) {
    const errorCode = url.searchParams.get('error_code');
    const expiredFlag = errorCode === 'otp_expired' ? '&expired=1' : '';
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(oauthError)}${expiredFlag}`);
  }

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent('No sign-in code was returned. Please try again.')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Supabase's message here is written for whoever wired up the app ("PKCE code
    // verifier not found in storage...") and would only alarm the person signing in.
    // Log the real thing and tell them the one useful part: start over in this browser.
    console.error('[Auth Callback] Code exchange failed:', error);
    const message = 'We could not complete that sign-in. Please try again in this browser.';
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(message)}`);
  }

  // `next` comes off the query string, so keep it to same-origin paths — an absolute
  // URL here would turn this route into an open redirect.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${url.origin}${destination}`);
}
