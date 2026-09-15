import React, { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { X, Building2, Users, Bell, Type, Check, Lock, Shield, ChevronRight, ChevronDown } from "lucide-react";
import { OrganizationSettings, Team, Profile, Workspace, Board, UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import { reportMutationError, reportSuccess } from "@/lib/errorReporting";
import { useFont } from "@/components/FontProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { motion, AnimatePresence } from "framer-motion";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { DEFAULT_ORG_TIMEZONE, cronTimeInTimezone } from "@/lib/orgTime";
import { ORG_TIMEZONES } from "@/lib/orgTimezones";

interface AdminSettingsModalProps {
  onClose: () => void;
  organizationSettings: OrganizationSettings | null;
  teams: Team[];
  profiles: Profile[];
  onGlobalSettingsChanged: () => void;
  /** Deep-link, e.g. from clicking a "so-and-so needs access" notification. */
  initialTab?: "organization" | "users" | "permissions";
  initialProfileId?: string | null;
}

export default function AdminSettingsModal({
  onClose,
  organizationSettings,
  teams,
  profiles: propProfiles,
  onGlobalSettingsChanged,
  initialTab,
  initialProfileId,
}: AdminSettingsModalProps) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"organization" | "users" | "permissions">(initialTab ?? "organization");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(initialProfileId ?? null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  
  // Integrations state

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

  // This panel only governs company workspaces. A private workspace is reachable
  // solely through its own creator's members dialog — can_manage_workspace() is
  // false for anybody else — so listing one here would render a toggle that cannot
  // possibly work: the INSERT is rejected and the DELETE removes zero rows.
  const companyWorkspaces = workspaces.filter((w) => !w.is_private);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) || null;

  // Three tiers, three different panels. Admins reach every company workspace and
  // board by role, so there is nothing to grant them; externals are held out of
  // company content entirely by the staff ceiling in can_access_workspace_as();
  // only Team members have anything configurable here.
  const selectedTier: "admin" | "member" | "external" | null = !selectedProfile
    ? null
    : selectedProfile.role === "admin"
      ? "admin"
      : selectedProfile.is_staff
        ? "member"
        : "external";

  // The Team badge is a ceiling, not a grant: it is required to reach company
  // content but no longer confers it. Administrators reach everything by role;
  // Team members get only the workspaces and boards granted below; externals get
  // no company content at all. See 20260820000000_staff_grants_not_blanket.sql.
  const handleStaffChange = async (profileId: string, staff: boolean) => {
    const targetProfile = profiles.find((p) => p.id === profileId);
    // Administrator implies staff — the DB enforces this too
    // (profiles_admin_implies_staff). Catch it here for a readable message.
    if (!staff && targetProfile?.role === "admin") {
      alert(
        t("adm.blockAdminExternal")
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
      reportMutationError(err, t("adm.errTeam"), {
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
      alert(t("adm.blockDemoteOwner"));
      return;
    }
    // An External must never reach Host'lik work, and Administrator would do
    // exactly that. Mirrors profiles_admin_implies_staff.
    if (newRole === "admin" && !targetProfile?.is_staff) {
      alert(
        t("adm.blockExternalAdmin")
      );
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
        // .select("id") is not cosmetic. An RLS-blocked DELETE comes back with no
        // error and zero rows, so "no error" would mean the optimistic update
        // below strips the row from the UI while the grant survives in the
        // database — the user is told access was revoked when it was not.
        const { data, error } = await supabase.from("workspace_members")
          .delete()
          .match({ user_id: profileId, workspace_id: workspaceId })
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            t("adm.errWsRevoke")
          );
        }
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
        // Same trap as the workspace toggle: a blocked DELETE is silent.
        const { data, error } = await supabase.from("board_members")
          .delete()
          .match({ user_id: profileId, board_id: boardId })
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            t("adm.errBoardRevoke")
          );
        }
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

  const handleManagePermissions = (profileId: string) => {
    setSelectedProfileId(profileId);
    setActiveTab("permissions");
  };

  // Form State
  const [companyName, setCompanyName] = useState(organizationSettings?.company_name || "");
  const [defaultTimezone, setDefaultTimezone] = useState(
    organizationSettings?.default_timezone || DEFAULT_ORG_TIMEZONE
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(organizationSettings?.logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Save only when something actually changed, so the button cannot report a
  // successful write that never had anything to write.
  const organizationDirty =
    companyName !== (organizationSettings?.company_name ?? "") ||
    defaultTimezone !== (organizationSettings?.default_timezone ?? DEFAULT_ORG_TIMEZONE);

  const saveOrganizationSettings = async () => {
    if (!organizationDirty) return;
    setLoading(true);
    try {
      // supabase-js resolves with { error } and never throws, so the previous
      // version of this function — which awaited the call bare and then reported
      // success unconditionally — told the user "Settings saved successfully"
      // whether or not anything was written. Both branches now read the result,
      // and the update additionally checks that a row came back: an RLS-blocked
      // UPDATE returns no error and zero rows.
      if (organizationSettings) {
        const { data, error } = await supabase
          .from("organization_settings")
          .update({
            company_name: companyName,
            default_timezone: defaultTimezone,
          })
          .eq("id", organizationSettings.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            t("adm.errOrgSave")
          );
        }
      } else {
        const { error } = await supabase.from("organization_settings").insert({
          company_name: companyName,
          default_timezone: defaultTimezone,
        });
        if (error) throw error;
      }
      onGlobalSettingsChanged();
      reportSuccess(t("adm.okOrgSave"));
    } catch (err) {
      reportMutationError(err, t("adm.errSettings"), { table: "organization_settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      // Fixed path per extension, upserted, so re-uploading replaces the mark
      // rather than accumulating orphans in the bucket.
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const filePath = `company-logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("branding").getPublicUrl(filePath);
      // Cache-bust: the path is stable, so browsers would keep showing the old mark.
      const versioned = `${publicUrl}?v=${Date.now()}`;

      const { data, error } = await supabase
        .from("organization_settings")
        .update({ logo_url: versioned })
        .eq("id", organizationSettings?.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(t("adm.errLogoSave"));
      }

      setLogoUrl(versioned);
      onGlobalSettingsChanged();
      reportSuccess(t("adm.okLogo"));
    } catch (err) {
      reportMutationError(err, t("adm.errLogo"), { table: "organization_settings" });
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleLogoRemove = async () => {
    setUploadingLogo(true);
    try {
      const { data, error } = await supabase
        .from("organization_settings")
        .update({ logo_url: null })
        .eq("id", organizationSettings?.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(t("adm.errLogoRemove"));
      }
      setLogoUrl(null);
      onGlobalSettingsChanged();
      reportSuccess(t("adm.okLogoRemoved"));
    } catch (err) {
      reportMutationError(err, t("adm.errLogoRemoveFail"), { table: "organization_settings" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const tabs = [
    { id: "organization", label: t("adm.tabOrganization"), icon: Building2 },
    { id: "users", label: t("adm.tabUsers"), icon: Users },
    { id: "permissions", label: t("adm.tabPermissions"), icon: Lock },
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] flex bg-white dark:bg-slate-900 panel-overlay-fade">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex flex-col h-full">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("adm.settings")}</h2>
          <button onClick={onClose} aria-label={t("adm.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 md:hidden">
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
          <button onClick={onClose} aria-label={t("adm.close")} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {activeTab === "organization" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adm.orgTitle")}</h3>
                  <p className="text-gray-500 mt-1">
                    {t("adm.orgSub")}
                  </p>
                </div>

                {/* -- Identity ------------------------------------------ */}
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-700 flex items-baseline gap-3">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t("adm.identity")}</h4>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <label htmlFor="org-company-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("adm.companyName")}
                      </label>
                      <input
                        id="org-company-name"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        {t("adm.companyNameHint")}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("adm.companyLogo")}
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt={t("adm.companyLogo")} className="w-full h-full object-contain p-1.5" />
                          ) : (
                            <Building2 size={22} className="text-gray-300 dark:text-slate-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                            {uploadingLogo ? t("adm.uploading") : logoUrl ? t("adm.replace") : t("adm.upload")}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              className="hidden"
                              disabled={uploadingLogo}
                              onChange={handleLogoUpload}
                            />
                          </label>
                          {logoUrl && (
                            <button
                              type="button"
                              onClick={handleLogoRemove}
                              disabled={uploadingLogo}
                              className="px-3 py-2 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            >
                              {t("adm.remove")}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {t("adm.logoHint")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* -- Operations ---------------------------------------- */}
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-700 flex items-baseline gap-3">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t("adm.operations")}</h4>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <label htmlFor="org-timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("adm.timezone")}
                      </label>
                      <select
                        id="org-timezone"
                        value={defaultTimezone}
                        onChange={(e) => setDefaultTimezone(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                      >
                        {ORG_TIMEZONES.map((tz) => (
                          <option key={tz.id} value={tz.id}>{tz.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40 px-4 py-3">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {fill(t("adm.cronNote"), {
                          time: (
                            <b className="font-semibold text-gray-900 dark:text-white">
                              {cronTimeInTimezone(defaultTimezone)}
                            </b>
                          ),
                          zone: defaultTimezone,
                        })}
                      </div>
                      
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveOrganizationSettings}
                    disabled={loading || !organizationDirty}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? t("adm.saving") : t("adm.saveChanges")}
                  </button>
                  <span className="text-xs text-gray-500">
                    {organizationDirty ? t("adm.dirty") : t("adm.clean")}
                  </span>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="h-full flex flex-col">
                <div className="mb-6 shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adm.usersTitle")}</h3>
                  <p className="text-gray-500 mt-1">{t("adm.usersSub")}</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-10">
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
                              {profile.is_owner && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-300 dark:border-amber-500/30">
                                  {t("adm.owner")}
                                </span>
                              )}
                            </div>
                            {/* Email is deliberately not available here: this list
                                comes from user_directory, which never exposes it. */}
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                              {profile.is_staff
                                ? t("adm.teamMember")
                                : t("adm.externalDesc")}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-4 border-t border-gray-100 dark:border-slate-700/50">
                          <div className="flex items-center gap-2">
                            <select
                              value={profile.role || "member"}
                              onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                              disabled={!!profile.is_owner}
                              title={profile.is_owner ? t("adm.ownerRoleFixed") : undefined}
                              className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="admin">{t("adm.roleAdmin")}</option>
                              <option value="member">{t("adm.roleMember")}</option>
                            </select>

                            <button
                              onClick={() => handleStaffChange(profile.id, !profile.is_staff)}
                              disabled={!!profile.is_owner || savingId === profile.id}
                              title={
                                profile.is_owner
                                  ? t("adm.ownerAlwaysTeam")
                                  : t("adm.teamHint")
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                profile.is_staff
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
                                  : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-900 dark:text-gray-400 dark:border-slate-700"
                              }`}
                            >
                              {profile.is_staff ? t("adm.team") : t("adm.external")}
                            </button>
                          </div>

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
                </div>
              </div>
            )}

            {activeTab === "permissions" && (
              <div className="h-full flex flex-col">
                <div className="mb-6 shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adm.permTitle")}</h3>
                  <p className="text-gray-500 mt-1">{t("adm.permSub")}</p>
                </div>
                <div className="flex-1 overflow-hidden bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl flex shadow-sm">
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
                    ) : selectedTier === "admin" ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-8">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
                          <Shield size={26} />
                        </div>
                        <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
                          {t("adm.isAdmin", { name: selectedProfile?.full_name ?? "" })}
                        </h4>
                        <p className="text-sm text-gray-500 max-w-sm">
                          {t("adm.isAdminBody")}
                        </p>
                        <p className="text-xs text-gray-400 max-w-sm mt-3">
                          {t("adm.isAdminNote")}
                        </p>
                      </div>
                    ) : selectedTier === "external" ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-8">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
                          <Lock size={26} />
                        </div>
                        <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
                          {t("adm.isExternal", { name: selectedProfile?.full_name ?? "" })}
                        </h4>
                        <p className="text-sm text-gray-500 max-w-sm">
                          {t("adm.isExternalBody")}
                        </p>
                        <p className="text-xs text-gray-400 max-w-sm mt-3">
                          {t("adm.isExternalNote")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="mb-6 flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t("adm.wsBoardAccess")}</h3>
                            <p className="text-sm text-gray-500">{t("adm.wsBoardAccessSub")}</p>
                          </div>
                        </div>

                        {companyWorkspaces.map(ws => {
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
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

