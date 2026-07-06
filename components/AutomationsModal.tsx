"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Zap, Plus, Trash2, Loader2, ToggleLeft, ToggleRight, ChevronRight, ArrowRight, Bell, MoveRight, UserPlus, Calendar, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Board, Column, Group, Automation, STATUS_OPTIONS, AutomationTriggerType, AutomationActionType } from "@/types";
import { createAutomationBuilder, AUTOMATION_TEMPLATES, getAutomationEngine } from "@/lib/automation-engine";

interface AutomationsModalProps {
  board: Board;
  groups: Group[];
  onClose: () => void;
}

const TRIGGER_TYPES: Array<{ type: AutomationTriggerType; label: string; icon: React.ReactNode; description: string }> = [
  { type: "status_changed", label: "Status changes", icon: <Zap size={16} />, description: "When a status column value changes" },
  { type: "date_reached", label: "Date arrives", icon: <Calendar size={16} />, description: "When a date column reaches its value" },
  { type: "assignee_added", label: "Assignee added", icon: <UserPlus size={16} />, description: "When someone is assigned" },
  { type: "item_created", label: "Item created", icon: <Plus size={16} />, description: "When a new item is created" },
  { type: "column_updated", label: "Column updated", icon: <ChevronRight size={16} />, description: "When any column changes" },
];

const ACTION_TYPES: Array<{ type: AutomationActionType; label: string; icon: React.ReactNode }> = [
  { type: "move_to_group", label: "Move to group", icon: <MoveRight size={16} /> },
  { type: "change_status", label: "Change status", icon: <Zap size={16} /> },
  { type: "send_notification", label: "Send notification", icon: <Bell size={16} /> },
  { type: "assign_user", label: "Assign user", icon: <UserPlus size={16} /> },
  { type: "set_date", label: "Set date", icon: <Calendar size={16} /> },
  { type: "send_email", label: "Send email", icon: <Mail size={16} /> },
];

const QUICK_AUTOMATIONS = [
  { label: "When status becomes Done → Move to Done group", template: "whenDoneMoveToGroup" },
  { label: "When status becomes Stuck → Send notification", template: "whenStuckNotify" },
  { label: "When item created → Assign to team member", template: "whenCreatedAssignTo" },
];

