"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { validateNewPassword } from "@/lib/passwordSecurity";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, ArrowLeft, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useT } from "@/components/LanguageProvider";

/**
 * Shared field styling.
 *
 * Dark: the border (was #2a3140) measured at 1.27:1 against the field's own
 * fill, and the placeholder (was slate-600) at 2.19:1 — before typing, the
 * form read as a scatter of faint grey rectangles rather than four
 * clearly-bounded fields. Lightened just enough to be visible.
 *
 * Light: a flat white fill on this app's #F4F6F8 page is only a 1.08:1
 * luminance difference — barely better than the dark-mode bug above — so
 * `border-gray-300` alone (1.47:1) isn't enough either. The shadow is doing
 * the real work of separating the field from the page, the same premium-shadow
 * approach already used throughout globals.css; it's dropped in dark mode
 * since a shadow is invisible against near-black anyway.
 *
 * The focus ring is the brand's #F5A623 (the brand-amber theme key added for
 * the landing page) rather than Tailwind's amber-400, which nothing else on
 * this page — the button, the logo two inches away — was actually using.
 */
const INPUT_CLASS =
  "w-full px-4 py-3 bg-white dark:bg-[#1a1e2b] border border-gray-300 dark:border-[#3d4a63] rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.045)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber transition-all text-sm";

/**
 * The "back to sign in" button on both success screens (reset-pending,
 * verification-pending). Was dark-only (bg-white/5, border-white/10, which
 * relies entirely on sitting against near-black); light mode needs actual
 * grey fills instead of a translucent white that would vanish on #F4F6F8.
 */
const BACK_BUTTON_CLASS =
  "flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-900 dark:text-white rounded-xl transition-all duration-300 text-sm font-medium border border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20";

