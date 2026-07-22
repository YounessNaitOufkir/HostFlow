"use client";

import React, { useState, useEffect } from "react";
import { X, Zap, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Board, Column, Group, Automation, STATUS_OPTIONS } from "@/types";

interface AutomationsModalProps {
  board: Board;
  groups: Group[];
  onClose: () => void;
}

export default function AutomationsModal({ board, groups, onClose }: AutomationsModalProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [triggerColId, setTriggerColId] = useState("");
  const [triggerValue, setTriggerValue] = useState("");
  const [actionTargetId, setActionTargetId] = useState("");

  const statusCols = board.columns.filter((c) => c.type === "status");
  const selectedColDef = board.columns.find((c) => c.id === triggerColId);
  const currentStatusOptions = selectedColDef?.settings?.statusLabels || STATUS_OPTIONS;

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("board_id", board.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAutomations(data);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!triggerColId || !triggerValue || !actionTargetId) return;

    const { data, error } = await supabase
      .from("automations")
      .insert({
        board_id: board.id,
        trigger_column_id: triggerColId,
        trigger_value: triggerValue,
        action_type: "move_group",
        action_target_id: actionTargetId,
      })
      .select()
      .single();

    if (!error && data) {
      setAutomations([data, ...automations]);
      setIsCreating(false);
      setTriggerColId("");
      setTriggerValue("");
      setActionTargetId("");
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);
    if (!error) {
      setAutomations(automations.filter((a) => a.id !== id));
    }
  };

  const getColName = (id: string) => board.columns.find((c) => c.id === id)?.title || "Unknown Column";
  const getGroupName = (id: string) => groups.find((g) => g.id === id)?.title || "Unknown Group";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-[#f5f6f8] dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
        <div className="flex items-center justify-between p-6 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Zap size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Board Automations</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Build rules to put your workflow on autopilot.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Create New Automation */}
          {isCreating ? (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-purple-200 dark:border-purple-900/50 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 uppercase tracking-wider">Create Rule</h3>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <span>When</span>
                <select 
                  className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium outline-none focus:ring-2 focus:ring-purple-500"
                  value={triggerColId}
                  onChange={(e) => setTriggerColId(e.target.value)}
                >
                  <option value="" disabled>Select Column</option>
                  {statusCols.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                
                <span>changes to</span>
                <select 
                  className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium outline-none focus:ring-2 focus:ring-purple-500"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                >
                  <option value="" disabled>Select Status</option>
                  {currentStatusOptions.map((s: any) => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
                
                <span>, then move item to</span>
                <select 
                  className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium outline-none focus:ring-2 focus:ring-purple-500"
                  value={actionTargetId}
                  onChange={(e) => setActionTargetId(e.target.value)}
                >
                  <option value="" disabled>Select Group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreate}
                  disabled={!triggerColId || !triggerValue || !actionTargetId}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                >
                  Create Automation
                </button>
              </div>
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
                <div key={auto.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center text-sm text-gray-700 dark:text-gray-200">
                    <span className="font-semibold text-purple-600 dark:text-purple-400 mr-2">When</span>
                    <span className="px-2 py-1 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{getColName(auto.trigger_column_id)}</span>
                    changes to
                    <span className="px-2 py-1 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{auto.trigger_value}</span>
                    , move to
                    <span className="px-2 py-1 bg-gray-100 dark:bg-slate-900 rounded mx-1 font-medium">{getGroupName(auto.action_target_id)}</span>
                  </div>
                  <button 
                    onClick={() => handleDelete(auto.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
