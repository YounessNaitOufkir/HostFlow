"use client";

import React, { useState, useEffect } from "react";
import { X, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Profile, Workspace, Board, UserRole } from "@/types";

interface AdminModalProps {
  onClose: () => void;
}

export default function AdminModal({ onClose }: AdminModalProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [profilesRes, workspacesRes, boardsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("workspaces").select("*").order("name"),
        supabase.from("boards").select("*").order("name"),
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data);
      if (workspacesRes.data) setWorkspaces(workspacesRes.data);
      if (boardsRes.data) setBoards(boardsRes.data);
      
      setLoading(false);
    };

    fetchData();
  }, []);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    setSavingId(profileId);
    try {
      await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
      setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, role: newRole as UserRole } : p));
    } catch (err) {
      console.error("Failed to update role", err);
    }
    setSavingId(null);
  };

  const handlePermissionChange = async (profileId: string, field: "allowed_workspaces" | "allowed_boards", values: string[]) => {
    setSavingId(profileId);
    try {
      await supabase.from("profiles").update({ [field]: values }).eq("id", profileId);
      setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, [field]: values } : p));
    } catch (err) {
      console.error(`Failed to update ${field}`, err);
    }
    setSavingId(null);
  };

  const handleToggleWorkspace = (profile: Profile, workspaceId: string) => {
    const current = profile.allowed_workspaces || [];
    const updated = current.includes(workspaceId)
      ? current.filter(id => id !== workspaceId)
      : [...current, workspaceId];
    handlePermissionChange(profile.id, "allowed_workspaces", updated);
  };

  const handleToggleBoard = (profile: Profile, boardId: string) => {
    const current = profile.allowed_boards || [];
    const updated = current.includes(boardId)
      ? current.filter(id => id !== boardId)
      : [...current, boardId];
    handlePermissionChange(profile.id, "allowed_boards", updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Admin Settings</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage user roles and permissions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {profiles.map((profile) => (
                <div key={profile.id} className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 md:p-5 border border-gray-200 dark:border-slate-700">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0"
                        style={{ backgroundColor: profile.color }}
                      >
                        {profile.avatar_initials}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{profile.full_name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {savingId === profile.id && (
                        <span className="text-xs text-indigo-500 animate-pulse">Saving...</span>
                      )}
                      <select
                        value={profile.role || "member"}
                        onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="contractor">Contractor (Limited)</option>
                      </select>
                    </div>
                  </div>

                  {profile.role === "contractor" && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed Workspaces</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {workspaces.map((ws) => (
                            <label key={ws.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-md cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                checked={(profile.allowed_workspaces || []).includes(ws.id)}
                                onChange={() => handleToggleWorkspace(profile, ws.id)}
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-200">{ws.name}</span>
                            </label>
                          ))}
                          {workspaces.length === 0 && <span className="text-xs text-gray-500">No workspaces available.</span>}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed Boards</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {boards.map((board) => (
                            <label key={board.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-md cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                checked={(profile.allowed_boards || []).includes(board.id)}
                                onChange={() => handleToggleBoard(profile, board.id)}
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-200">
                                {board.name} <span className="text-gray-400 dark:text-gray-500 text-xs">({workspaces.find(w => w.id === board.workspace_id)?.name || 'Unknown Workspace'})</span>
                              </span>
                            </label>
                          ))}
                          {boards.length === 0 && <span className="text-xs text-gray-500">No boards available.</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
