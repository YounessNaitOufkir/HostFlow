"use client";

import React, { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { X, Shield, Users, Lock, ChevronDown, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Profile, Workspace, Board, UserRole } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { reportMutationError } from "@/lib/errorReporting";
import { TruncatedText } from "@/components/ui/TruncatedText";

interface AdminModalProps {
  onClose: () => void;
}

export default function AdminModal({ onClose }: AdminModalProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

  const {
    data: adminData = {
      profiles: [],
      workspaces: [],
      boards: [],
      workspaceMembers: [],
      boardMembers: [],
    },
    isLoading: loading,
  } = useQuery({
    queryKey: queryKeys.adminData(),
    queryFn: async () => {
      const [profilesRes, workspacesRes, boardsRes, wsMembersRes, bMembersRes] = await Promise.all([
        supabase.from("user_directory").select("*").order("full_name"),
        supabase.from("workspaces").select("*").order("name"),
        supabase.from("boards").select("*").order("name"),
        supabase.from("workspace_members").select("user_id, workspace_id"),
        supabase.from("board_members").select("user_id, board_id")
      ]);

      return {
        profiles: (profilesRes.data || []) as Profile[],
        workspaces: (workspacesRes.data || []) as Workspace[],
        boards: (boardsRes.data || []) as Board[],
        workspaceMembers: wsMembersRes.data || [],
        boardMembers: bMembersRes.data || [],
      };
    },
  });

  const { profiles, workspaces, boards, workspaceMembers, boardMembers } = adminData;

  const [savingId, setSavingId] = useState<string | null>(null);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const targetProfile = profiles.find((p) => p.id === profileId);
    if (targetProfile?.email?.toLowerCase() === "younessnaitoufkir@gmail.com" && newRole !== "admin") {
      alert(t("adm.blockDemoteOwner"));
      return;
    }
    if (targetProfile?.role === "admin" && newRole !== "admin") {
      const adminCount = profiles.filter((p) => p.role === "admin").length;
      if (adminCount <= 1) {
        alert(t("adm.blockLastAdmin"));
        return;
      }
      const confirmed = window.confirm(t("adm.confirmSelfDemote"));
      if (!confirmed) return;
    }

    setSavingId(profileId);
    try {
      const { error } = await supabase.rpc('set_user_role', { target_user_id: profileId, new_role: newRole });
      if (error) throw error;
      queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          profiles: old.profiles.map((p: Profile) => p.id === profileId ? { ...p, role: newRole as UserRole } : p)
        };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles() });
    } catch (err) {
      reportMutationError(err, t("adm.errRole"), { table: "profiles", operation: "rpc" });
    }
    setSavingId(null);
  };

  const handleToggleWorkspace = async (profileId: string, workspaceId: string) => {
    setSavingId(`${profileId}-${workspaceId}`);
    const isMember = workspaceMembers.some(m => m.user_id === profileId && m.workspace_id === workspaceId);
    
    try {
      if (isMember) {
        const { error } = await supabase.from("workspace_members")
          .delete()
          .match({ user_id: profileId, workspace_id: workspaceId });
        if (error) throw error;
        queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            workspaceMembers: old.workspaceMembers.filter((m: any) => !(m.user_id === profileId && m.workspace_id === workspaceId))
          };
        });
      } else {
        const { error } = await supabase.from("workspace_members")
          .insert({ user_id: profileId, workspace_id: workspaceId, role: 'member' });
        if (error) throw error;
        queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            workspaceMembers: [...old.workspaceMembers, { user_id: profileId, workspace_id: workspaceId }]
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.adminData() });
    } catch (err) {
      reportMutationError(err, t("adm.errWs"), { table: "workspace_members" });
    }
    
    setSavingId(null);
  };

  const handleToggleBoard = async (profileId: string, boardId: string) => {
    setSavingId(`${profileId}-board-${boardId}`);
    const isMember = boardMembers.some(m => m.user_id === profileId && m.board_id === boardId);
    
    try {
      if (isMember) {
        const { error } = await supabase.from("board_members")
          .delete()
          .match({ user_id: profileId, board_id: boardId });
        if (error) throw error;
        queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            boardMembers: old.boardMembers.filter((m: any) => !(m.user_id === profileId && m.board_id === boardId))
          };
        });
      } else {
        const { error } = await supabase.from("board_members")
          .insert({ user_id: profileId, board_id: boardId, role: 'member' });
        if (error) throw error;
        queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            boardMembers: [...old.boardMembers, { user_id: profileId, board_id: boardId }]
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.adminData() });
    } catch (err) {
      reportMutationError(err, t("adm.errBoard"), { table: "board_members" });
    }
    
    setSavingId(null);
  };

  const toggleWorkspaceAccordion = (workspaceId: string) => {
    setExpandedWorkspaces(prev => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  // Switch to permissions tab and select user
  const handleManagePermissions = (profileId: string) => {
    setSelectedProfileId(profileId);
    setActiveTab("permissions");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-slate-900/40">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                {t("adm.centerTitle")}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t("adm.centerSub")}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-2 border-b border-gray-200/50 dark:border-slate-700/50 gap-6">
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 text-sm font-medium transition-all relative ${
              activeTab === "users" ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <span className="flex items-center gap-2"><Users size={16} /> {t("adm.tabUsers")}</span>
            {activeTab === "users" && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`pb-3 text-sm font-medium transition-all relative ${
              activeTab === "permissions" ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <span className="flex items-center gap-2"><Lock size={16} /> {t("adm.tabPermissions")}</span>
            {activeTab === "permissions" && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-gray-50/50 dark:bg-slate-900/50">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === "users" ? (
                <motion.div 
                  key="users"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="h-full overflow-y-auto p-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {profiles.map((profile) => (
                      <div key={profile.id} className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex items-center gap-4 mb-4">
                          <Avatar
                            name={profile.full_name}
                            initials={profile.avatar_initials}
                            url={profile.avatar_url}
                            color={profile.color}
                            size={48}
                            className="shadow-inner"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-800 dark:text-gray-100 break-words min-w-0">{profile.full_name}</h3>
                              {profile.email?.toLowerCase() === "younessnaitoufkir@gmail.com" && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-300 dark:border-amber-500/30">
                                  {t("adm.owner")}
                                </span>
                              )}
                            </div>
                            <TruncatedText as="p" className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile.email}</TruncatedText>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-4 border-t border-gray-100 dark:border-slate-700/50">
                          <select
                            value={profile.role || "member"}
                            onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                            disabled={profile.email?.toLowerCase() === "younessnaitoufkir@gmail.com"}
                            title={profile.email?.toLowerCase() === "younessnaitoufkir@gmail.com" ? t("adm.ownerRoleFixed") : undefined}
                            className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <option value="admin">{t("adm.roleAdmin")}</option>
                            <option value="manager">{t("adm.roleManager")}</option>
                            <option value="member">{t("adm.roleMember")}</option>
                            <option value="viewer">{t("adm.roleViewer")}</option>
                          </select>

                          <button 
                            onClick={() => handleManagePermissions(profile.id)}
                            className="text-xs font-medium whitespace-nowrap text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            {t("adm.manageAccess")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="permissions"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full flex"
                >
                  {/* Left sidebar: User selection */}
                  <div className="w-1/3 border-r border-gray-200/50 dark:border-slate-700/50 bg-white/30 dark:bg-slate-800/20 overflow-y-auto custom-scrollbar">
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">{t("adm.selectUser")}</h3>
                      <div className="space-y-1">
                        {profiles.map(profile => (
                          <button
                            key={profile.id}
                            onClick={() => setSelectedProfileId(profile.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                              selectedProfileId === profile.id 
                                ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm" 
                                : "hover:bg-gray-100 dark:hover:bg-slate-800/50 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <Avatar
                              name={profile.full_name}
                              initials={profile.avatar_initials}
                              url={profile.avatar_url}
                              color={profile.color}
                              size={24}
                            />
                            <TruncatedText className="text-sm font-medium truncate">{profile.full_name}</TruncatedText>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right pane: Permissions matrix */}
                  <div className="w-2/3 overflow-y-auto custom-scrollbar p-6">
                    {!selectedProfileId ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Lock size={48} className="mb-4 opacity-20" />
                        <p>{t("adm.selectUserHint")}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="mb-6 flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t("adm.wsBoardAccess")}</h3>
                            <p className="text-sm text-gray-500">{t("adm.wsBoardAccessSub")}</p>
                          </div>
                        </div>

                        {workspaces.map(ws => {
                          const isWsMember = workspaceMembers.some(m => m.user_id === selectedProfileId && m.workspace_id === ws.id);
                          const wsBoards = boards.filter(b => b.workspace_id === ws.id);
                          const isExpanded = expandedWorkspaces.has(ws.id);
                          const isSavingWs = savingId === `${selectedProfileId}-${ws.id}`;

                          return (
                            <div key={ws.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-slate-800/80">
                                <button 
                                  onClick={() => toggleWorkspaceAccordion(ws.id)}
                                  className="flex items-center gap-3 flex-1 text-left"
                                >
                                  <div className={`p-1 rounded-md transition-transform ${isExpanded ? "rotate-90 bg-gray-200 dark:bg-slate-700" : "hover:bg-gray-200 dark:hover:bg-slate-700"}`}>
                                    <ChevronRight size={16} className="text-gray-500" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                      {ws.name}
                                      {ws.is_private && <Lock size={12} className="text-gray-400" />}
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      {wsBoards.length === 1
                                        ? t("ws.boardCountOne")
                                        : t("ws.boardCount", { count: wsBoards.length })}
                                    </p>
                                  </div>
                                </button>
                                
                                <div className="flex items-center gap-4">
                                  {isSavingWs && <span className="text-xs text-indigo-500 animate-pulse">{t("adm.saving")}</span>}
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      className="sr-only peer" 
                                      checked={isWsMember}
                                      onChange={() => handleToggleWorkspace(selectedProfileId, ws.id)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                    <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{t("adm.wsAccess")}</span>
                                  </label>
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1">
                                      {isWsMember && (
                                        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-sm text-indigo-800 dark:text-indigo-200 flex items-start gap-2">
                                          <Check size={16} className="mt-0.5 shrink-0" />
                                          <p>{fill(t("adm.wsFullAccess"), { all: <b>{t("adm.allBoards")}</b> })}</p>
                                        </div>
                                      )}
                                      
                                      {wsBoards.length === 0 ? (
                                        <p className="text-sm text-gray-500 italic py-2 px-4">{t("adm.noBoards")}</p>
                                      ) : (
                                        wsBoards.map(board => {
                                          const isBoardMember = boardMembers.some(m => m.user_id === selectedProfileId && m.board_id === board.id);
                                          const isSavingBoard = savingId === `${selectedProfileId}-board-${board.id}`;
                                          
                                          return (
                                            <div key={board.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-8">{board.name}</span>
                                              <div className="flex items-center gap-3">
                                                {isSavingBoard && <span className="text-xs text-indigo-500 animate-pulse">{t("adm.saving")}</span>}
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                  <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={isWsMember || isBoardMember}
                                                    disabled={isWsMember}
                                                    onChange={() => handleToggleBoard(selectedProfileId, board.id)}
                                                  />
                                                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${isWsMember ? 'bg-indigo-300 dark:bg-indigo-800/50 cursor-not-allowed' : 'bg-gray-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 peer-checked:bg-indigo-500'}`}></div>
                                                </label>
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