export default function LoginPage() {
  const t = useT();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isPasswordResetPending, setIsPasswordResetPending] = useState(false);
  const [isInvited, setIsInvited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { theme, setTheme } = useTheme();

  // next-themes can't know the resolved theme on the server — the class it
  // reads lives in localStorage, which doesn't exist there. Rendering the
  // icon before mount would flash the wrong one; this waits one tick.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Anyone who reaches this page already signed in belongs in the app, not in
  // front of a login form. Mostly this catches a stale second tab; the OAuth
  // handshake itself is settled server-side in app/auth/callback/route.ts.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  // Surface a failed sign-in that the callback route redirected back here. The
  // query string is read from window rather than useSearchParams, which would
  // require wrapping this page in a Suspense boundary; that also means the value
  // cannot be seeded during render, since the server has no URL to read.
  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(oauthError);
      // Clear it so a refresh doesn't resurrect a message about a past attempt.
      // This goes through the router rather than window.history.replaceState,
      // which gets reverted when the router reconciles after hydration.
      router.replace("/login");
    }
  }, [router]);

  // The invite link itself carries no auth — redemption happens server-side,
  // matched by email, the moment redeem_pending_invitations() sees a profile
  // row created with that address (see the pending_invitations migration).
  // This only has to get the right person to the signup form.
  //
  // "Get started" on the public landing page (components/landing/LandingPage)
  // links here with ?signup=1 for the same reason: it has no email to match,
  // just a reader who has not decided between the two forms yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsInvited(true);
      setIsSignUp(true);
    } else if (params.get("signup")) {
      setIsSignUp(true);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
        setIsPasswordResetPending(true);
      } else if (isSignUp) {
        // Reject known-breached passwords. Supabase offers this natively only on
        // paid plans, so we check against Have I Been Pwned ourselves; the
        // password never leaves the browser (see lib/passwordSecurity.ts).
        const problem = await validateNewPassword(password);
        if (problem?.blocking) {
          setError(problem.message);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`.trim(),
            },
            emailRedirectTo: `${window.location.origin}/`,
          }
        });
        if (error) throw error;

        // The profile row, the user's private personal workspace, and the
        // notification to admins are all created by the handle_new_user trigger.
        // Doing any of it here would require the client to write other users'
        // rows, and would race with the trigger.

        setIsVerificationPending(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.refresh();
        router.push("/");
      }
    } catch (err: any) {
      let errorMsg = err.message || t("auth.authFailed");
      if (errorMsg === "{}" || errorMsg === "[object Object]") {
        errorMsg = t("auth.rateLimited");
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // No ?next= here on purpose: the callback defaults to "/" already, and a
          // bare path is matched against Supabase's redirect allow-list without
          // depending on how it treats query strings.
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || t("auth.googleError"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F4F6F8] dark:bg-[#111318] font-sans overflow-hidden">

      {/* ===== LEFT SIDE =====
          Brand navy in light mode; back to the original near-black in dark
          mode — dark mode wants its own depth here, not the same navy as the
          light-mode panel. The mark's own colours (white/amber/blue) were
          authored against #0c1226 and are untouched either way. */}
      <div className="hidden lg:flex w-[48%] h-screen sticky top-0 relative flex-col justify-start overflow-hidden bg-[#1A2C5B] dark:bg-[#0c1226]">

        {/* The mark unfolds, on the flow.
            
            Row centres sit at 113 / 161 / 209 / 257 / 305 on a 48px pitch, all
            of it above y=320 so the headline at the foot of the panel keeps a
            clear field. The three coloured bars are the logo's own three: they
            are drawn at their schedule positions and transformed back into the
            mark, so the two readings are the same objects rather than a
            cross-fade. Animation lives in app/globals.css under "Sign-in
            panel"; the transforms there are derived from these coordinates and
            have to be recomputed if any bar moves. */}
        <svg
          className="absolute inset-0 w-full h-full z-0"
          viewBox="0 0 658 613"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Ghost lanes: what holds the composition together for anyone
              who has asked their system to stop animations. */}
          <g stroke="#8fa0c4" strokeOpacity=".12" strokeWidth="1.5" fill="none">
            <path d="M-40 200 C 10 200, 40 282, 70 282 L 570 282 C 640 282, 660 240, 760 240" />
            <path d="M-40 240 C 10 240, 40 330, 70 330 L 570 330 C 640 330, 660 286, 760 286" />
            <path d="M-40 452 C 10 452, 40 378, 70 378 L 570 378 C 640 378, 660 344, 760 344" />
            <path d="M-40 352 C 10 352, 40 426, 70 426 L 570 426 C 640 426, 660 478, 760 478" />
            <path d="M-40 540 C 10 540, 40 474, 70 474 L 570 474 C 640 474, 660 520, 760 520" />
          </g>

          {/* Five durations with negative delays, so the streams are already
              mid-flow on load and never fall into step with one another. Two
              of the five carry no bar: the plan is three rows, the flow is wider
              than the plan. */}
          <g>
            <path
              className="hf-stream"
              stroke="#f5a623"
              strokeOpacity=".5"
              style={{ animationDuration: "12s" }}
              d="M-40 200 C 10 200, 40 282, 70 282 L 570 282 C 640 282, 660 240, 760 240"
            />
            <path
              className="hf-stream"
              stroke="#5b7fd4"
              strokeOpacity=".46"
              style={{ animationDuration: "15s", animationDelay: "-4s" }}
              d="M-40 240 C 10 240, 40 330, 70 330 L 570 330 C 640 330, 660 286, 760 286"
            />
            <path
              className="hf-stream"
              stroke="#f5a623"
              strokeOpacity=".42"
              style={{ animationDuration: "17s", animationDelay: "-9s" }}
              d="M-40 452 C 10 452, 40 378, 70 378 L 570 378 C 640 378, 660 344, 760 344"
            />
            <path
              className="hf-stream"
              stroke="#5b7fd4"
              strokeOpacity=".44"
              style={{ animationDuration: "13s", animationDelay: "-2s" }}
              d="M-40 352 C 10 352, 40 426, 70 426 L 570 426 C 640 426, 660 478, 760 478"
            />
            <path
              className="hf-stream"
              stroke="#f5a623"
              strokeOpacity=".34"
              style={{ animationDuration: "19s", animationDelay: "-6s" }}
              d="M-40 540 C 10 540, 40 474, 70 474 L 570 474 C 640 474, 660 520, 760 520"
            />
          </g>

          {/* The mark's own three bars, authored at their schedule positions.
              White, amber, white — the logo's own colours. The third was blue
              while the headline sat behind it; moving the headline above the
              plan let it go back to white. */}
          <rect className="hf-bar1" x="90" y="317" width="110" height="26" rx="13" fill="#ffffff" fillOpacity=".93" style={{ transformOrigin: "90px 330px" }} />
          <rect className="hf-bar2" x="216" y="365" width="150" height="26" rx="13" fill="#f5a623" style={{ transformOrigin: "216px 378px" }} />
          <rect className="hf-bar3" x="382" y="413" width="120" height="26" rx="13" fill="#ffffff" fillOpacity=".93" style={{ transformOrigin: "382px 426px" }} />

          {/* The chain, across the mark's own bars and only those. Each link is
              the same shape: out 8 from the predecessor's right edge, down exactly
              one row, in 8 onto the successor's left edge. */}
          <g className="hf-ctx">
            <path className="hf-link" d="M200 330 H208 V378 H210" />
            <path className="hf-link" d="M366 378 H374 V426 H376" />
            <polygon className="hf-head" points="216,378 207,373.5 207,382.5" />
            <polygon className="hf-head" points="382,426 373,421.5 373,430.5" />
          </g>
        </svg>


        {/* Top: HostFlow app brand. No accessible name on the mark — the
            wordmark beside it already names the product. */}
        <div className="relative z-10 px-10 pt-10 flex items-center gap-3">
          <Logo variant="bare" tone="navy" size={36} />
          <span className="text-xl font-bold text-white tracking-tight">HostFlow</span>
        </div>

        {/* The claim, then the plan demonstrating it underneath. Reading down,
            the panel gives the promise and then the proof — which is also what
            keeps the corner mark and the unfolding mark from sitting six bars
            deep on top of each other. */}
        <div className="relative z-10 px-10 mt-10">
          <h1 className="text-5xl xl:text-[3.5rem] font-extrabold text-white leading-[1.13] tracking-tight text-balance">
            {t("auth.tagline")}
          </h1>
        </div>
      </div>

      {/* ===== RIGHT SIDE – Form ===== */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen py-12 px-8 sm:px-12 relative bg-[#F4F6F8] dark:bg-[#111318]">

        {/* Corner, not in flow: a single icon button, small enough that even
            at the shortest viewport in the L2 fix above it has no heading to
            collide with. Rendered only once mounted so the icon it shows
            always matches the theme actually applied, never a server guess. */}
        {mounted && (
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? t("landing.switchToLight") : t("landing.switchToDark")}
            className="focus-ring-premium absolute top-6 right-6 sm:top-8 sm:right-8 inline-flex items-center justify-center w-9 h-9 rounded-[10px] border border-gray-300 dark:border-white/10 bg-white/80 dark:bg-white/5 text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-400 dark:hover:border-white/20 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}

        {/* Mobile Header. In normal flow, not pinned to a corner: an absolute
            position ignored the height of whatever sat below it, so on a short
            viewport (a landscape phone, or a keyboard eating vertical space)
            it landed on top of the heading — worse on the sign-up form, which
            is taller. In flow, it can only ever stack above the card. */}
        <div className="lg:hidden flex items-center gap-3 mb-12">
          <Logo variant="bare" tone="navy" size={32} />
          <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">HostFlow</span>
        </div>

        <div className="w-full max-w-[420px] animate-fade-up">

          {isPasswordResetPending ? (
            // Its own entrance, not inherited from the wrapper above: that div
            // mounted once, on first paint, and never remounts when this branch
            // switches in — so without this the card used to just pop into place.
            <div className="flex flex-col items-center text-center p-8 rounded-3xl bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-2xl animate-fade-up">
              <div className="w-24 h-24 bg-amber-100 dark:bg-amber-500/10 rounded-full flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-full bg-amber-300/40 dark:bg-amber-400/20 animate-ping duration-1000" />
                <MailCheck className="w-12 h-12 text-amber-600 dark:text-amber-400 relative z-10" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{t("auth.checkInbox")}</h2>
              <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed mb-8 px-4">
                {t("auth.resetLinkSent")} <br />
                <span className="font-semibold text-gray-900 dark:text-white text-base mt-1 inline-block">{email}</span><br /><br />
                {t("auth.resetLinkHint")}
              </p>
              <button
                onClick={() => {
                  setIsPasswordResetPending(false);
                  setIsForgotPassword(false);
                  setEmail("");
                }}
                className={BACK_BUTTON_CLASS}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("auth.backToSignIn")}
              </button>
            </div>
          ) : isVerificationPending ? (
            <div className="flex flex-col items-center text-center p-8 rounded-3xl bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-2xl animate-fade-up">
              <div className="w-24 h-24 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-full bg-blue-300/40 dark:bg-blue-400/20 animate-ping duration-1000" />
                <MailCheck className="w-12 h-12 text-blue-600 dark:text-blue-400 relative z-10" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{t("auth.checkInbox")}</h2>
              <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed mb-8 px-4">
                {t("auth.verificationSent")} <br />
                <span className="font-semibold text-gray-900 dark:text-white text-base mt-1 inline-block">{email}</span><br /><br />
                {t("auth.verificationHint")}
              </p>
              <button
                onClick={() => {
                  setIsVerificationPending(false);
                  setIsSignUp(false);
                  setEmail("");
                  setPassword("");
                }}
                className={BACK_BUTTON_CLASS}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("auth.backToSignIn")}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {isForgotPassword
                    ? t("auth.resetPassword")
                    : isSignUp
                      ? t("auth.createAnAccount")
                      : t("auth.welcomeBack")}
                </h2>
                {!isSignUp && !isForgotPassword && (
                  <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed">
                    {t("auth.credentialsPrompt")}
                  </p>
                )}
                {isForgotPassword && (
                  <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed">
                    {t("auth.resetPrompt")}
                  </p>
                )}
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {isInvited && !error && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl text-blue-700 dark:text-blue-300 text-sm animate-fade-up flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                    {t("auth.invited")}
                  </div>
                )}
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm animate-fade-up flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    {error}
                  </div>
                )}

                {!isForgotPassword && isSignUp && (
                  <div className="flex gap-3 animate-fade-up">
                    <div className="flex-1 space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="firstName">{t("auth.firstName")}</label>
                      <input
                        id="firstName"
                        type="text"
                        required={isSignUp}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder={t("auth.firstNamePlaceholder")}
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="lastName">{t("auth.lastName")}</label>
                      <input
                        id="lastName"
                        type="text"
                        required={isSignUp}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder={t("auth.lastNamePlaceholder")}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="email">{t("auth.emailAddress")}</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder={t("auth.emailPlaceholder")}
                  />
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="password">{t("auth.password")}</label>
                      {!isSignUp && (
                        <button
                          type="button"
                          onClick={() => { setIsForgotPassword(true); setError(null); }}
                          className="text-xs text-amber-700 dark:text-brand-amber hover:text-amber-800 dark:hover:text-brand-amber-hover transition-colors"
                        >
                          {t("auth.forgotPassword")}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${INPUT_CLASS} pr-11`}
                        placeholder="••••••••"
                      />
                      {/* Client-side only: flips what the input masks, nothing
                          about the auth flow. There was no way to check what
                          you'd typed before submitting. */}
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-brand-amber hover:bg-brand-amber-hover text-gray-900 font-bold rounded-xl shadow-[0_0_24px_rgba(245,166,35,0.25)] hover:shadow-[0_0_32px_rgba(245,166,35,0.40)] transition-all duration-300 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2 transform active:scale-[0.98] text-sm"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-900" />
                  ) : (
                    isForgotPassword
                      ? t("auth.sendResetLink")
                      : isSignUp
                        ? t("auth.createAccountAction")
                        : t("auth.signIn")
                  )}
                </button>
              </form>

              {!isForgotPassword && (
                <>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                    <span className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider">{t("auth.orContinueWith")}</span>
                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={loading}
                    className="mt-6 w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98] text-sm border border-slate-200"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                  </button>

                  <div className="mt-7 text-center text-sm text-gray-500 dark:text-slate-400">
                    {isSignUp ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                      className="text-gray-900 dark:text-white hover:text-amber-700 dark:hover:text-brand-amber font-semibold transition-colors ml-1"
                    >
                      {isSignUp ? t("auth.logInInstead") : t("auth.createOneNow")}
                    </button>
                  </div>
                </>
              )}

              {isForgotPassword && (
                <div className="mt-7 text-center text-sm text-gray-500 dark:text-slate-400">
                  {t("auth.rememberPassword")}{" "}
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(null); }}
                    className="text-gray-900 dark:text-white hover:text-amber-700 dark:hover:text-brand-amber font-semibold transition-colors ml-1"
                  >
                    {t("auth.backToSignInLink")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
