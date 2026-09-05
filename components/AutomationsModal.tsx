"use client";

import React, { useState } from "react";
import { isDoneStatusValue } from "@/lib/statusSemantics";
import { displayColumnTitle } from "@/lib/i18n/labels";
import { useT } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { X, Trash2, Loader2, Calendar, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { toast } from "sonner";
import { Board, Column, Group, Automation, Item, STATUS_OPTIONS, Profile, StatusOption } from "@/types";
import { cronTimeInTimezone, DEFAULT_ORG_TIMEZONE } from "@/lib/orgTime";
import { DONE_STATUS_PATTERN } from "@/lib/automations/engine";

interface AutomationsModalProps {
  board: Board;
  groups: Group[];
  items: Item[];
  boardAutomations: Automation[];
  profiles: Profile[];
  /**
   * organization_settings.default_timezone. The scheduled badge showed a bare
   * "09:00", which is the cron's UTC hour, not the hour the company sees — for
   * Casablanca the job actually lands at 10:00. Defaults to UTC.
   */
  timeZone?: string | null;
  onClose: () => void;
}

type RecipeType = "move_done" | "sla_alert" | "overdue_tagging" | null;


// that cannot possibly do anything until the next daily run must say so, or it
// reads as broken.
const SCHEDULED = new Set(['overdue_tagging', 'sla_alert']);
const isScheduled = (actionType: string) => SCHEDULED.has(actionType);

// parts standing out - rather than four differently-coloured descriptions
// that each invented their own emphasis.
// The values a rule acts on. Emphasis carries them now rather than a coloured
// pill: with four or five per sentence the pills were louder than the sentence,
// and the blue/green split encoded nothing a reader could name.
const Chip = ({ children }: { children: React.ReactNode; tone?: 'blue' | 'green' }) => (
  <span className="font-semibold text-gray-900 dark:text-white">{children}</span>
);

/** "Daily 10:00" / "Instant", for the metadata line under a rule. */
type Translate = ReturnType<typeof useT>;

const timingLabel = (t: Translate, actionType: string, timeZone?: string | null) =>
  isScheduled(actionType)
    ? t("auto.timingDaily", { time: cronTimeInTimezone(timeZone) })
    : t("auto.timingInstant");


/** The stripe colour: amber for scheduled, green for immediate. */
const timingStripe = (actionType: string) =>
  isScheduled(actionType)
    ? 'bg-amber-400 dark:bg-amber-500'
    : 'bg-emerald-500 dark:bg-emerald-400';
// Recipe cards still need to say when a rule would run, but as a quiet label
// rather than a badge - the rules list carries the same fact in its metadata
// line, and two different treatments of one fact read as two facts.
const TimingBadge = ({ actionType, timeZone }: { actionType: string; timeZone?: string | null }) => {
  const t = useT();
  return (
    <span
      title={
        isScheduled(actionType)
          ? t("auto.timingDailyTip", {
              time: cronTimeInTimezone(timeZone),
              zone: timeZone || DEFAULT_ORG_TIMEZONE,
            })
          : t("auto.timingInstantTip")
      }
      className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.09em] text-gray-400 dark:text-slate-500"
    >
      {timingLabel(t, actionType, timeZone)}
    </span>
  );
};
/**
 * A small drawing of what each rule actually does.
 *
 * Every one of these is a claim about behaviour, so each mirrors what
 * evaluateTimeAutomations and updateCell really do — a diagram that drifts from
 * the rule is worse than no diagram. Colour comes from Tailwind text classes on
 * the wrapper and `currentColor` inside, so both themes work without a second
 * set of values.
 */

/**
 * An item being filed into the Completed group.
 *
 * Drawn as a list losing a row into a tray, deliberately unlike the Overdue
 * diagram below: this rule *moves* an item between groups, while that one
 * *rewrites* a status value. Two different mechanisms must not look alike.
 */
