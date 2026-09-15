"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import { validateNewPassword } from "@/lib/passwordSecurity";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const memes = [
  { emoji: "🧠", text: "Try your cat's name + 123. Nobody will ever guess." },
  { emoji: "📝", text: "Pro tip: writing it on a sticky note on your monitor is perfectly fine." },
  { emoji: "🔑", text: "\"password123\" is now password1234. Uncrackable." },
  { emoji: "🤦", text: "If you forget this one too... we can't be friends." },
  { emoji: "🫡", text: "Make it strong. Your future self will thank you. Or curse you. 50/50." },
  { emoji: "💀", text: "It's giving 'I'll definitely remember this one this time' energy." },
];

/**
 * NOT the random pick itself — that lives in state below. This module runs
 * once per environment: once during the server render of this "use client"
 * page's initial HTML, and again in the browser during hydration. Picking
 * randomly here gave the two environments different memes, which React
 * flags as a hydration mismatch and repairs by discarding and re-rendering
 * the whole tree — the meme visibly flashed and changed on every load.
 */

/**
 * Shared field styling — same border/shadow/placeholder values as
 * app/login/page.tsx's INPUT_CLASS, so the two auth screens agree. See that
 * file's comment for the contrast numbers behind the light-mode shadow and
 * the dark-mode border/placeholder lightening.
 */
const INPUT_CLASS =
  "w-full bg-white dark:bg-[#1a1d2e] border border-gray-300 dark:border-[#3d4a63] rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.045)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber transition-all text-sm";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { theme } = useTheme();

  // Same reasoning as the login page: the resolved theme doesn't exist on
  // the server, so this waits one tick before trusting it — otherwise the
  // logo tone below could render the wrong bars for one frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // The random meme: stable at memes[0] for the server render and the first
  // client render (so the two agree and hydration doesn't discard the tree),
  // then swapped for a real random pick client-side, after mount.
  const [meme, setMeme] = useState(memes[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeme(memes[Math.floor(Math.random() * memes.length)]);
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Same breach check as signup — a reset must not be a way to set a
      // password that would be rejected at registration.
      const problem = await validateNewPassword(password);
      if (problem?.blocking) {
        setError(problem.message);
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push("/"), 2500);
    } catch (err: any) {
      setError(err.message || "Failed to update password");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#111318] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">

        {/* Brand lockup — every other screen in this flow (login, both
            emails) opens with the mark; this was the one place a visitor
            could land with nothing confirming it's HostFlow. */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Logo variant="bare" tone={mounted && theme === "dark" ? "navy" : "light"} size={24} />
          <span className="text-[15px] font-extrabold text-gray-900 dark:text-white tracking-tight">HostFlow</span>
        </div>

        {/* Fun header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">New password, who dis?</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm">For your HostFlow account</p>
        </div>

        {/* Meme card */}
        <div className="bg-white dark:bg-[#1a1d2e] border border-gray-200 dark:border-white/5 rounded-2xl p-4 mb-6 flex items-start gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.045)] dark:shadow-none">
          <span className="text-2xl mt-0.5 shrink-0">{meme.emoji}</span>
          <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed italic">
            {meme.text}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {success && (
            /* Amber, not teal: this is the same reset flow as the login
               page's own "reset link sent" screen, one step later — teal was
               a colour used nowhere else in the app. */
            <div className="p-4 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 rounded-xl text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-amber-700 dark:text-brand-amber text-sm font-medium">Password updated! Redirecting...</p>
            </div>
          )}

          {!success && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Your unforgettable new password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    placeholder="Not 'password123' please 🙏"
                    className={`${INPUT_CLASS} pr-11`}
                  />
                  {/* Client-side only: flips what the input masks, nothing
                      about the update itself. Same gap the login page had. */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-brand-amber hover:bg-brand-amber-hover text-gray-900 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                ) : (
                  "Lock it in 🔒"
                )}
              </button>
            </>
          )}
        </form>

      </div>
    </div>
  );
}
