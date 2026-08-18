"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { X, Zap, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Calendar, Link2, Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Board, Column, Group, Automation, Item, STATUS_OPTIONS, Profile } from "@/types";

interface AutomationsModalProps {
  board: Board;
  groups: Group[];
  items: Item[];
  boardAutomations: Automation[];
  profiles: Profile[];
  onClose: () => void;
}

type RecipeType = "move_done" | "sla_alert" | "overdue_tagging" | "move_cancelled" | "timeline_shifting" | null;

export default function AutomationsModal({ board, groups, items, boardAutomations, profiles, onClose }: AutomationsModalProps) {
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
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("board_id", board.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Automation[];
    },
  });

  // Form state for customizable recipes
  const statusCols = board.columns.filter((c) => c.type === "status");
  const dateCols = board.columns.filter((c) => c.type === "date" || c.type === "timeline");
  
  const [triggerColId, setTriggerColId] = useState(statusCols[0]?.id || "");
  const [triggerDateColId, setTriggerDateColId] = useState(dateCols[0]?.id || "");
  const [actionTargetId, setActionTargetId] = useState(groups[0]?.id || "");

  const selectedColDef = board.columns.find((c) => c.id === triggerColId);
  const currentStatusOptions = selectedColDef?.settings?.statusLabels || STATUS_OPTIONS;

  // Time and behaviour rules apply to the whole workspace; if the board somehow
  // has no workspace, fall back to board scope so a scope is always present.
  const workspaceScope = board.workspace_id
    ? { workspace_id: board.workspace_id }
    : { board_id: board.id };

  const handleCreateRecipe = async (recipe: RecipeType) => {
    let payload: any = null;

    if (recipe === "move_done") {
      payload = {
        board_id: board.id,
        trigger_column_id: triggerColId || statusCols[0]?.id || "status",
        trigger_value: "Done",
        action_type: "move_group",
        action_target_id: actionTargetId || groups[groups.length - 1]?.id || groups[0]?.id,
      };
    } else if (recipe === "move_cancelled") {
      payload = {
        board_id: board.id,
        trigger_column_id: triggerColId || statusCols[0]?.id || "status",
        trigger_value: "Cancelled",
        action_type: "move_group",
        action_target_id: actionTargetId || groups[groups.length - 1]?.id || groups[0]?.id,
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

    if (!error && data) {
      queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) => [data, ...old]);
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
      // Show activation animation then close
      setTimeout(() => {
        setIsActivating(false);
        setIsCreating(false);
        setSelectedRecipe(null);
      }, 1800);
    } else {
      setIsActivating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);
    if (!error) {
      queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) =>
        old.filter((a) => a.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean = true) => {
    const nextState = !currentEnabled;
    const { error } = await supabase.from("automations").update({ enabled: nextState }).eq("id", id);
    if (!error) {
      queryClient.setQueryData<Automation[]>(queryKeys.automations(board.id), (old = []) =>
        old.map((a) => (a.id === id ? { ...a, enabled: nextState } : a))
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(board.id) });
    }
  };

  const getColName = (id: string) => board.columns.find((c) => c.id === id)?.title || "Column";
  const getGroupName = (id: string) => groups.find((g) => g.id === id)?.title || "Group";

  const renderRuleDescription = (auto: Automation) => {
    if (auto.action_type === "sla_alert") {
      return (
        <span className="text-gray-700 dark:text-gray-200">
          When <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 rounded font-medium">{getColName(auto.trigger_column_id)}</span> arrives AND Status is not <b>Working on it</b>, send notification &amp; email Gmail inbox
        </span>
      );
    }
    if (auto.action_type === "overdue_tagging") {
      return (
        <span className="text-gray-700 dark:text-gray-200">
          When <span className="px-2 py-0.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded font-medium">{getColName(auto.trigger_column_id)}</span> passes AND Status is not <b>Done</b>, automatically change Status to <b>Overdue</b> &amp; email Assignee
        </span>
      );
    }
    if (auto.action_type === "timeline_shifting") {
      return (
        <span className="text-gray-700 dark:text-gray-200">
          When <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 rounded font-medium">{getColName(auto.trigger_column_id)}</span> is postponed by X days, automatically shift dependent items by X days
        </span>
      );
    }
    return (
      <span className="text-gray-700 dark:text-gray-200">
        When <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{getColName(auto.trigger_column_id)}</span> changes to <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{auto.trigger_value}</span>, move item to <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{getGroupName(auto.action_target_id)}</span>
      </span>
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

        {/* Activation animation overlay */}
        {isActivating && (
          <div className="absolute inset-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
            <div className="text-5xl animate-bounce">🚀</div>
            <p className="text-lg font-semibold text-purple-600 dark:text-purple-400 animate-pulse">Deploying automation...</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

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
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Status changes to <b>Done</b>, move item to Group Completed.
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
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Due Date passes AND Status is NOT Done, change Status to <b>Overdue</b> &amp; notify.
                  </p>
                </div>

                {/* Recipe 4: Cancelled Cleanup */}
                <div
                  onClick={() => setSelectedRecipe("move_cancelled")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedRecipe === "move_cancelled"
                      ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-slate-700 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">
                    <Trash2 size={16} className="text-gray-500" />
                    <span>Cancelled Item Cleanup</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When Status changes to <b>Cancelled</b>, move item to Closed/Rejected group.
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
                    {selectedRecipe === "move_done" || selectedRecipe === "move_cancelled" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Target Group:</span>
                        <select
                          className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
                          value={actionTargetId}
                          onChange={(e) => setActionTargetId(e.target.value)}
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.title}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Date Column:</span>
                        <select
                          className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
                          value={triggerDateColId}
                          onChange={(e) => setTriggerDateColId(e.target.value)}
                        >
                          {dateCols.map((c) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
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
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm"
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
                <div key={auto.id} className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow ${auto.enabled === false ? "opacity-60 bg-gray-50 dark:bg-slate-900/50" : ""}`}>
                  <div className="flex items-center text-sm min-w-0">
                    <span className="font-semibold text-purple-600 dark:text-purple-400 mr-2 shrink-0">Rule</span>
                    <span
                      title={
                        auto.workspace_id
                          ? "Applies to every board in this workspace"
                          : "Applies to this board only"
                      }
                      className={`mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        auto.workspace_id
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"
                      }`}
                    >
                      {auto.workspace_id ? "Workspace" : "This board"}
                    </span>
                    {renderRuleDescription(auto)}
                  </div>
                  <div className="flex items-center space-x-2 ml-4 shrink-0">
                    <button
                      onClick={() => handleToggle(auto.id, auto.enabled !== false)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors border ${
                        auto.enabled !== false
                          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800"
                          : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700"
                      }`}
                    >
                      {auto.enabled !== false ? "Active" : "Reverted / Off"}
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
