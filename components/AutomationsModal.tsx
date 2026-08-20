"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { X, Zap, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Calendar, Link2, Bell, Clock, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { toast } from "sonner";
import { Board, Column, Group, Automation, Item, STATUS_OPTIONS, Profile } from "@/types";
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

type RecipeType = "move_done" | "sla_alert" | "overdue_tagging" | "timeline_shifting" | null;


// that cannot possibly do anything until the next daily run must say so, or it
// reads as broken.
const SCHEDULED = new Set(['overdue_tagging', 'sla_alert']);
const isScheduled = (actionType: string) => SCHEDULED.has(actionType);

// parts standing out - rather than four differently-coloured descriptions
// that each invented their own emphasis.
const Chip = ({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'green' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 mx-0.5 rounded-md text-[12.5px] font-semibold border align-baseline ${
      tone === 'green'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
    }`}
  >
    {children}
  </span>
);

const TimingBadge = ({ actionType, timeZone }: { actionType: string; timeZone?: string | null }) =>
  isScheduled(actionType) ? (
    <span
      title={`Evaluated once a day by a scheduled job, not the moment something changes. Runs at ${cronTimeInTimezone(timeZone)} ${timeZone || DEFAULT_ORG_TIMEZONE}.`}
      className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/30"
    >
      <Clock size={10} /> Daily {cronTimeInTimezone(timeZone)}
    </span>
  ) : (
    <span
      title="Runs the moment a matching change is made."
      className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30"
    >
      <Zap size={10} /> Instant
    </span>
  );

export default function AutomationsModal({ board, groups, items, boardAutomations, profiles, timeZone, onClose }: AutomationsModalProps) {
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
        toast.error(body?.error || 'Could not run this automation');
        return;
      }
      if (body.triggeredCount > 0) {
        toast.success(body.message);
        queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
      } else {
        toast.info(body.message);
      }
    } catch {
      toast.error('Could not reach the server to run this automation');
    } finally {
      setRunningId(null);
    }
  };
  const canonicalForRecipe = "Done";
  // Auto-Archive is a fixed rule, so the label is resolved rather than chosen.
  // Not simply "Done": the imported French board's done label is "Fait". Matching
  // the engine's own test avoids picking statusLabels[0], which is only the right
  // answer by luck.
  const effectiveTriggerValue =
    statusLabels.find((l) => DONE_STATUS_PATTERN.test(l)) ||
    statusLabels[0] ||
    canonicalForRecipe;

  // The group Auto-Archive files completed work into. Lancement has four groups
  // called "Completed", so the lowest-positioned one wins rather than an arbitrary
  // pick. Groups arrive ordered by position.
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
          toast.error("Could not create the Completed group", {
            description: "The automation was not enabled.",
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
    } else if (recipe === "timeline_shifting") {
      payload = {
        ...workspaceScope,
        trigger_column_id: triggerDateColId || dateCols[0]?.id || "date",
        trigger_value: "date_postponed",
        action_type: "timeline_shifting",
        action_target_id: "dependent_items",
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
    toast.success('Automation added', {
      description: scheduled
        ? `Runs daily at ${cronTimeInTimezone(timeZone)} ${timeZone || DEFAULT_ORG_TIMEZONE}.`
        : 'Runs instantly, every time a matching change is made.',
      duration: scheduled ? 12000 : 5000,
      action: scheduled
        ? { label: 'Run now', onClick: () => runNow(data.id) }
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

  const getColName = (id: string) => board.columns.find((c) => c.id === id)?.title || "Column";
  const getGroupName = (id: string) => groups.find((g) => g.id === id)?.title || "Group";

  // One consistent chip, so a rule reads as a sentence with the changeable

  const renderRuleDescription = (auto: Automation) => {
    if (auto.action_type === 'sla_alert') {
      return (
        <>
          When <Chip>{getColName(auto.trigger_column_id)}</Chip> arrives and the status is not
          <Chip>Working on it</Chip>, notify and email the assignee
        </>
      );
    }
    if (auto.action_type === 'overdue_tagging') {
      return (
        <>
          When <Chip>{getColName(auto.trigger_column_id)}</Chip> has passed and the status is not
          <Chip>Done</Chip>, set the status to <Chip tone="green">Overdue</Chip> and email the assignee
        </>
      );
    }
    if (auto.action_type === 'timeline_shifting') {
      return (
        <>
          When <Chip>{getColName(auto.trigger_column_id)}</Chip> is postponed, shift every dependent
          item by the same number of days
        </>
      );
    }
    return (
      <>
        When <Chip>{getColName(auto.trigger_column_id)}</Chip> changes to
        <Chip>{auto.trigger_value}</Chip>, move the item to
        <Chip tone="green">{getGroupName(auto.action_target_id)}</Chip>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-[#f5f6f8] dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        <div className="flex items-center justify-between p-6 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Zap size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Automation Center</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Put your board workflows, SLAs, and hand-offs on autopilot.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>


        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Create New Automation */}
          {isCreating ? (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-purple-200 dark:border-purple-900/50 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Select Automation Recipe</h3>
                <button
                  onClick={() => { setIsCreating(false); setSelectedRecipe(null); }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>

              {/* Recipe Gallery */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Recipe 1: Done -> Completed */}
                <div
                  onClick={() => setSelectedRecipe("move_done")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedRecipe === "move_done"
                      ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-slate-700 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">
                    <CheckCircle2 size={16} className="text-green-500" />
                    <span>Auto-Archive / Completion</span>
                    <TimingBadge actionType="move_group" timeZone={timeZone} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Status changes to <b>{effectiveTriggerValue}</b>, move item to
                    the <b>{COMPLETED_GROUP_TITLE}</b> group.
                  </p>
                </div>

                {/* Recipe 2: SLA Alert */}
                <div
                  onClick={() => setSelectedRecipe("sla_alert")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedRecipe === "sla_alert"
                      ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-slate-700 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">
                    <Bell size={16} className="text-purple-500" />
                    <span>Due Date Warning (SLA Alert)</span>
                    <TimingBadge actionType="sla_alert" timeZone={timeZone} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Due Date arrives AND Status is NOT Working on it, send notification &amp; Gmail alert.
                  </p>
                </div>

                {/* Recipe 3: Overdue Tagging */}
                <div
                  onClick={() => setSelectedRecipe("overdue_tagging")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedRecipe === "overdue_tagging"
                      ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-slate-700 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span>Automatic Overdue Tagging</span>
                    <TimingBadge actionType="overdue_tagging" timeZone={timeZone} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Due Date passes AND Status is NOT Done, change Status to <b>Overdue</b> &amp; notify.
                  </p>
                </div>

                {/* Recipe 5: Timeline Shifting */}
                <div
                  onClick={() => setSelectedRecipe("timeline_shifting")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedRecipe === "timeline_shifting"
                      ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-slate-700 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">
                    <Link2 size={16} className="text-blue-500" />
                    <span>Timeline &amp; Date Shifting</span>
                    <TimingBadge actionType="timeline_shifting" timeZone={timeZone} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Due Date is postponed by X days, shift all dependent items&apos; dates by X days.
                  </p>
                </div>
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
                                <option key={c.id} value={c.id}>{c.title}</option>
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
                        selector implied a targeting the engine does not do — and on a
                        board like Lancement, which has four columns all named
                        "Timeline", it offered four indistinguishable options that all
                        behaved identically. So say what actually happens instead.
                      */
                      <div className="flex flex-wrap items-center gap-2">
                        {dateCols.length === 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            This board has no date or timeline column, so this rule
                            would have nothing to check.
                          </span>
                        ) : dateCols.length === 1 ? (
                          <span>
                            Checks the{" "}
                            <b className="font-semibold text-gray-800 dark:text-gray-100">
                              {dateCols[0].title}
                            </b>{" "}
                            column.
                          </span>
                        ) : (
                          <span>
                            Checks every date column on this board &mdash; whichever one
                            an item has a date in is the one used.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => { setIsCreating(false); setSelectedRecipe(null); }}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleCreateRecipe(selectedRecipe)}
                      disabled={blocked}
                      title={duplicateRule ? "A rule for this trigger already exists. Delete it first - two rules on the same trigger cannot both run." : undefined}
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600"
                    >
                      Enable This Automation
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center p-4 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all font-medium"
            >
              <Plus size={18} className="mr-2" /> Add New Automation
            </button>
          )}

          {/* Existing Automations List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Active Rules</h3>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-purple-500" /></div>
            ) : automations.length === 0 ? (
              <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 shadow-sm">
                No automations active on this board.
              </div>
            ) : (
              automations.map(auto => (
                <div key={auto.id} className={`flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 transition-shadow hover:shadow-sm ${auto.enabled === false ? "opacity-60 bg-gray-50 dark:bg-slate-900/50" : ""}`}>
                  <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                    <TimingBadge actionType={auto.action_type} timeZone={timeZone} />
                    <span
                      title={
                        auto.workspace_id
                          ? "Applies to every board in this workspace"
                          : "Applies to this board only"
                      }
                      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded text-center ${
                        auto.workspace_id
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"
                      }`}
                    >
                      {auto.workspace_id ? "Workspace" : "This board"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 text-[13.5px] leading-7 text-gray-700 dark:text-gray-200">
                    {renderRuleDescription(auto)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* A scheduled rule is otherwise unverifiable until the next daily run. */}
                    {isScheduled(auto.action_type) && auto.enabled !== false && (
                      <button
                        onClick={() => runNow(auto.id)}
                        disabled={runningId === auto.id}
                        title="Evaluate this rule against the board right now"
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-500/40 dark:text-blue-300 dark:bg-blue-500/15 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {runningId === auto.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Play size={12} />
                        )}
                        Run now
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(auto.id, auto.enabled !== false)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors border ${
                        auto.enabled !== false
                          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800"
                          : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700"
                      }`}
                    >
                      {auto.enabled !== false ? "On" : "Off"}
                    </button>
                    <button 
                      onClick={() => handleDelete(auto.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