export default function AutomationsModal({ board, groups, onClose }: AutomationsModalProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Enhanced form state
  const [selectedTrigger, setSelectedTrigger] = useState<AutomationTriggerType | null>(null);
  const [triggerColumnId, setTriggerColumnId] = useState("");
  const [triggerValue, setTriggerValue] = useState("");
  const [selectedAction, setSelectedAction] = useState<AutomationActionType | null>(null);
  const [actionTargetId, setActionTargetId] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [automationName, setAutomationName] = useState("");

  const statusCols = board.columns.filter((c) => c.type === "status");
  const dateCols = board.columns.filter((c) => c.type === "date" || c.type === "timeline");
  const allCols = board.columns;

  useEffect(() => {
    fetchAutomations();
  }, [board.id]);

  const fetchAutomations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("board_id", board.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      // Convert legacy format to new format if needed
      const normalizedAutomations = data.map((auto: any) => {
        if (auto.trigger_type && !auto.trigger) {
          // Legacy format - convert to new
          return {
            id: auto.id,
            board_id: auto.board_id,
            enabled: true,
            trigger: {
              type: auto.trigger_type as AutomationTriggerType,
              column_id: auto.trigger_column_id,
              value: auto.trigger_value,
            },
            actions: [{
              type: auto.action_type as AutomationActionType,
              target_id: auto.action_target_id,
            }],
            created_at: auto.created_at,
          };
        }
        return auto;
      });
      setAutomations(normalizedAutomations);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!selectedTrigger || !triggerColumnId || !selectedAction || !actionTargetId) return;

    try {
      const builder = createAutomationBuilder(board.id, selectedTrigger)
        .when(triggerColumnId, triggerValue)
        .then(selectedAction, { target_id: actionTargetId, value: actionValue });

      const newAutomation = builder.build();
      if (automationName) {
        (newAutomation as any).name = automationName;
      }

      const { data, error } = await supabase
        .from("automations")
        .insert(newAutomation)
        .select()
        .single();

      if (!error && data) {
        setAutomations([data, ...automations]);
        resetForm();
        setIsCreating(false);
      }
    } catch (err) {
      console.error("Failed to create automation:", err);
    }
  };

  const handleQuickAdd = async (templateKey: string) => {
    if (groups.length === 0) return;

    try {
      let automation;
      switch (templateKey) {
        case "whenDoneMoveToGroup":
          automation = AUTOMATION_TEMPLATES.whenDoneMoveToGroup(board.id, groups[0].id);
          break;
        case "whenStuckNotify":
          automation = AUTOMATION_TEMPLATES.whenStuckNotify(board.id, "Item is stuck!");
          break;
        case "whenCreatedAssignTo":
          automation = AUTOMATION_TEMPLATES.whenCreatedAssignTo(board.id, "");
          break;
        default:
          return;
      }

      const { data, error } = await supabase
        .from("automations")
        .insert(automation)
        .select()
        .single();

      if (!error && data) {
        setAutomations([data, ...automations]);
      }
    } catch (err) {
      console.error("Failed to create quick automation:", err);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    const { error } = await supabase
      .from("automations")
      .update({ enabled: !currentEnabled })
      .eq("id", id);

    if (!error) {
      setAutomations(automations.map(a => a.id === id ? { ...a, enabled: !currentEnabled } : a));
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);
    if (!error) {
      setAutomations(automations.filter((a) => a.id !== id));
    }
  };

  const resetForm = () => {
    setSelectedTrigger(null);
    setTriggerColumnId("");
    setTriggerValue("");
    setSelectedAction(null);
    setActionTargetId("");
    setActionValue("");
    setAutomationName("");
  };

  const getColName = (id: string) => board.columns.find((c) => c.id === id)?.title || "Unknown Column";
  const getGroupName = (id: string) => groups.find((g) => g.id === id)?.title || "Unknown Group";

  const renderAutomationSummary = (auto: Automation) => {
    const trigger = auto.trigger;
    const action = auto.actions[0];

    return (
      <div className="flex-1 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 flex-wrap">
        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded font-medium text-xs uppercase">
          {trigger.type.replace("_", " ")}
        </span>
        <ArrowRight size={14} className="text-gray-400" />
        <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-900 rounded font-medium">
          {getColName(trigger.column_id)}
        </span>
        {trigger.value && (
          <>
            <span className="text-gray-500">→</span>
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded font-medium">
              {trigger.value}
            </span>
          </>
        )}
        <ArrowRight size={14} className="text-gray-400" />
        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded font-medium text-xs uppercase">
          {action.type.replace("_", " ")}
        </span>
        {action.target_id && (
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-900 rounded font-medium">
            {action.type === "move_to_group" ? getGroupName(action.target_id) : action.target_id}
          </span>
        )}
      </div>
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
      <div className="relative bg-gradient-to-br from-white to-gray-50 dark:from-slate-900 dark:to-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-6 bg-white/80 dark:bg-slate-800/80 border-b border-gray-100 dark:border-slate-700 shrink-0 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Zap size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Board Automations</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Build rules to put your workflow on autopilot</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Quick Add Section */}
          {!isCreating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quick Add</h3>
                <button
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                >
                  {showQuickAdd ? "Hide" : "Show"} templates
                </button>
              </div>
              
              {showQuickAdd && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {QUICK_AUTOMATIONS.map((qa, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAdd(qa.template)}
                      className="text-left p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center shrink-0">
                          <Zap size={14} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {qa.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create New Automation */}
          {isCreating ? (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-lg shadow-purple-500/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Create Automation</h3>
                <button
                  onClick={() => { resetForm(); setIsCreating(false); }}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>

              {/* Automation Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Automation Name (optional)
                </label>
                <input
                  type="text"
                  value={automationName}
                  onChange={(e) => setAutomationName(e.target.value)}
                  placeholder="e.g., Move Done items to Archive"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Trigger Configuration */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center font-bold">1</span>
                    When this happens...
                  </span>
                </label>
                
                {/* Trigger Type Selection */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {TRIGGER_TYPES.map((trigger) => (
                    <button
                      key={trigger.type}
                      onClick={() => setSelectedTrigger(trigger.type)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedTrigger === trigger.type
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-md"
                          : "border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={selectedTrigger === trigger.type ? "text-purple-600 dark:text-purple-400" : "text-gray-500"}>
                          {trigger.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {trigger.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Column Selection for Trigger */}
                {selectedTrigger && (
                  <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl">
                    <select
                      className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                      value={triggerColumnId}
                      onChange={(e) => setTriggerColumnId(e.target.value)}
                    >
                      <option value="">Select Column</option>
                      {allCols.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    
                    {(selectedTrigger === "status_changed") && (
                      <select
                        className="flex-1 min-w-[150px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                        value={triggerValue}
                        onChange={(e) => setTriggerValue(e.target.value)}
                      >
                        <option value="">Any value</option>
                        {STATUS_OPTIONS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Action Configuration */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-bold">2</span>
                    Do this action...
                  </span>
                </label>
                
                {/* Action Type Selection */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {ACTION_TYPES.map((action) => (
                    <button
                      key={action.type}
                      onClick={() => setSelectedAction(action.type)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedAction === action.type
                          ? "border-green-500 bg-green-50 dark:bg-green-900/30 shadow-md"
                          : "border-gray-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={selectedAction === action.type ? "text-green-600 dark:text-green-400" : "text-gray-500"}>
                          {action.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {action.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Action Target Selection */}
                {selectedAction && (
                  <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl">
                    {selectedAction === "move_to_group" && (
                      <select
                        className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                        value={actionTargetId}
                        onChange={(e) => setActionTargetId(e.target.value)}
                      >
                        <option value="">Select Group</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                      </select>
                    )}
                    
                    {selectedAction === "change_status" && (
                      <>
                        <select
                          className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                          value={actionTargetId}
                          onChange={(e) => setActionTargetId(e.target.value)}
                        >
                          <option value="">Select Column</option>
                          {statusCols.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <select
                          className="flex-1 min-w-[150px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                          value={actionValue}
                          onChange={(e) => setActionValue(e.target.value)}
                        >
                          <option value="">Select Status</option>
                          {STATUS_OPTIONS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                        </select>
                      </>
                    )}
                    
                    {selectedAction === "send_notification" && (
                      <input
                        type="text"
                        className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="Notification message..."
                        value={actionValue}
                        onChange={(e) => setActionValue(e.target.value)}
                      />
                    )}

                    {selectedAction === "set_date" && (
                      <>
                        <select
                          className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                          value={actionTargetId}
                          onChange={(e) => setActionTargetId(e.target.value)}
                        >
                          <option value="">Select Date Column</option>
                          {dateCols.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <select
                          className="flex-1 min-w-[150px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                          value={actionValue}
                          onChange={(e) => setActionValue(e.target.value)}
                        >
                          <option value="today">Today</option>
                          <option value="tomorrow">Tomorrow</option>
                          <option value="next_week">Next Week</option>
                        </select>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Create Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleCreate}
                  disabled={!selectedTrigger || !triggerColumnId || !selectedAction || !actionTargetId}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                >
                  Create Automation
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center p-4 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all font-medium"
            >
              <Plus size={18} className="mr-2" /> Create New Automation
            </button>
          )}

          {/* Existing Automations List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Active Rules ({automations.length})
            </h3>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-purple-500 w-6 h-6" />
              </div>
            ) : automations.length === 0 ? (
              <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <Zap size={20} className="text-gray-400" />
                </div>
                <p className="font-medium">No automations yet</p>
                <p className="text-sm mt-1">Create your first automation to automate your workflow</p>
              </div>
            ) : (
              automations.map((auto) => (
                <div
                  key={auto.id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group"
                >
                  {renderAutomationSummary(auto)}
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggle(auto.id, auto.enabled)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title={auto.enabled ? "Disable" : "Enable"}
                    >
                      {auto.enabled ? (
                        <ToggleRight size={24} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={24} className="text-gray-300" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(auto.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
