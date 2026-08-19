import React, { useState } from "react";
import { X, Building2, Users, Layout, Webhook, Bell, Type, Check, Lock, Shield, ChevronRight, ChevronDown } from "lucide-react";
import { OrganizationSettings, Team, GlobalStatusLabel, Profile, Workspace, Board, UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import { reportMutationError, reportSuccess } from "@/lib/errorReporting";
import { useFont } from "@/components/FontProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { motion, AnimatePresence } from "framer-motion";
import { TruncatedText } from "@/components/ui/TruncatedText";

interface AdminSettingsModalProps {
  onClose: () => void;
  organizationSettings: OrganizationSettings | null;
  teams: Team[];
  globalStatusLabels: GlobalStatusLabel[];
  profiles: Profile[];
  onGlobalSettingsChanged: () => void;
}

export default function AdminSettingsModal({
  onClose,
  organizationSettings,
  teams,
  globalStatusLabels,
  profiles: propProfiles,
  onGlobalSettingsChanged,
}: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"organization" | "users" | "permissions" | "board" | "integrations">("organization");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  
  // Integrations state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isManagingWebhooks, setIsManagingWebhooks] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState("");

  const handleManageWebhooks = async () => {
    setIsManagingWebhooks(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('webhooks').select('endpoint_url').is('board_id', null).limit(1);
    if (data && data.length > 0) setWebhookUrl(data[0].endpoint_url);
  };

  const saveWebhook = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: existing, error: selectError } = await supabase.from('webhooks').select('id').is('board_id', null).limit(1);
      
      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError;
      }

      if (existing && existing.length > 0) {
        const { error } = await supabase.from('webhooks').update({ endpoint_url: webhookUrl }).eq('id', existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('webhooks').insert({ endpoint_url: webhookUrl, events: ['*'] });
        if (error) throw error;
      }
      setIsManagingWebhooks(false);
      reportSuccess("Webhook saved successfully!");
    } catch (e: any) {
      reportMutationError(e, "Failed to save webhook");
    }
    setLoading(false);
  };

  const handleGenerateApiKey = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const key = "hf_" + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
      
      await supabase.from('api_keys').insert({ user_id: user.id, key_hash: key, name: 'Generated Key' });
      setGeneratedApiKey(key);
      reportSuccess("API Key generated successfully!");
    } catch (e) {
      reportMutationError(e, "Failed to generate API Key");
    }
    setLoading(false);
  };

  const {
    data: adminData = {
      profiles: [],
      workspaces: [],
      boards: [],
      workspaceMembers: [],
      boardMembers: [],
    },
    isLoading: adminLoading,
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

  // Team members see every shared workspace without being invited; externals see
  // only what they create and what they are explicitly given.
  const handleStaffChange = async (profileId: string, staff: boolean) => {
    const targetProfile = profiles.find((p) => p.id === profileId);
    // Administrator implies staff — the DB enforces this too
    // (profiles_admin_implies_staff). Catch it here for a readable message.
    if (!staff && targetProfile?.role === "admin") {
      alert(
        "Action Blocked: An Administrator cannot be marked External. Change their role to Member first."
      );
      return;
    }

    setSavingId(profileId);
    try {
      const { error } = await supabase.rpc("set_user_staff", {
        target_user_id: profileId,
        staff,
      });
      if (error) throw error;
      queryClient.setQueryData(queryKeys.adminData(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          profiles: old.profiles.map((p: Profile) =>
            p.id === profileId ? { ...p, is_staff: staff } : p
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles() });
    } catch (err) {
      reportMutationError(err, "Failed to change team membership. Are you a global admin?", {
        table: "profiles",
        operation: "rpc",
      });
    }
    setSavingId(null);
  };

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const targetProfile = profiles.find((p) => p.id === profileId);
    // is_owner, not the email: this list comes from user_directory, which has no
    // email column, so an email comparison here is always false.
    if (targetProfile?.is_owner && newRole !== "admin") {
      alert("Action Blocked: The platform owner can never be demoted from Administrator.");
      return;
    }
    // An External must never reach Host'lik work, and Administrator would do
    // exactly that. Mirrors profiles_admin_implies_staff.
    if (newRole === "admin" && !targetProfile?.is_staff) {
      alert(
        "Action Blocked: An External account cannot be an Administrator. Make them a Team member first."
      );
      return;
    }
    if (targetProfile?.role === "admin" && newRole !== "admin") {
      const adminCount = profiles.filter((p) => p.role === "admin").length;
      if (adminCount <= 1) {
        alert("Action Blocked: You cannot remove Administrator privileges from the only remaining Administrator on this account.");
        return;
      }
      const confirmed = window.confirm(
        "Warning: You are removing Administrator privileges from an administrator. If you change your own role, you will immediately lose access to Admin Settings and private workspaces. Are you sure you want to proceed?"
      );
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
      reportMutationError(err, "Failed to update role. Are you a global admin?", { table: "profiles", operation: "rpc" });
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
      reportMutationError(err, "Failed to change workspace access", { table: "workspace_members" });
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
      reportMutationError(err, "Failed to change board access", { table: "board_members" });
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

  const handleManagePermissions = (profileId: string) => {
    setSelectedProfileId(profileId);
    setActiveTab("permissions");
  };

  // Form State
  const [companyName, setCompanyName] = useState(organizationSettings?.company_name || "");
  const [primaryColor, setPrimaryColor] = useState(organizationSettings?.primary_color || "#0073ea");
  const [defaultTimezone, setDefaultTimezone] = useState(organizationSettings?.default_timezone || "UTC");

  const saveOrganizationSettings = async () => {
    setLoading(true);
    try {
      if (organizationSettings) {
        await supabase.from("organization_settings").update({
          company_name: companyName,
          primary_color: primaryColor,
          default_timezone: defaultTimezone,
        }).eq("id", organizationSettings.id);
      } else {
        await supabase.from("organization_settings").insert({
          company_name: companyName,
          primary_color: primaryColor,
          default_timezone: defaultTimezone,
        });
      }
      onGlobalSettingsChanged();
      reportSuccess("Settings saved successfully");
    } catch (err) {
      reportMutationError(err, "Failed to save settings", { table: "organization_settings" });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "users", label: "User Roles", icon: Users },
    { id: "permissions", label: "Data Access", icon: Lock },
    { id: "board", label: "Board Defaults", icon: Layout },
    { id: "integrations", label: "Integrations", icon: Webhook },
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] flex bg-white dark:bg-slate-900 animate-in fade-in duration-200">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex flex-col h-full">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 md:hidden">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-4 right-4 hidden md:block">
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {activeTab === "organization" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Organization Settings</h3>
                  <p className="text-gray-500 mt-1">Manage your company's global profile and branding.</p>
                </div>
                
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-20 rounded cursor-pointer border-0 p-0"
                      />
                      <span className="text-sm text-gray-500 font-mono">{primaryColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Timezone</label>
                    <select 
                      value={defaultTimezone}
                      onChange={(e) => setDefaultTimezone(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Central European Time (CET)</option>
                    </select>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                    <button 
                      onClick={saveOrganizationSettings}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="h-full animate-in fade-in slide-in-from-bottom-4 flex flex-col">
                <div className="mb-6 shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">User Roles</h3>
                  <p className="text-gray-500 mt-1">Manage platform members and assign administrative privileges.</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {profiles.map((profile) => (
                      <div key={profile.id} className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex items-center gap-4 mb-4">
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-inner"
                            style={{ backgroundColor: profile.color }}
                          >
                            {profile.avatar_initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <TruncatedText as="h3" className="font-semibold text-gray-800 dark:text-gray-100 truncate">{profile.full_name}</TruncatedText>
                              {profile.is_owner && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-300 dark:border-amber-500/30">
                                  Owner
                                </span>
                              )}
                            </div>
                            {/* Email is deliberately not available here: this list
                                comes from user_directory, which never exposes it. */}
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {profile.is_staff
                                ? "Team member"
                                : "External — sees only what they are given"}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-700/50">
                          <div className="flex items-center gap-2">
                            <select
                              value={profile.role || "member"}
                              onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                              disabled={!!profile.is_owner}
                              title={profile.is_owner ? "Platform Owner role cannot be changed" : undefined}
                              className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="admin">Administrator</option>
                              <option value="member">Member</option>
                            </select>

                            <button
                              onClick={() => handleStaffChange(profile.id, !profile.is_staff)}
                              disabled={!!profile.is_owner || savingId === profile.id}
                              title={
                                profile.is_owner
                                  ? "The platform owner is always a team member"
                                  : "Team members see every shared workspace without being invited"
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                profile.is_staff
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
                                  : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-900 dark:text-gray-400 dark:border-slate-700"
                              }`}
                            >
                              {profile.is_staff ? "Team" : "External"}
                            </button>
                          </div>

                          <button 
                            onClick={() => handleManagePermissions(profile.id)}
                            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Manage Access &rarr;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "permissions" && (
              <div className="h-full animate-in fade-in slide-in-from-bottom-4 flex flex-col">
                <div className="mb-6 shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Data Access & Permissions</h3>
                  <p className="text-gray-500 mt-1">Control which workspaces and boards users can access.</p>
                </div>
                <div className="flex-1 overflow-hidden bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl flex shadow-sm">
                  {/* Left sidebar: User selection */}
                  <div className="w-1/3 border-r border-gray-200/50 dark:border-slate-700/50 bg-white/30 dark:bg-slate-800/20 overflow-y-auto custom-scrollbar">
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Select User</h3>
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
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0" style={{ backgroundColor: profile.color }}>
                              {profile.avatar_initials}
                            </div>
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
                        <p>Select a user to manage their data access</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="mb-6 flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Workspace & Board Access</h3>
                            <p className="text-sm text-gray-500">Toggle access for the whole workspace, or expand to grant granular board access.</p>
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
                                    <p className="text-xs text-gray-500">{wsBoards.length} boards</p>
                                  </div>
                                </button>
                                
                                <div className="flex items-center gap-4">
                                  {isSavingWs && <span className="text-xs text-indigo-500 animate-pulse">Saving...</span>}
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      className="sr-only peer" 
                                      checked={isWsMember}
                                      onChange={() => handleToggleWorkspace(selectedProfileId, ws.id)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                    <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">Workspace Access</span>
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
                                          <p>This user has full access to <b>all boards</b> in this workspace. Individual board toggles are overridden.</p>
                                        </div>
                                      )}
                                      
                                      {wsBoards.length === 0 ? (
                                        <p className="text-sm text-gray-500 italic py-2 px-4">No boards in this workspace.</p>
                                      ) : (
                                        wsBoards.map(board => {
                                          const isBoardMember = boardMembers.some(m => m.user_id === selectedProfileId && m.board_id === board.id);
                                          const isSavingBoard = savingId === `${selectedProfileId}-board-${board.id}`;
                                          
                                          return (
                                            <div key={board.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-8">{board.name}</span>
                                              <div className="flex items-center gap-3">
                                                {isSavingBoard && <span className="text-xs text-indigo-500 animate-pulse">Saving...</span>}
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
                </div>
              </div>
            )}

            {activeTab === "board" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Board Defaults</h3>
                  <p className="text-gray-500 mt-1">Configure global standard labels across all workspaces.</p>
                </div>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Global Status Labels</h4>
                  <div className="space-y-3">
                    {globalStatusLabels.length > 0 ? globalStatusLabels.map(label => (
                      <div key={label.id} className="flex items-center gap-4">
                        <div className={`w-32 py-1 text-center text-white text-xs font-medium rounded ${label.color}`}>
                          {label.label}
                        </div>
                        <span className="text-sm text-gray-500">Available globally</span>
                      </div>
                    )) : (
                      <p className="text-sm text-gray-500">No global labels defined yet. Standard default labels will be used.</p>
                    )}
                  </div>
                  <button className="mt-6 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    + Add Global Label
                  </button>
                </div>
              </div>
            )}

            {activeTab === "integrations" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Integrations & API</h3>
                  <p className="text-gray-500 mt-1">Connect HostFlow with external tools via Webhooks and API keys.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 text-center flex flex-col items-center">
                    <Webhook className="w-10 h-10 text-blue-500 mb-4" />
                    <h4 className="text-md font-bold text-gray-900 dark:text-white">Webhooks</h4>
                    <p className="text-sm text-gray-500 mt-2 mb-6">Send real-time updates to external systems when tasks change.</p>
                    
                    {isManagingWebhooks ? (
                      <div className="w-full mt-auto text-left space-y-3">
                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Target URL</label>
                        <input 
                          type="url" 
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          placeholder="https://your-server.com/webhook"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white"
                        />
                        <div className="flex gap-2">
                          <button onClick={saveWebhook} disabled={loading} className="flex-1 px-3 py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 transition-colors">
                            Save
                          </button>
                          <button onClick={() => setIsManagingWebhooks(false)} className="flex-1 px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={handleManageWebhooks} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium rounded-lg text-sm mt-auto w-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                        Manage Webhooks
                      </button>
                    )}
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 text-center flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-mono font-bold mb-4">
                      {`</>`}
                    </div>
                    <h4 className="text-md font-bold text-gray-900 dark:text-white">Developer API</h4>
                    <p className="text-sm text-gray-500 mt-2 mb-6">Generate API keys to programmatically manage boards and items.</p>
                    
                    {generatedApiKey ? (
                      <div className="w-full mt-auto text-left">
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2">New API Key (Copy now!)</p>
                        <div className="px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg font-mono text-xs break-all text-gray-900 dark:text-white mb-3">
                          {generatedApiKey}
                        </div>
                        <button onClick={() => setGeneratedApiKey("")} className="px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg text-sm w-full hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
                          Close
                        </button>
                      </div>
                    ) : (
                      <button onClick={handleGenerateApiKey} disabled={loading} className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium rounded-lg text-sm mt-auto w-full hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">
                        Generate API Key
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}



          </div>
        </div>
      </div>
    </div>
  );
}

