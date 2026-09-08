"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { supabase } from "@/lib/supabase";
import { reportMutationError, reportFetchError } from "@/lib/errorReporting";
import { useT } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { cronTimeInTimezone, DEFAULT_ORG_TIMEZONE } from "@/lib/orgTime";
import { toast } from "sonner";
import { Clock, AlertTriangle, Trash2, Loader2, ShieldAlert, Zap } from "lucide-react";
import type { Automation, AutomationActionType, Workspace } from "@/types";

interface WorkspaceAutomationsProps {
  workspace: Workspace;
  canManage: boolean;
  timeZone?: string | null;
}

type WorkspaceRecipe = "sla_alert" | "overdue_tagging";

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold text-gray-900 dark:text-white">{children}</span>
);

/**
 * Two of the three action types `AutomationsModal.tsx` offers — never
 * `move_group`, whose target is a single board's group id, which a workspace
 * has no equivalent of. `trigger_column_id` is a fixed placeholder here (not a
 * real column id): the engine never reads it for these two types — it scans
 * every date/timeline column on each board itself — so there is nothing to
 * pick, and using a constant makes the duplicate-guard below just an
 * action_type comparison.
 */
const PLACEHOLDER_COLUMN_ID = "due_date";

export default function WorkspaceAutomations({ workspace, canManage, timeZone }: WorkspaceAutomationsProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const {
    data: automations = [],
    isLoading,
  } = useQuery({
    queryKey: queryKeys.workspaceAutomations(workspace.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      if (error) {
        reportFetchError(error, "Could not load this workspace's automations", { table: "automations" });
        throw error;
      }
      return (data || []) as Automation[];
    },
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
        <ShieldAlert size={32} className="opacity-30" />
        <p className="text-sm text-center px-6">{t("auto.workspaceNoAccess")}</p>
      </div>
    );
  }

  const duplicateRecipe = (recipe: WorkspaceRecipe) =>
    automations.find((a) => a.action_type === recipe);

  const handleCreate = async (recipe: WorkspaceRecipe) => {
    if (duplicateRecipe(recipe)) return;

    const payload = {
      workspace_id: workspace.id,
      trigger_column_id: PLACEHOLDER_COLUMN_ID,
      trigger_value: recipe === "sla_alert" ? "due_date_arrives" : "due_date_passed",
      action_type: recipe as AutomationActionType,
      action_target_id: "assignee_email",
    };

    setIsActivating(true);
    const { data, error } = await supabase.from("automations").insert(payload).select().single();

    if (error || !data) {
      reportMutationError(error, "Could not enable this automation", {
        table: "automations",
        operation: "insert",
        context: recipe,
      });
      setIsActivating(false);
      return;
    }

    queryClient.setQueryData<Automation[]>(queryKeys.workspaceAutomations(workspace.id), (old = []) => [
      data,
      ...old,
    ]);
    setIsActivating(false);
    setIsCreating(false);

    toast.success(t("auto.added"), {
      description: t("auto.addedDaily", {
        time: cronTimeInTimezone(timeZone),
        zone: timeZone || DEFAULT_ORG_TIMEZONE,
      }),
      duration: 8000,
    });
  };

  const handleDelete = async (id: string) => {
    // .select() so an RLS-blocked delete (matches no rows, no error) can be
    // told apart from a real one — see lib/errorReporting.ts's runWrite note.
    const { data, error } = await supabase.from("automations").delete().eq("id", id).select("id");
    if (error || !data || data.length === 0) {
      reportMutationError(error, "Could not delete this automation", {
        table: "automations",
        operation: "delete",
        itemId: id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceAutomations(workspace.id) });
    } else {
      queryClient.setQueryData<Automation[]>(queryKeys.workspaceAutomations(workspace.id), (old = []) =>
        old.filter((a) => a.id !== id)
      );
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    const nextState = !currentEnabled;
    const { data, error } = await supabase
      .from("automations")
      .update({ enabled: nextState })
      .eq("id", id)
      .select("id");
    if (error || !data || data.length === 0) {
      reportMutationError(error, "Could not change this automation", {
        table: "automations",
        operation: "update",
        itemId: id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceAutomations(workspace.id) });
    } else {
      queryClient.setQueryData<Automation[]>(queryKeys.workspaceAutomations(workspace.id), (old = []) =>
        old.map((a) => (a.id === id ? { ...a, enabled: nextState } : a))
      );
    }
  };

  const renderDescription = (auto: Automation) => {
    const column = <Chip>{t("auto.anyDateColumn")}</Chip>;
    if (auto.action_type === "sla_alert") {
      return fill(t("auto.ruleSla"), { column, status: <Chip>Working on it</Chip> });
    }
    return fill(t("auto.ruleOverdue"), { column, done: <Chip>Done</Chip>, overdue: <Chip>Overdue</Chip> });
  };

  const recipes: { id: WorkspaceRecipe; icon: React.ReactNode; title: string; body: string }[] = [
    { id: "sla_alert", icon: <Clock size={18} />, title: t("auto.dueTitle"), body: t("auto.dueBody") },
    { id: "overdue_tagging", icon: <AlertTriangle size={18} />, title: t("auto.overdueTitle"), body: t("auto.overdueBody") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.workspaceSubtitle")}</p>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] dark:bg-[#24396f] dark:hover:bg-[#2d4682] rounded-lg transition-colors"
          >
            {t("auto.newRule")}
          </button>
        )}
      </div>

      {isCreating && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{t("auto.choose")}</h3>
            <button
              onClick={() => setIsCreating(false)}
              className="text-xs text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {t("auto.cancel")}
            </button>
          </div>
          {recipes.map((recipe) => {
            const blocked = !!duplicateRecipe(recipe.id);
            return (
              <div
                key={recipe.id}
                className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700"
              >
                <span className="mt-0.5 text-gray-500 dark:text-gray-400 shrink-0">{recipe.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-gray-900 dark:text-white">{recipe.title}</div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">{recipe.body}</div>
                  {blocked && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{t("auto.duplicate")}</div>
                  )}
                </div>
                <button
                  onClick={() => handleCreate(recipe.id)}
                  disabled={blocked || isActivating}
                  className="shrink-0 self-center px-2.5 py-1 text-[11.5px] font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] dark:bg-[#24396f] dark:hover:bg-[#2d4682] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isActivating ? <Loader2 size={12} className="animate-spin" /> : t("auto.createRule")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={18} />
        </div>
      ) : automations.length === 0 ? (
        <p className="text-[13px] text-gray-500 dark:text-slate-400 text-center py-8">{t("auto.noneWorkspace")}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className={`flex items-start gap-3 py-3 ${auto.enabled === false ? "opacity-55" : ""}`}
            >
              <Zap size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] leading-relaxed text-gray-700 dark:text-slate-200">
                  {renderDescription(auto)}
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-gray-400 dark:text-slate-500">
                  {t("auto.timingDaily", { time: cronTimeInTimezone(timeZone) })}
                  {auto.enabled === false && ` · ${t("auto.paused")}`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(auto.id, auto.enabled !== false)}
                  role="switch"
                  aria-checked={auto.enabled !== false}
                  title={auto.enabled !== false ? t("auto.switchOff") : t("auto.switchOn")}
                  className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${
                    auto.enabled !== false ? "bg-[#1A2C5B] dark:bg-amber-500" : "bg-gray-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
                      auto.enabled !== false ? "left-[16px]" : "left-[2px]"
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(auto.id)}
                  title={t("auto.deleteRule")}
                  className="p-1.5 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 rounded-md transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
