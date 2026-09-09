"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { createPortal } from "react-dom";
import { X, Lock, Globe, Check, Loader2, UserPlus, Ban, Mail, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Profile, Workspace, PendingInvitation } from "@/types";
import { reportMutationError } from "@/lib/errorReporting";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { useT } from "@/components/LanguageProvider";
import { toast } from "sonner";
import WorkspaceAutomations from "@/components/WorkspaceAutomations";

interface DirectoryUser {
  id: string;
  full_name: string | null;
  avatar_initials: string | null;
  avatar_url?: string | null;
  color: string | null;
  /** Company staff. Externals never reach a shared workspace - see below. */
  is_staff: boolean | null;
}

interface WorkspaceMembersModalProps {
  workspace: Workspace;
  currentUserId: string;
  /** Used only to gate the Automations tab against `role === "admin"`; the
   * member-list behavior below never depended on it and does not start now. */
  profile?: Profile | null;
  onClose: () => void;
}

/**
 * Manage who can reach a workspace.
 *
 * For a private workspace this is the only way in: nobody, administrators
 * included, sees it unless its creator adds them here.
 *
 * People are listed from `user_directory`, which never exposes email addresses.
 */
export default function WorkspaceMembersModal({
  workspace,
  currentUserId,
  profile,
  onClose,
}: WorkspaceMembersModalProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [memberRoles, setMemberRoles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracked locally so the dialog reflects the switch immediately; the sidebar
  // catches up when the workspaces query is invalidated below.
  const [isPrivate, setIsPrivate] = useState(!!workspace.is_private);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "automations">("members");
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Mirrors can_manage_workspace(): every branch that can succeed already
  // implies staff (a non-staff user cannot create a non-private workspace,
  // and role='admin' implies is_staff via profiles_admin_implies_staff), so
  // the DB function's outer "private OR staff" gate is redundant to restate
  // client-side.
  const myMembershipRole = memberRoles.get(currentUserId);
  const canManageWorkspace =
    workspace.created_by === currentUserId ||
    myMembershipRole === "admin" ||
    myMembershipRole === "manager" ||
    (!isPrivate && profile?.role === "admin");

  // An external inviting into their own private workspace should not see the
  // company's staff directory at all — that leaks who works there into a
  // space the whole point of which is to be theirs. They get the email input
  // only; a staff member sees both.
  const isStaffInviter = profile?.is_staff !== false;

  const togglePrivacy = async () => {
    const next = !isPrivate;
    setTogglingPrivacy(true);
    setError(null);
    try {
      // The updated row is read back, not assumed.
      //
      // An UPDATE that row-level security refuses does not fail: it matches no
      // row and returns no error. Without the select, `error` was null, the
      // toggle flipped, and the modal told the user a workspace was private
      // while the database still had it shared - the one lie this control must
      // never tell.
      const { data, error } = await supabase
        .from("workspaces")
        .update({ is_private: next })
        .eq("id", workspace.id)
        .select("id, is_private");
      if (error) throw error;
      if (!data || data.length === 0 || data[0].is_private !== next) {
        throw new Error("Visibility was not changed: the update matched no row.");
      }
      setIsPrivate(next);
      // Visibility change alters what RLS returns, so refresh both lists.
      // "boards" is invalidated by prefix because its key carries a workspace id.
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    } catch (err: unknown) {
      reportMutationError(err, "Could not change workspace visibility", {
        table: "workspaces",
        operation: "update",
      });
      setError("Could not change visibility. Only the workspace owner can do that.");
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [dirRes, memberRes, inviteRes] = await Promise.all([
      supabase
        .from("user_directory")
        .select("id, full_name, avatar_initials, avatar_url, color, is_staff")
        .order("full_name"),
      supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id),
      // RLS gates this on can_manage_workspace, same as everything else here —
      // someone who cannot manage the workspace just reads an empty list.
      supabase
        .from("pending_invitations")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
    ]);

    if (dirRes.error) setError("Could not load the people list.");
    setUsers((dirRes.data as DirectoryUser[]) || []);
    const rows = (memberRes.data || []) as { user_id: string; role: string | null }[];
    setMemberIds(new Set(rows.map((m) => m.user_id)));
    setMemberRoles(new Map(rows.map((m) => [m.user_id, m.role || "member"])));
    setPendingInvites((inviteRes.data as PendingInvitation[]) || []);
    setLoading(false);
  }, [workspace.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (userId: string, isMember: boolean) => {
    setBusyId(userId);
    setError(null);
    try {
      if (isMember) {
        const { error } = await supabase
          .from("workspace_members")
          .delete()
          .eq("workspace_id", workspace.id)
          .eq("user_id", userId);
        if (error) throw error;
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("workspace_members")
          .insert({ workspace_id: workspace.id, user_id: userId, role: "member" });
        if (error) throw error;
        setMemberIds((prev) => new Set(prev).add(userId));
      }
    } catch (err: unknown) {
      reportMutationError(err, "Could not change workspace access", {
        table: "workspace_members",
        operation: isMember ? "delete" : "insert",
      });
      setError("Could not change access. You may not have permission on this workspace.");
    } finally {
      setBusyId(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = inviteEmail.trim();
    if (!target) return;
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, email: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not send the invitation");
      toast.success(t("invite.sent"));
      setInviteEmail("");
      load();
    } catch (err: unknown) {
      reportMutationError(err, "Could not send the invitation", {
        table: "pending_invitations",
        operation: "insert",
      });
      setError(err instanceof Error ? err.message : "Could not send the invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setRevokingId(inviteId);
    setError(null);
    try {
      // Read back for the same reason every other write in this file does:
      // an RLS-blocked delete matches no row and returns no error.
      const { data, error } = await supabase
        .from("pending_invitations")
        .delete()
        .eq("id", inviteId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("The invitation was not revoked.");
      }
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success(t("invite.revoked"));
    } catch (err: unknown) {
      reportMutationError(err, "Could not revoke the invitation", {
        table: "pending_invitations",
        operation: "delete",
      });
      setError("Could not revoke the invitation.");
    } finally {
      setRevokingId(null);
    }
  };

  const body = (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[80vh]">
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {isPrivate ? (
                <Lock size={15} className="text-amber-500 shrink-0" />
              ) : (
                <Globe size={15} className="text-blue-500 shrink-0" />
              )}
              <TruncatedText className="truncate">{workspace.name}</TruncatedText>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {isPrivate
                ? "Private. Only people you add here can see it, administrators included."
                : "Shared. Everyone on the team can see this workspace already, so there is nobody to invite."}
            </p>

            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              aria-label="Private workspace"
              disabled={togglingPrivacy}
              onClick={togglePrivacy}
              className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  isPrivate ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isPrivate ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </span>
              {togglingPrivacy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <span>{isPrivate ? "Private" : "Shared"}</span>
              )}
            </button>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0 ml-3"
          >
            <X size={18} />
          </button>
        </div>

        {canManageWorkspace && (
          <div className="flex items-center gap-1 px-3 pt-3 shrink-0">
            <button
              onClick={() => setActiveTab("members")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "members"
                  ? "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t("workspace.membersTab")}
            </button>
            <button
              onClick={() => setActiveTab("automations")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "automations"
                  ? "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t("auto.title")}
            </button>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-4 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs">
            {error}
          </div>
        )}

        {activeTab === "automations" ? (
          <div className="p-4 overflow-y-auto">
            <WorkspaceAutomations workspace={workspace} canManage={canManageWorkspace} />
          </div>
        ) : (
        <div className="p-3 overflow-y-auto">
          <form onSubmit={handleInvite} className="flex items-center gap-1.5 px-2 pb-3">
            <div className="relative flex-1">
              <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t("invite.placeholder")}
                aria-label={t("invite.title")}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] rounded-md transition-colors disabled:opacity-50"
            >
              {inviting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {t("invite.send")}
            </button>
          </form>

          {pendingInvites.length > 0 && (
            <div className="px-2 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                {t("invite.pendingTitle")}
              </p>
              <div className="space-y-1">
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/60"
                  >
                    <Mail size={13} className="text-gray-400 shrink-0" />
                    <TruncatedText className="truncate flex-1 text-xs text-gray-600 dark:text-gray-300">
                      {invite.email}
                    </TruncatedText>
                    <button
                      disabled={revokingId === invite.id}
                      onClick={() => handleRevoke(invite.id)}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {revokingId === invite.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        t("invite.revoke")
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isStaffInviter ? null : !isPrivate && !loading && (
            <p className="px-2 pb-3 text-xs text-gray-500 dark:text-gray-400">
              Everyone on the team can already open this workspace. External
              people are not listed - shared workspaces are staff-only. Switch
              it to private if you want to choose who sees it.
            </p>
          )}
          {isStaffInviter && (loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No other people to show yet.
            </p>
          ) : (
            users
              // On a shared workspace an external person can never have
              // access, so listing them is noise - your sister organising her
              // own life has no business in a team workspace's people list.
              // The exception is someone still holding a membership row from
              // when this workspace was private: that grants nothing now, but
              // it should be visible so it can be cleared.
              .filter((u) => isPrivate || u.is_staff !== false || memberIds.has(u.id))
              .map((u) => {
              const isMember = memberIds.has(u.id);
              const isSelf = u.id === currentUserId;
              // can_access_workspace requires staff for any non-private
              // workspace, so an external person cannot open this one however
              // the badge used to read.
              const isExternal = u.is_staff === false;
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <Avatar
                    name={u.full_name}
                    initials={u.avatar_initials}
                    url={u.avatar_url}
                    color={u.color || "#579bfc"}
                    size={32}
                  />
                  <TruncatedText className="truncate flex-1 text-sm text-gray-800 dark:text-gray-200">
                    {u.full_name || "Unnamed user"}
                    {isSelf && <span className="text-gray-400 text-xs"> (you)</span>}
                  </TruncatedText>

                  {/* On a shared workspace everyone already has access, so there
                      is nothing to grant — show state rather than an action. */}
                  {!isPrivate ? (
                    isExternal ? (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggle(u.id, true)}
                        title="This person was invited while the workspace was private. They cannot open it now that it is shared - removing them clears the leftover invite."
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50"
                      >
                        {busyId === u.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <Ban size={12} /> Lost access
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-md border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 shrink-0 flex items-center gap-1">
                        <Check size={12} /> Has access
                      </span>
                    )
                  ) : (
                    <button
                      disabled={busyId === u.id || isSelf}
                      onClick={() => toggle(u.id, isMember)}
                      title={
                        isSelf
                          ? "You always have access to workspaces you create"
                          : undefined
                      }
                      className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isMember
                          ? "border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                          : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:text-blue-600"
                      }`}
                    >
                      {busyId === u.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isMember ? (
                        <>
                          <Check size={12} /> Has access
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} /> Invite
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          ))}
        </div>
        )}

        <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex justify-end bg-gray-50 dark:bg-slate-800/30 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}
