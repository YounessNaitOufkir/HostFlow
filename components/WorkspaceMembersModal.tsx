"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Globe, Check, Loader2, UserPlus, Ban } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Workspace } from "@/types";
import { reportMutationError } from "@/lib/errorReporting";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { queryKeys } from "@/hooks/queries/queryKeys";

interface DirectoryUser {
  id: string;
  full_name: string | null;
  avatar_initials: string | null;
  color: string | null;
  /** Company staff. Externals never reach a shared workspace - see below. */
  is_staff: boolean | null;
}

interface WorkspaceMembersModalProps {
  workspace: Workspace;
  currentUserId: string;
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
  onClose,
}: WorkspaceMembersModalProps) {
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracked locally so the dialog reflects the switch immediately; the sidebar
  // catches up when the workspaces query is invalidated below.
  const [isPrivate, setIsPrivate] = useState(!!workspace.is_private);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  const togglePrivacy = async () => {
    const next = !isPrivate;
    setTogglingPrivacy(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ is_private: next })
        .eq("id", workspace.id);
      if (error) throw error;
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
    const [dirRes, memberRes] = await Promise.all([
      supabase
        .from("user_directory")
        .select("id, full_name, avatar_initials, color, is_staff")
        .order("full_name"),
      supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace.id),
    ]);

    if (dirRes.error) setError("Could not load the people list.");
    setUsers((dirRes.data as DirectoryUser[]) || []);
    setMemberIds(
      new Set((memberRes.data || []).map((m: { user_id: string }) => m.user_id))
    );
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

        {error && (
          <div className="mx-5 mt-4 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="p-3 overflow-y-auto">
          {!isPrivate && !loading && (
            <p className="px-2 pb-3 text-xs text-gray-500 dark:text-gray-400">
              Everyone on the team can already open this workspace. External
              people are not listed - shared workspaces are staff-only. Switch
              it to private if you want to choose who sees it.
            </p>
          )}
          {loading ? (
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
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: u.color || "#579bfc" }}
                  >
                    {u.avatar_initials ||
                      (u.full_name || "?").slice(0, 2).toUpperCase()}
                  </div>
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
          )}
        </div>

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
