"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { validateNewPassword } from "@/lib/passwordSecurity";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, ArrowLeft, Hexagon } from "lucide-react";
import DotField from './DotField';

export default function LoginPage() {
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
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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
      let errorMsg = err.message || "Authentication failed";
      if (errorMsg === "{}" || errorMsg === "[object Object]") {
        errorMsg = "Rate limit exceeded or invalid request. Please wait a moment and try again.";
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
      setError(err.message || "An error occurred with Google Auth");
      setLoading(false);
    }
  };

  /* Inline SVG for the H-in-hexagon logo */
  const HexLogo = ({ size = 130, opacity = 0.85 }: { size?: number; opacity?: number }) => (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <polygon
        points="30,2 55,16 55,44 30,58 5,44 5,16"
        stroke={`rgba(245,166,35,${opacity * 0.8})`}
        strokeWidth="2"
        fill={`rgba(245,166,35,${opacity * 0.08})`}
      />
      <rect x="18" y="18" width="5" height="24" rx="2" fill={`rgba(245,166,35,${opacity})`} />
      <rect x="18" y="27" width="24" height="5" rx="2" fill={`rgba(245,166,35,${opacity})`} />
      <rect x="37" y="18" width="5" height="24" rx="2" fill={`rgba(245,166,35,${opacity})`} />
    </svg>
  );

  /* 4-pointed sparkle star */
  const Sparkle = ({ className = "" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="32" height="32">
      <path
        d="M12 2L13.5 9.5L21 12L13.5 14.5L12 22L10.5 14.5L3 12L10.5 9.5L12 2Z"
        fill="currentColor"
      />
    </svg>
  );

  return (
    <div className="min-h-screen flex bg-[#111318] font-sans overflow-hidden">

      {/* ===== LEFT SIDE ===== */}
      <div className="hidden lg:flex w-[48%] h-screen sticky top-0 relative flex-col justify-between overflow-hidden bg-[#080c1a]">

        {/* Interactive DotField Background */}
        <div className="absolute inset-0 z-0">
          <DotField
            dotRadius={1.5}
            dotSpacing={14}
            bulgeStrength={67}
            glowRadius={160}
            sparkle={false}
            waveAmplitude={0}
            gradientFrom="#f98b16"
            glowColor="transparent"
          />
        </div>

        {/* === Large card (top-right, tilted clockwise) === */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            top: "5%",
            right: "5%",
            width: "260px",
            height: "260px",
            background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(245,166,35,0.03) 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "28px",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            transform: "rotate(16deg)",
            boxShadow: "0 8px 60px rgba(245,166,35,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* User's uploaded SVG H logo */}
          <img
            src="/left-bg.svg"
            alt="H Logo"
            className="w-4/4 h-4/4 object-contain opacity-60"
          />
        </div>

        {/* === Smaller card (bottom-left, tilted counter-clockwise) === */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            bottom: "5%",
            left: "50%",
            width: "220px",
            height: "220px",
            background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(245,166,35,0.04) 100%)",
            border: "1px solid rgba(245,166,35,0.15)",
            borderRadius: "24px",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            transform: "rotate(-12deg)",
            boxShadow: "0 8px 50px rgba(245,166,35,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* User's uploaded SVG H logo */}
          <img
            src="/left-bg.svg"
            alt="H Logo"
            className="w-4/4 h-4/4 object-contain opacity-60"
          />
        </div>

        {/* Top: HostFlow app brand */}
        <div className="relative z-10 px-10 pt-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Hexagon className="text-white w-5 h-5 fill-white/20" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">HostFlow</span>
        </div>

        {/* Center: Headline */}
        <div className="relative z-10 px-10">
          <h1 className="text-5xl xl:text-[3.5rem] font-extrabold text-white leading-[1.15] tracking-tight">
            Manage your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-blue-500">
              projects
            </span>
            <br />
            flawlessly.
          </h1>
        </div>

        {/* Bottom: Host'lik company logo */}
        <div className="relative z-10 px-10 pb-10">
          <img
            src="/1.webp"
            alt="Host'lik"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* ===== RIGHT SIDE – Form ===== */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen py-12 px-8 sm:px-12 relative bg-[#111318]">

        {/* Mobile Header */}
        <div className="lg:hidden flex items-center gap-3 mb-12 absolute top-8 left-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center">
            <Hexagon className="text-white w-5 h-5 fill-white/20" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">HostFlow</span>
        </div>

        {/* Sparkle decoration — bottom right */}
        <div className="absolute bottom-6 right-6 text-slate-500/40">
          <Sparkle />
        </div>

        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-700">

          {isPasswordResetPending ? (
            <div className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 shadow-2xl">
              <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping duration-1000" />
                <MailCheck className="w-12 h-12 text-amber-400 relative z-10" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Check your inbox</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 px-4">
                We&apos;ve sent a password reset link to <br />
                <span className="font-semibold text-white text-base mt-1 inline-block">{email}</span><br /><br />
                Click the link in the email to reset your password.
              </p>
              <button
                onClick={() => {
                  setIsPasswordResetPending(false);
                  setIsForgotPassword(false);
                  setEmail("");
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all duration-300 text-sm font-medium border border-white/10 hover:border-white/20"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </div>
          ) : isVerificationPending ? (
            <div className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 shadow-2xl">
              <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping duration-1000" />
                <MailCheck className="w-12 h-12 text-blue-400 relative z-10" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Check your inbox</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 px-4">
                We&apos;ve sent a verification link to <br />
                <span className="font-semibold text-white text-base mt-1 inline-block">{email}</span><br /><br />
                Click the link in the email to activate your HostFlow account.
              </p>
              <button
                onClick={() => {
                  setIsVerificationPending(false);
                  setIsSignUp(false);
                  setEmail("");
                  setPassword("");
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all duration-300 text-sm font-medium border border-white/10 hover:border-white/20"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {isForgotPassword ? "Reset password" : isSignUp ? "Create an account" : "Welcome back"}
                </h2>
                {!isSignUp && !isForgotPassword && (
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Enter your credentials to access your workspace.
                  </p>
                )}
                {isForgotPassword && (
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                )}
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    {error}
                  </div>
                )}

                {!isForgotPassword && isSignUp && (
                  <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex-1 space-y-1.5">
                      <label className="block text-sm font-medium text-slate-300" htmlFor="firstName">First Name</label>
                      <input
                        id="firstName"
                        type="text"
                        required={isSignUp}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#1a1e2b] border border-amber-400/30 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all text-sm"
                        placeholder="John"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="block text-sm font-medium text-slate-300" htmlFor="lastName">Last Name</label>
                      <input
                        id="lastName"
                        type="text"
                        required={isSignUp}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#1a1e2b] border border-amber-400/30 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all text-sm"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1a1e2b] border border-amber-400/30 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all text-sm"
                    placeholder="name@hostlik.com"
                  />
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300" htmlFor="password">Password</label>
                      {!isSignUp && (
                        <button 
                          type="button" 
                          onClick={() => { setIsForgotPassword(true); setError(null); }}
                          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[#1a1e2b] border border-amber-400/30 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl shadow-[0_0_24px_rgba(251,191,36,0.25)] hover:shadow-[0_0_32px_rgba(251,191,36,0.40)] transition-all duration-300 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2 transform active:scale-[0.98] text-sm"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-900" />
                  ) : (
                    isForgotPassword ? "Send Reset Link" : isSignUp ? "Create Account" : "Sign In"
                  )}
                </button>
              </form>

              {!isForgotPassword && (
                <>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="h-px bg-white/10 flex-1"></div>
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">or continue with</span>
                    <div className="h-px bg-white/10 flex-1"></div>
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

                  <div className="mt-7 text-center text-sm text-slate-500">
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                      className="text-white hover:text-amber-400 font-semibold transition-colors ml-1"
                    >
                      {isSignUp ? "Log in instead" : "Create one now"}
                    </button>
                  </div>
                </>
              )}

              {isForgotPassword && (
                <div className="mt-7 text-center text-sm text-slate-500">
                  Remember your password?{" "}
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(null); }}
                    className="text-white hover:text-amber-400 font-semibold transition-colors ml-1"
                  >
                    Back to sign in
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
