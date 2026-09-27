"use client";

import React, { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { reasonToStore, type AccessRequest, type AccessRequestPerson } from "@/lib/accessRequests";
import type { DecideResult } from "@/hooks/useAccessRequests";

/** Clicks inside this dialog are not "outside" for the menus it opens over. */
export const ACCESS_DIALOG_ATTR = "data-access-dialog";

/**
 * Approving and declining, the same from the bell and from Admin settings:
 * one request busy at a time, the decline dialog, and a word when another
 * admin got there first.
 */
export function useAccessDecisions(
  decide: (request: AccessRequest, approve: boolean, reason?: string | null) => Promise<DecideResult>,
  onApproved?: (request: AccessRequest) => void
) {
  const t = useT();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<{ request: AccessRequest; name: string } | null>(null);

  const run = async (request: AccessRequest, approve: boolean, reason: string | null) => {
    setBusyId(request.id);
    const result = await decide(request, approve, reason);
    setBusyId(null);
    if (result === "already") toast.info(t("access.alreadyDecided"));
    return result;
  };

  const approve = async (request: AccessRequest) => {
    if ((await run(request, true, null)) === "ok") onApproved?.(request);
  };

  const confirmDecline = async (reasonText: string) => {
    if (!declining) return;
    const result = await run(declining.request, false, reasonToStore(reasonText, t("access.defaultReason")));
    // Kept open on a failure, so the reason typed is not lost.
    if (result !== "error") setDeclining(null);
  };

  const dialog = declining ? (
    <DeclineRequestDialog
      name={declining.name}
      busy={busyId === declining.request.id}
      onCancel={() => setDeclining(null)}
      onConfirm={confirmDecline}
    />
  ) : null;

  return {
    busyId,
    approve,
    startDecline: (request: AccessRequest, name: string) => setDeclining({ request, name }),
    dialog,
  };
}

export function ApproveDeclineButtons({
  name,
  busy,
  onApprove,
  onDecline,
  className = "",
}: {
  name: string;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        aria-label={t("access.approveNamed", { name })}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {t("access.approve")}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={busy}
        aria-label={t("access.declineNamed", { name })}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 hover:border-red-300 hover:text-red-700 dark:hover:border-red-800 dark:hover:text-red-300 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {t("access.decline")}
      </button>
    </div>
  );
}

/** How a request was settled, and by whom: so no admin handles it twice. */
export function AccessDecisionPill({
  request,
  people,
  meId,
  className = "",
}: {
  request: AccessRequest;
  people: Map<string, AccessRequestPerson>;
  meId: string | null | undefined;
  className?: string;
}) {
  const t = useT();
  const { bcp47 } = useLanguage();
  if (request.status === "pending") return null;

  const date = new Intl.DateTimeFormat(bcp47, { day: "numeric", month: "short" }).format(
    new Date(request.decided_at ?? request.created_at)
  );
  const decider =
    request.decided_by && request.decided_by === meId
      ? t("access.you")
      : request.decided_by
        ? people.get(request.decided_by)?.full_name ?? null
        : null;
  const approved = request.status === "approved";
  const text = approved
    ? decider
      ? t("access.approvedBy", { name: decider, date })
      : t("access.approvedOn", { date })
    : decider
      ? t("access.declinedBy", { name: decider, date })
      : t("access.declinedOn", { date });

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        approved
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      } ${className}`}
    >
      {approved ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
      {text}
    </span>
  );
}

/**
 * Declining asks for one reason, already filled in with the standard one, which
 * the person reads in a notification and in a popup the next time they open
 * HostFlow. Most of the time the admin just presses Decline.
 */
export function DeclineRequestDialog({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState(() => t("access.defaultReason"));
  const titleId = useId();
  const reasonId = useId();

  return createPortal(
    <div
      {...{ [ACCESS_DIALOG_ATTR]: "" }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Only this dialog: not the menu or Admin settings beneath it.
          e.stopPropagation();
          if (!busy) onCancel();
        }
      }}
    >
      <div
        className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onConfirm(reason);
        }}
        className="relative w-full max-w-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl p-6"
      >
        <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("access.declineTitle", { name })}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("access.declineSub", { name })}</p>

        <label
          htmlFor={reasonId}
          className="block mt-5 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
        >
          {t("access.reason")}
        </label>
        <textarea
          id={reasonId}
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          className="w-full resize-none bg-gray-50 dark:bg-slate-900/60 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("access.reasonHint")}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-3.5 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t("access.declineConfirm")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
