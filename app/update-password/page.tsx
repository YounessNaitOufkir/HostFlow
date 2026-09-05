"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { validateNewPassword } from "@/lib/passwordSecurity";
import { Loader2 } from "lucide-react";

const memes = [
  { emoji: "🧠", text: "Try your cat's name + 123. Nobody will ever guess." },
  { emoji: "📝", text: "Pro tip: writing it on a sticky note on your monitor is perfectly fine." },
  { emoji: "🔑", text: "\"password123\" is now password1234. Uncrackable." },
  { emoji: "🤦", text: "If you forget this one too... we can't be friends." },
  { emoji: "🫡", text: "Make it strong. Your future self will thank you. Or curse you. 50/50." },
  { emoji: "💀", text: "It's giving 'I'll definitely remember this one this time' energy." },
];

const randomMeme = memes[Math.floor(Math.random() * memes.length)];

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

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
    <div className="min-h-screen bg-[#0f111a] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">

        {/* Fun header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-white mb-1">New password, who dis?</h1>
          <p className="text-slate-500 text-sm">For your HostFlow account</p>
        </div>

        {/* Meme card */}
        <div className="bg-[#1a1d2e] border border-white/5 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl mt-0.5 shrink-0">{randomMeme.emoji}</span>
          <p className="text-slate-400 text-sm leading-relaxed italic">
            {randomMeme.text}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-teal-400 text-sm font-medium">Password updated! Redirecting...</p>
            </div>
          )}

          {!success && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Your unforgettable new password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  placeholder="Not 'password123' please 🙏"
                  className="w-full bg-[#1a1d2e] border border-white/5 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
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
