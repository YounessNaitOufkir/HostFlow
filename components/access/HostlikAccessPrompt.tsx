"use client";

import React, { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { useAccessRequests } from "@/hooks/useAccessRequests";
import { useRequestWorkspaceAccess } from "@/hooks/useRequestWorkspaceAccess";
import { accessPromptState } from "@/lib/accessRequests";
import type { Profile } from "@/types";

/**
 * "Work at Host'lik?" for someone with no shared workspace: the way to ask, or
 * where their request stands. The same in the sidebar and on the empty screen,
 * and it survives a reload, since it is read from the request itself.
 */
export function HostlikAccessPrompt({
  profile,
  variant,
  className = "",
}: {
  profile: Profile | null;
  variant: "sidebar" | "page";
  /** On the wrapper, which is left out entirely while there is nothing to say. */
  className?: string;
}) {
  const t = useT();
  const { bcp47 } = useLanguage();
  const { loaded, latestByUser } = useAccessRequests(profile?.id);
  const { requesting, request } = useRequestWorkspaceAccess();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const noteId = useId();

  // Nothing until the request is known, rather than offering to ask someone
  // who is already waiting.
  if (!profile || !loaded) return null;
  const state = accessPromptState(profile, latestByUser.get(profile.id));
  if (state.kind === "hidden") return null;

  const page = variant === "page";
  const text = page ? "text-[13px]" : "text-[12px]";
  const date = (iso: string) =>
    new Intl.DateTimeFormat(bcp47, { day: "numeric", month: "short" }).format(new Date(iso));

  if (state.kind !== "ask") {
    const [dot, title, body] =
      state.kind === "pending"
        ? ["bg-amber-500", t("access.pendingTitle", { date: date(state.since) }), t("access.pendingBody")]
        : state.kind === "declined"
          ? ["bg-red-500", t("access.declinedTitle", { date: date(state.on) }), t("access.declinedBody")]
          : ["bg-emerald-500", t("access.approvedTitle"), t("access.approvedBody")];
    return (
      <div
        role="status"
        className={`${className} flex items-start gap-2 ${text} leading-relaxed text-gray-500 dark:text-slate-400 ${page ? "max-w-md text-left" : ""}`}
      >
        <span className={`mt-[0.45em] w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
        <p>
          <span className="font-semibold text-gray-700 dark:text-slate-200">{title}</span> {body}
        </p>
      </div>
    );
  }

  if (!asking) {
    return (
      <p className={`${className} ${text} leading-relaxed text-gray-500 dark:text-slate-400 ${page ? "max-w-md" : ""}`}>
        {t("empty.hostlikPrompt")}{" "}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAsking(true);
          }}
          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t("empty.hostlikRequest")}
        </button>
      </p>
    );
  }

  const send = async () => {
    setFailed(false);
    const result = await request(note);
    if (result === "error") {
      setFailed(true);
      return;
    }
    // Whatever the answer, the request data has been refetched by now and the
    // prompt shows where it stands.
    setAsking(false);
    setNote("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!requesting) void send();
      }}
      className={`${className} ${text} leading-relaxed text-gray-500 dark:text-slate-400 ${page ? "w-full max-w-md text-left" : ""}`}
    >
      <p>{t("access.askIntro")}</p>
      <label htmlFor={noteId} className="block mt-2 mb-1 text-[11px] font-semibold text-gray-600 dark:text-slate-300">
        {t("access.noteLabel")}
      </label>
      <textarea
        id={noteId}
        rows={2}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !requesting) setAsking(false);
        }}
        placeholder={t("access.notePlaceholder")}
        autoFocus
        className={`w-full resize-none rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900/60 px-2.5 py-1.5 ${text} text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={requesting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {requesting && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
          {t("access.send")}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={requesting}
          className="px-2 py-1.5 rounded-md text-[12px] font-medium text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
          {t("empty.requestFailed")}
        </p>
      )}
    </form>
  );
}