const DiagramArchive = () => {
  const t = useT();
  return (
  <svg viewBox="0 0 150 44" className="w-full h-auto max-w-[168px]" role="img" aria-label={t("auto.diagArchive")}>
    <rect x="6" y="8" width="42" height="6" rx="3" className="fill-gray-300 dark:fill-slate-600" />
    <rect x="6" y="19" width="42" height="6" rx="3" className="fill-gray-200 dark:fill-slate-700" />
    <rect x="6" y="30" width="28" height="6" rx="3" className="fill-gray-200 dark:fill-slate-700" />
    <path d="M56 14c14 0 14 14 28 14" className="stroke-gray-400 dark:stroke-slate-500" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
    <path d="M80 24l5 4-5 4" className="stroke-gray-400 dark:stroke-slate-500" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M96 20h44v14a2 2 0 0 1-2 2H98a2 2 0 0 1-2-2z" className="fill-emerald-50 stroke-emerald-500 dark:fill-emerald-500/10" strokeWidth="1.3" strokeLinejoin="round" />
    <rect x="94" y="13" width="48" height="7" rx="2" className="fill-emerald-500" />
    <path d="M110 28h16" className="stroke-emerald-500" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
};

/** The clock reaching the date, which rings a notification. */
const DiagramDueAlert = () => {
  const t = useT();
  return (
  <svg viewBox="0 0 150 44" className="w-full h-auto max-w-[168px]" role="img" aria-label={t("auto.diagDue")}>
    <circle cx="38" cy="22" r="14" className="stroke-amber-500" fill="none" strokeWidth="1.8" />
    <path d="M38 14v9l6 3" className="stroke-amber-500" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M62 22h20" className="stroke-gray-400 dark:stroke-slate-500" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" />
    <path d="M79 18l5 4-5 4" className="stroke-gray-400 dark:stroke-slate-500" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M112 16a6 6 0 0 0-12 0c0 6-2.5 8-2.5 8h17s-2.5-2-2.5-8z" className="stroke-amber-600 dark:stroke-amber-400" fill="none" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M104 27a2.4 2.4 0 0 0 4 0" className="stroke-amber-600 dark:stroke-amber-400" fill="none" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
};

/** A task's status being rewritten to Overdue. */
const DiagramOverdue = () => {
  const t = useT();
  return (
  <svg viewBox="0 0 150 44" className="w-full h-auto max-w-[168px]" role="img" aria-label={t("auto.diagOverdue")}>
    <rect x="8" y="12" width="56" height="20" rx="4" className="fill-gray-200 dark:fill-slate-700" />
    <rect x="15" y="19" width="30" height="6" rx="3" className="fill-gray-400 dark:fill-slate-500" />
    <path d="M72 22h14" className="stroke-gray-400 dark:stroke-slate-500" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" />
    <path d="M83 18l5 4-5 4" className="stroke-gray-400 dark:stroke-slate-500" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="96" y="12" width="46" height="20" rx="4" className="fill-rose-50 stroke-rose-500 dark:fill-rose-500/10" strokeWidth="1.2" />
    <rect x="103" y="19" width="32" height="6" rx="3" className="fill-rose-500" />
  </svg>
);
};

export default function AutomationsModal({ board, groups, items, boardAutomations, profiles, timeZone, onClose }: AutomationsModalProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeType>(null);
  const [isActivating, setIsActivating] = useState(false);

  const {
    data: automations = [],
    isLoading: loading,
  } = useQuery({
    queryKey: queryKeys.automations(board.id),
    queryFn: async () => {
      // Via the RPC, not a board_id filter. Time and behaviour rules are stored
      // against the workspace with board_id NULL, so filtering on board_id hid
      // every one of them: they appeared when created (optimistic cache) and
      // vanished on the next refetch, while still running for the engine, which
      // reads this same RPC. Rules you cannot see are rules you cannot turn off.
      const { data, error } = await supabase.rpc("automations_for_board", {
        b_id: board.id,
      });
      if (error) throw error;
      return ((data || []) as Automation[])
        .slice()
        .sort((a, b) =>
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
        );
    },
  });

  // Form state for customizable recipes
  const statusCols = board.columns.filter((c) => c.type === "status");
  const dateCols = board.columns.filter((c) => c.type === "date" || c.type === "timeline");
  
  const [triggerColId, setTriggerColId] = useState(statusCols[0]?.id || "");
  // Derived, not state. Nothing sets these any more now that the date-column and
  // target-group selectors are gone, and as useState they were initialised once —
  // so switching to another board kept the previous board's ids.
  const triggerDateColId = dateCols[0]?.id || "";

  const selectedColDef = board.columns.find((c) => c.id === triggerColId);
  const currentStatusOptions = selectedColDef?.settings?.statusLabels || STATUS_OPTIONS;

  // The status a move rule fires on has to come from the column's own labels.
  // It used to be the hard-coded English "Done" / "Cancelled", which silently
  // never matched a board whose statuses are named anything else — an imported
  // board labelled Fait / En cours / Bloqué could never trigger the rule, and
  // "Cancelled" matched no board at all. The rule saved fine and simply never
  // ran, which is the worst way for this to fail.
  const statusLabels: string[] = (currentStatusOptions as any[]).map((o) =>
    typeof o === "string" ? o : o?.label
  ).filter(Boolean);
  // A move rule needs a second group to move work INTO. On a board with one
  // group the rule can only ever move an item to where it already is, which is
  // indistinguishable from the automation not running.
  const isMoveRecipe =
    selectedRecipe === "move_done";
  // The engine takes the FIRST rule that matches, so a second rule on the same
  // trigger can never run - it is silently shadowed by the older one. That is
  // how a board ends up with several identical rules and behaviour nobody can
  // explain: the rule you just made is not the one that fires.
  const plannedActionType = isMoveRecipe ? 'move_group' : selectedRecipe;
  const canonicalForRecipe = "Done";
  // Auto-Archive is a fixed rule, so the label is resolved rather than chosen.
  // Not simply "Done": the imported French board's done label is "Fait". Matching
  // the engine's own test avoids picking statusLabels[0], which is only the right
  // answer by luck.
  const effectiveTriggerValue =
    statusLabels.find((l) => isDoneStatusValue(l, currentStatusOptions as StatusOption[])) ||
    statusLabels[0] ||
    canonicalForRecipe;

  const plannedColumn = isMoveRecipe ? triggerColId : triggerDateColId;
  const duplicateRule = selectedRecipe
    ? automations.find(
        (a) =>
          a.action_type === plannedActionType &&
          a.trigger_column_id === plannedColumn &&
          (!isMoveRecipe || a.trigger_value === effectiveTriggerValue)
      )
    : undefined;
  // Auto-Archive creates its own Completed group when a board has none, so a
  // board with a single group is no longer a blocker.
  const blocked = !!duplicateRule;

  // Shown in the header, so the panel says what it holds before you scroll it.
  const scheduledCount = automations.filter((a) => isScheduled(a.action_type)).length;
  // Two kinds of rule, which the old UI presented identically. Move and
  // shifting rules are evaluated in the browser the moment a cell changes;
  // overdue tagging and SLA alerts are only evaluated by the daily cron. A rule
  const [runningId, setRunningId] = useState<string | null>(null);

  const runNow = async (automationId: string) => {
    setRunningId(automationId);
    try {
      const res = await fetch('/api/automations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || t("auto.errRun"));
        return;
      }
      if (body.triggeredCount > 0) {
        toast.success(body.message);
        queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
      } else {
        toast.info(body.message);
      }
    } catch {
      toast.error(t("auto.errReach"));
    } finally {
      setRunningId(null);
    }
  };
  // The group Auto-Archive files completed work into. Boards normally have one
  // "Completed" group; if a board somehow has more, the lowest-positioned one wins
  // rather than an arbitrary pick, since groups arrive ordered by position.
  const COMPLETED_GROUP_TITLE = "Completed";
  const existingCompletedGroup = groups.find(
    (g) => g.title.trim().toLowerCase() === COMPLETED_GROUP_TITLE.toLowerCase()
  );

  // Time and behaviour rules apply to the whole workspace; if the board somehow
  // has no workspace, fall back to board scope so a scope is always present.
  const workspaceScope = board.workspace_id
    ? { workspace_id: board.workspace_id }
    : { board_id: board.id };

  const handleCreateRecipe = async (recipe: RecipeType) => {
    let payload: any = null;

    if (recipe === "move_done") {
      // Strict rule: done work goes to a group called "Completed". If the board
      // has none, make one rather than silently filing into whatever group happened
      // to be last — which is what the old Target Group dropdown defaulted to, and
      // why the card's promise of "Group Completed" was not what actually happened.
      let completedGroupId = existingCompletedGroup?.id;

      if (!completedGroupId) {
        const { data: createdGroup, error: groupError } = await supabase
          .from("groups")
          .insert({
            board_id: board.id,
            title: COMPLETED_GROUP_TITLE,
            color: "#00c875",
            position: groups.length,
          })
          .select("id")
          .single();

        if (groupError || !createdGroup) {
          toast.error(t("auto.errGroup"), {
            description: t("auto.errGroupBody"),
          });
          return;
        }
        completedGroupId = createdGroup.id;
        queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
      }

      payload = {
        board_id: board.id,
        trigger_column_id: triggerColId || statusCols[0]?.id || "status",
        trigger_value: effectiveTriggerValue,
        action_type: "move_group",
        action_target_id: completedGroupId,
      };

    } else if (recipe === "sla_alert") {
      payload = {
        ...workspaceScope,
        trigger_column_id: triggerDateColId || dateCols[0]?.id || "date",
        trigger_value: "due_date_arrives",
        action_type: "sla_alert",
        action_target_id: "assignee_email",
      };
    } else if (recipe === "overdue_tagging") {
      payload = {
        ...workspaceScope,
        trigger_column_id: triggerDateColId || dateCols[0]?.id || "date",
        trigger_value: "due_date_passed",
        action_type: "overdue_tagging",
        action_target_id: "assignee_email",
      };
    }

    if (!payload) return;

    setIsActivating(true);
    const { data, error } = await supabase
      .from("automations")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      // Previously this branch just stopped the spinner, so a rejected write
      // looked exactly like a successful one that did nothing.
      reportMutationError(error, "Could not enable this automation", {
        table: "automations",
        operation: "insert",
        context: recipe ?? undefined,
      });
      setIsActivating(false);
      return;
    }

    queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) => [data, ...old]);
    queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
    setIsActivating(false);
    setIsCreating(false);
    setSelectedRecipe(null);

    // A corner toast rather than a full-screen takeover. It states when the new
    // rule will run, and for a scheduled one offers to run it immediately -
    // otherwise activating it means waiting until the next daily run to find out
    // whether it does anything.
    const scheduled = isScheduled(data.action_type);
    toast.success(t("auto.added"), {
      description: scheduled
        ? t("auto.addedDaily", {
            time: cronTimeInTimezone(timeZone),
            zone: timeZone || DEFAULT_ORG_TIMEZONE,
          })
        : t("auto.addedInstant"),
      duration: scheduled ? 12000 : 5000,
      action: scheduled
        ? { label: t("auto.runNowAction"), onClick: () => runNow(data.id) }
        : undefined,
    });
  };

  const handleDelete = async (id: string) => {
    // .select() so we can tell "deleted" from "RLS matched no rows", which
    // returns no error and would otherwise vanish from the list and come back
    // on the next refetch.
    const { data, error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data || data.length === 0) {
      reportMutationError(error, "Could not delete this automation", {
        table: "automations",
        operation: "delete",
        itemId: id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations(board.id) });
    } else {
      queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) =>
        old.filter((a) => a.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean = true) => {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.automations(board.id) });
    } else {
      queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) =>
        old.map((a) => (a.id === id ? { ...a, enabled: nextState } : a))
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
    }
  };

  const getColName = (id: string) =>
    board.columns.find((c) => c.id === id)?.title || t("auto.colFallback");
  const getGroupName = (id: string) =>
    groups.find((g) => g.id === id)?.title || t("auto.groupFallback");

  // One consistent chip, so a rule reads as a sentence with the changeable

  const renderRuleDescription = (auto: Automation) => {
    if (auto.action_type === 'sla_alert') {
      return fill(t("auto.ruleSla"), {
        column: <Chip>{getColName(auto.trigger_column_id)}</Chip>,
        // The chips carry the literal status values the engine matches and
        // writes, so they are board data and stay untranslated.
        status: <Chip>Working on it</Chip>,
      });
    }
    if (auto.action_type === 'overdue_tagging') {
      return fill(t("auto.ruleOverdue"), {
        column: <Chip>{getColName(auto.trigger_column_id)}</Chip>,
        done: <Chip>Done</Chip>,
        overdue: <Chip tone="green">Overdue</Chip>,
      });
    }
    if (auto.action_type === 'timeline_shifting') {
      // Kept only so an existing rule can still be read and removed. Dependencies
      // now reschedule successors on every date change, through one engine, so
      // there is nothing left for this to switch on.
      return (
        <>
          <span className="line-through opacity-60">
            {fill(t("auto.ruleShift"), {
              column: <Chip>{getColName(auto.trigger_column_id)}</Chip>,
            })}
          </span>{" "}
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {t("auto.ruleShiftNote")}
          </span>
        </>
      );
    }
    return fill(t("auto.ruleMove"), {
      column: <Chip>{getColName(auto.trigger_column_id)}</Chip>,
      value: <Chip>{auto.trigger_value}</Chip>,
      group: <Chip tone="green">{getGroupName(auto.action_target_id)}</Chip>,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden max-h-[85vh]">
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight">
              {t("auto.title")}
            </h2>
            <p className="text-[12.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
              {board.name}
              {automations.length > 0 && (
                <>
                  {` · ${automations.length === 1
                    ? t("auto.ruleCountOne")
                    : t("auto.ruleCount", { count: automations.length })}`}
                  {scheduledCount > 0 &&
                    ` · ${t("auto.scheduledCount", { count: scheduledCount })}`}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-3.5 py-2 text-[12.5px] font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] dark:bg-[#24396f] dark:hover:bg-[#2d4682] rounded-lg transition-colors"
              >
                {t("auto.newRule")}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t("auto.close")}
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          
          {/* Create New Automation */}
          {isCreating && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">
                  {t("auto.choose")}
                </h3>
                <button
                  onClick={() => { setIsCreating(false); setSelectedRecipe(null); }}
                  className="text-[12px] text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  {t("auto.cancel")}
                </button>
              </div>
              {/*
                Recipe cards, each with a diagram of the mechanism. Driven from one
                array rather than four near-identical blocks, so a fifth recipe is a
                data entry and the selected/hover treatment cannot drift between them.
                Selection, timing badges and copy are unchanged — this is presentation
                only.
              */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: "move_done" as const,
                      actionType: "move_group",
                      title: t("auto.archiveTitle"),
                      diagram: <DiagramArchive />,
                      description: t("auto.archiveBody", {
                        status: effectiveTriggerValue,
                        group: COMPLETED_GROUP_TITLE,
                      }),
                    },
                    {
                      id: "sla_alert" as const,
                      actionType: "sla_alert",
                      title: t("auto.dueTitle"),
                      diagram: <DiagramDueAlert />,
                      description: t("auto.dueBody"),
                    },
                    {
                      id: "overdue_tagging" as const,
                      actionType: "overdue_tagging",
                      title: t("auto.overdueTitle"),
                      diagram: <DiagramOverdue />,
                      description: t("auto.overdueBody"),
                    },
                  ]
                ).map((recipe) => {
                  const isSelected = selectedRecipe === recipe.id;
                  return (
                    <button
                      type="button"
                      key={recipe.id}
                      onClick={() => setSelectedRecipe(recipe.id)}
                      aria-pressed={isSelected}
                      className={`text-left flex flex-col gap-2.5 p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-[#1A2C5B] dark:border-amber-400 bg-gray-50 dark:bg-white/[0.05] shadow-sm"
                          : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50/60 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <span
                        className={`flex items-center justify-center rounded-lg py-2.5 px-2 transition-colors ${
                          isSelected ? "bg-white dark:bg-slate-900/60" : "bg-gray-50 dark:bg-slate-800/60"
                        }`}
                      >
                        {recipe.diagram}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{recipe.title}</span>
                          <TimingBadge actionType={recipe.actionType} timeZone={timeZone} />
                        </span>
                        <span className="block text-[12px] leading-relaxed text-gray-500 dark:text-slate-400 mt-1">
                          {recipe.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Customization Options for Selected Recipe */}
              {selectedRecipe && (
                <div className="pt-4 border-t border-gray-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {duplicateRule ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        A rule for this trigger already exists below. Two rules on
                        the same trigger cannot both run - only the first would.
                      </span>
                    ) : isMoveRecipe ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {statusCols.length > 1 && (
                          <>
                            <span>Status Column:</span>
                            <select
                              className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
                              value={triggerColId}
                              onChange={(e) => setTriggerColId(e.target.value)}
                            >
                              {statusCols.map((c) => (
                                <option key={c.id} value={c.id}>{displayColumnTitle(t, c.title)}</option>
                              ))}
                            </select>
                          </>
                        )}
                        {/*
                          A fixed rule, not a configuration. The card has always
                          promised "move item to Group Completed", while the Target
                          Group dropdown actually filed items into whichever group you
                          picked — defaulting to the last one on the board. The promise
                          is now the behaviour. The status label is resolved rather than
                          chosen because boards disagree on the word: the imported
                          French board's is "Fait".
                        */}
                        <span>
                          When a task is marked{" "}
                          <b className="font-semibold text-gray-800 dark:text-gray-100">
                            {effectiveTriggerValue}
                          </b>
                          , it moves to the{" "}
                          <b className="font-semibold text-gray-800 dark:text-gray-100">
                            {COMPLETED_GROUP_TITLE}
                          </b>{" "}
                          group.
                        </span>
                        {!existingCompletedGroup && (
                          <span className="text-amber-600 dark:text-amber-400">
                            This board has no {COMPLETED_GROUP_TITLE}{" "}
                            group yet &mdash; enabling this will create one.
                          </span>
                        )}
                      </div>
                    ) : (
                      /*
                        Not a choice. This used to be a "Date Column:" dropdown, but
                        evaluateTimeAutomations never reads the saved
                        trigger_column_id for scheduled rules: it scans every date and
                        timeline column, plus any column whose *title* looks like a
                        date, and uses the first one holding a value. Offering a
                        selector implied a targeting the engine does not do, and on the
                        usual board — which has a single date column — it was a question
                        with only one possible answer. So say what actually happens instead.
                      */
                      <div className="flex flex-wrap items-center gap-2">
                        {dateCols.length === 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("auto.noDateColumn")}
                          </span>
                        ) : dateCols.length === 1 ? (
                          <span>{t("auto.checksColumn", { column: dateCols[0].title })}</span>
                        ) : (
                          <span>{t("auto.checksEvery")}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => { setIsCreating(false); setSelectedRecipe(null); }}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      {t("auto.cancel")}
                    </button>
                    <button
                      onClick={() => handleCreateRecipe(selectedRecipe)}
                      disabled={blocked}
                      title={duplicateRule ? t("auto.duplicate") : undefined}
                      className="px-4 py-2 text-[13px] font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] dark:bg-[#24396f] dark:hover:bg-[#2d4682] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t("auto.createRule")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Existing rules. Hairline rows rather than cards: a card per rule
              stacked three deep read as three panels competing with the panel
              they sit in. */}
          <div>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={20} />
              </div>
            ) : automations.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[13.5px] text-gray-500 dark:text-slate-400">
                  {t("auto.none")}
                </p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="mt-2 text-[13px] font-semibold text-[#1A2C5B] dark:text-amber-400 hover:underline"
                >
                  {t("auto.createFirst")}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {automations.map((auto) => (
                  <div
                    key={auto.id}
                    className={`flex items-start gap-3 py-3.5 ${auto.enabled === false ? "opacity-55" : ""}`}
                  >
                    {/* Timing as a stripe: amber is checked once a day, green
                        happens the moment something changes. */}
                    <span
                      aria-hidden="true"
                      className={`w-[3px] self-stretch rounded-full shrink-0 ${timingStripe(auto.action_type)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-relaxed text-gray-700 dark:text-slate-200">
                        {renderRuleDescription(auto)}
                      </div>
                      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-gray-400 dark:text-slate-500">
                        {timingLabel(t, auto.action_type, timeZone)}
                        {" · "}
                        {auto.workspace_id ? t("auto.scopeWorkspace") : t("auto.scopeBoard")}
                        {auto.enabled === false && ` · ${t("auto.paused")}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* A scheduled rule is otherwise unverifiable until the next daily run. */}
                      {isScheduled(auto.action_type) && auto.enabled !== false && (
                        <button
                          onClick={() => runNow(auto.id)}
                          disabled={runningId === auto.id}
                          title={t("auto.runNow")}
                          className="px-2 py-1 text-[12px] font-semibold text-gray-500 hover:text-[#1A2C5B] dark:text-slate-400 dark:hover:text-amber-400 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {runningId === auto.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Play size={12} />
                          )}
                          {t("auto.run")}
                        </button>
                      )}
                      <button
                        onClick={() => handleToggle(auto.id, auto.enabled !== false)}
                        role="switch"
                        aria-checked={auto.enabled !== false}
                        title={auto.enabled !== false ? t("auto.switchOff") : t("auto.switchOn")}
                        className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${
                          auto.enabled !== false
                            ? "bg-[#1A2C5B] dark:bg-amber-500"
                            : "bg-gray-300 dark:bg-slate-700"
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
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
