"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/components/LanguageProvider";
import { useAuth } from "@/components/AuthProvider";
import { useProfilesQuery } from "@/hooks/queries/useGlobalQueries";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { supabase } from "@/lib/supabase";
import { reportFetchError } from "@/lib/errorReporting";
import { format } from "date-fns";
import {
  History,
  PlusCircle,
  Trash2,
  RotateCcw,
  CircleDot,
  UserRound,
  Flag,
  CalendarClock,
  FileText,
  ShieldAlert,
  LucideIcon,
} from "lucide-react";
import { TruncatedText } from "@/components/ui/TruncatedText";
import type { AuditLog, AuditActionType, Board, Profile } from "@/types";
import type { TranslateVars } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/types";

interface ActivityLogProps {
  board: Board;
  onOpenItem?: (itemId: string) => void;
}

const ACTION_ICONS: Record<AuditActionType, LucideIcon> = {
  item_created: PlusCircle,
  item_deleted: Trash2,
  item_restored: RotateCcw,
  status_changed: CircleDot,
  assignee_changed: UserRound,
  priority_changed: Flag,
  due_date_changed: CalendarClock,
  description_changed: FileText,
};

const ACTION_TONE: Record<AuditActionType, string> = {
  item_created: "text-emerald-500",
  item_deleted: "text-red-500",
  item_restored: "text-blue-500",
  status_changed: "text-amber-500",
  assignee_changed: "text-violet-500",
  priority_changed: "text-orange-500",
  due_date_changed: "text-cyan-500",
  description_changed: "text-gray-500",
};

type TFunc = (key: TranslationKey, vars?: TranslateVars) => string;

function actorName(userId: string | null, profileMap: Map<string, Profile>, t: TFunc): string {
  if (!userId) return t("audit.system");
  return profileMap.get(userId)?.full_name || t("audit.someone");
}

function formatChangedValue(
  actionType: AuditActionType,
  raw: unknown,
  profileMap: Map<string, Profile>,
  t: TFunc
): string {
  if (raw === null || raw === undefined || raw === "") return "—";

  if (actionType === "assignee_changed") {
    const ids = Array.isArray(raw) ? raw : [raw];
    if (ids.length === 0) return t("audit.nobody");
    return ids
      .map((id) => (typeof id === "string" ? profileMap.get(id)?.full_name : null) || t("audit.someone"))
      .join(", ");
  }

  if (actionType === "due_date_changed" && typeof raw === "object") {
    const range = raw as { start?: string; end?: string };
    const start = range.start ? String(range.start) : null;
    const end = range.end ? String(range.end) : null;
    if (start && end) return `${start} → ${end}`;
    return start || end || "—";
  }

  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return JSON.stringify(raw);
}

function describeLog(log: AuditLog, profileMap: Map<string, Profile>, t: TFunc) {
  const actor = actorName(log.user_id, profileMap, t);
  const itemName = log.items?.name || log.old_value?.name || log.new_value?.name || t("audit.deletedItem");
  const Icon = ACTION_ICONS[log.action_type] ?? History;
  const tone = ACTION_TONE[log.action_type] ?? "text-gray-500";

  if (log.action_type === "item_created") {
    return { Icon, tone, text: t("audit.itemCreated", { actor, item: itemName }) };
  }
  if (log.action_type === "item_deleted") {
    return { Icon, tone, text: t("audit.itemDeleted", { actor, item: itemName }) };
  }
  if (log.action_type === "item_restored") {
    return { Icon, tone, text: t("audit.itemRestored", { actor, item: itemName }) };
  }

  const column = log.old_value?.column || log.new_value?.column || "";
  const oldValue = formatChangedValue(log.action_type, log.old_value?.value, profileMap, t);
  const newValue = formatChangedValue(log.action_type, log.new_value?.value, profileMap, t);
  return {
    Icon,
    tone,
    text: t("audit.fieldChanged", { actor, column, item: itemName, oldValue, newValue }),
  };
}

export default function ActivityLog({ board, onOpenItem }: ActivityLogProps) {
  const t = useT();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data: directory = [] } = useProfilesQuery(isAdmin);
  const profileMap = React.useMemo(() => new Map(directory.map((p) => [p.id, p])), [directory]);

  const {
    data: logs = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.auditLogs(board.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, items(name)")
        .eq("board_id", board.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        reportFetchError(error, t("audit.loadError"), { table: "audit_logs" });
        throw error;
      }
      return (data || []) as AuditLog[];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500 bg-[#f6f7fb] dark:bg-[#181b34]">
        <ShieldAlert size={40} className="opacity-30" />
        <p>{t("audit.adminOnly")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#f6f7fb] dark:bg-[#181b34] p-8">
      <div className="max-w-[900px] mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
            <History size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t("audit.title")}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("audit.subtitle")}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <p>{t("audit.loadError")}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <History size={40} className="opacity-20 mb-3" />
              <p>{t("audit.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {logs.map((log) => {
                const { Icon, tone, text } = describeLog(log, profileMap, t);
                const clickable = Boolean(log.item_id && onOpenItem);
                return (
                  <li
                    key={log.id}
                    onClick={clickable ? () => onOpenItem!(log.item_id!) : undefined}
                    className={`flex items-start gap-3 px-5 py-3 ${
                      clickable ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors" : ""
                    }`}
                  >
                    <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                    <TruncatedText
                      as="div"
                      className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate"
                      tooltip={text}
                    >
                      {text}
                    </TruncatedText>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
