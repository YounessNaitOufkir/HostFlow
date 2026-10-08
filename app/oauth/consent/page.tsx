"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/ui/Logo";
import { useT } from "@/components/LanguageProvider";

/**
 * The Claude connector's consent screen.
 *
 * Supabase's OAuth server sends the person here with an authorization_id when
 * an assistant (Claude) asks to act as them. proxy.ts has already made sure
 * they are signed in, coming back here afterwards via ?next=.
 *
 * Two things this page is careful about:
 *  - Anyone can register an OAuth client and call itself "Claude", so the
 *    address the person will be sent back to is shown next to the name.
 *  - Allow is only offered when an admin has turned AI access on for this
 *    person. The database gate refuses their tokens anyway; this just says so
 *    before they connect rather than after.
 */

type ConsentState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      authorizationId: string;
      app: string;
      host: string;
      email: string | null;
      aiAccess: boolean;
    }
  | { kind: "redirecting" };

function hostOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
}

export default function OAuthConsentPage() {
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const [state, setState] = useState<ConsentState>({ kind: "loading" });
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
      if (!authorizationId) {
        if (!cancelled) setState({ kind: "error", message: t("consent.missing") });
        return;
      }

      const [details, profile] = await Promise.all([
        supabase.auth.oauth.getAuthorizationDetails(authorizationId),
        supabase.from("profiles").select("ai_access").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      if (details.error || !details.data) {
        setState({ kind: "error", message: t("consent.invalid") });
        return;
      }
      // Already approved before: Supabase hands back the redirect straight away.
      if (!("authorization_id" in details.data)) {
        setState({ kind: "redirecting" });
        window.location.assign(details.data.redirect_url);
        return;
      }

      setState({
        kind: "ready",
        authorizationId,
        app: details.data.client?.name || "An app",
        host: hostOf(details.data.redirect_uri),
        email: user.email ?? null,
        // A missing column (before the connector's migration) reads as off.
        aiAccess: !profile.error && profile.data?.ai_access === true,
      });
    })().catch(() => {
      if (!cancelled) setState({ kind: "error", message: t("consent.failed") });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, t]);

  const decide = async (choice: "allow" | "deny") => {
    if (state.kind !== "ready" || busy) return;
    setBusy(choice);
    const result =
      choice === "allow"
        ? await supabase.auth.oauth.approveAuthorization(state.authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(state.authorizationId, { skipBrowserRedirect: true });
    if (result.error || !result.data?.redirect_url) {
      setBusy(null);
      setState({ kind: "error", message: t("consent.failed") });
      return;
    }
    setState({ kind: "redirecting" });
    window.location.assign(result.data.redirect_url);
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#111318] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          {/* The theme is only known in the browser; the first render matches the server's. */}
          <Logo variant="bare" tone={state.kind !== "loading" && theme === "dark" ? "navy" : "light"} size={24} />
          <span className="text-[15px] font-extrabold text-gray-900 dark:text-white tracking-tight">HostFlow</span>
        </div>

        {(state.kind === "loading" || state.kind === "redirecting" || authLoading) && (
          <div className="flex justify-center py-16" role="status" aria-live="polite">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden />
            <span className="sr-only">{t("consent.working")}</span>
          </div>
        )}

        {state.kind === "error" && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm text-center">
            {state.message}
          </div>
        )}

        {state.kind === "ready" && (
          <div className="bg-white dark:bg-[#1a1d2e] border border-gray-200 dark:border-white/5 rounded-2xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.045)] dark:shadow-none">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {t("consent.title", { app: state.app })}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t("consent.subtitle", { app: state.app })}</p>
            {state.email && (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {t("consent.signedInAs", { email: state.email })}
              </p>
            )}

            {!state.aiAccess ? (
              <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex gap-3">
                <ShieldAlert size={20} className="text-amber-600 dark:text-brand-amber shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t("consent.noAccessTitle")}</p>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{t("consent.noAccessBody")}</p>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mt-6 text-xs font-semibold text-gray-700 dark:text-slate-400 uppercase tracking-wider">
                  {t("consent.canTitle")}
                </h2>
                <ul className="mt-2 space-y-2">
                  {(["consent.canRead", "consent.canCreate", "consent.canComment"] as const).map((key) => (
                    <li key={key} className="flex gap-2 text-sm text-gray-700 dark:text-slate-300">
                      <Check size={16} className="text-[#00c875] shrink-0 mt-0.5" aria-hidden />
                      {t(key)}
                    </li>
                  ))}
                </ul>

                <h2 className="mt-5 text-xs font-semibold text-gray-700 dark:text-slate-400 uppercase tracking-wider">
                  {t("consent.cannotTitle")}
                </h2>
                <ul className="mt-2 space-y-2">
                  {(["consent.cannotDelete", "consent.cannotSettings"] as const).map((key) => (
                    <li key={key} className="flex gap-2 text-sm text-gray-700 dark:text-slate-300">
                      <X size={16} className="text-[#e44258] shrink-0 mt-0.5" aria-hidden />
                      {t(key)}
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-xs text-gray-500 dark:text-slate-400">{t("consent.marked")}</p>
              </>
            )}

            {state.host && (
              <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">
                {t("consent.redirectsTo", { host: state.host })}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => decide("deny")}
                disabled={busy !== null}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy === "deny" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                {t("consent.deny")}
              </button>
              {state.aiAccess && (
                <button
                  type="button"
                  onClick={() => decide("allow")}
                  disabled={busy !== null}
                  className="flex-1 py-3 rounded-xl bg-brand-amber hover:bg-brand-amber-hover text-gray-900 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy === "allow" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {t("consent.allow")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
