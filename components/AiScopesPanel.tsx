"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useT } from "@/components/LanguageProvider";
import { reportMutationError } from "@/lib/errorReporting";
import type { Profile } from "@/types";

/**
 * Which workspaces this person's AI assistant (the Claude connector) may use.
 *
 * Each person chooses for themselves - an admin cannot see someone's private
 * workspace, so nobody else could. The database enforces the choice on every
 * request the assistant makes (the "AI scope" policies); this panel only
 * edits the person's own rows in ai_workspace_scopes. Every change is
 * confirmed by the row that comes back.
 */

interface ScopeRow {
  workspace_id: string;
  can_read: boolean;
  can_write: boolean;
}

interface WorkspaceRow {
  id: string;
  name: string;
  is_private: boolean | null;
}

const SCOPES_KEY = (userId: string) => ["aiScopes", userId] as const;

export default function AiScopesPanel({ profile }: { profile: Profile }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const workspaces = useQuery({
    queryKey: ["aiScopeWorkspaces", profile.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("id, name, is_private").order("name");
      if (error) throw error;
      return (data ?? []) as WorkspaceRow[];
    },
  });

  const scopes = useQuery({
    queryKey: SCOPES_KEY(profile.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_workspace_scopes")
        .select("workspace_id, can_read, can_write")
        .eq("user_id", profile.id);
      if (error) throw error;
      return (data ?? []) as ScopeRow[];
    },
  });

  const byWorkspace = new Map((scopes.data ?? []).map((s) => [s.workspace_id, s]));

  const setScope = async (workspaceId: string, read: boolean, write: boolean) => {
    setSavingId(workspaceId);
    try {
      if (!read) {
        const { error } = await supabase
          .from("ai_workspace_scopes")
          .delete()
          .eq("user_id", profile.id)
          .eq("workspace_id", workspaceId)
          .select("workspace_id");
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ai_workspace_scopes")
          .upsert(
            {
              user_id: profile.id,
              workspace_id: workspaceId,
              can_read: true,
              can_write: write,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,workspace_id" }
          )
          .select("workspace_id, can_read, can_write");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("The choice was not saved.");
      }
      await queryClient.invalidateQueries({ queryKey: SCOPES_KEY(profile.id) });
    } catch (err) {
      reportMutationError(err, t("aiScope.errSave"), { table: "ai_workspace_scopes", operation: "upsert" });
    }
    setSavingId(null);
  };

  const loading = workspaces.isLoading || scopes.isLoading;
  const failed = workspaces.isError || scopes.isError;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("aiScope.title")}</h3>
        <p className="text-sm text-gray-500">{t("aiScope.body")}</p>
      </div>

      {!profile.ai_access && (
        <p className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-800 dark:text-amber-300">
          {t("aiScope.accessOff")}
        </p>
      )}

      {loading && (
        <div className="flex justify-center py-6" role="status">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-hidden />
        </div>
      )}

      {failed && !loading && <p className="text-sm text-red-600 dark:text-red-400">{t("aiScope.errLoad")}</p>}

      {!loading && !failed && (
        <div className="divide-y divide-gray-100 dark:divide-slate-700/50 border-y border-gray-100 dark:border-slate-700/50">
          <div className="flex items-center justify-end gap-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span className="w-12 text-center">{t("aiScope.read")}</span>
            <span className="w-12 text-center">{t("aiScope.write")}</span>
          </div>
          {(workspaces.data ?? []).map((ws) => {
            const scope = byWorkspace.get(ws.id);
            const read = !!scope?.can_read;
            const write = !!scope?.can_write;
            const busy = savingId === ws.id;
            return (
              <div key={ws.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 flex items-center gap-1.5 text-sm text-gray-800 dark:text-gray-100">
                  <span className="truncate">{ws.name}</span>
                  {ws.is_private && <Lock size={12} className="shrink-0 text-gray-400" aria-label={t("aiScope.private")} />}
                </span>
                <span className="flex items-center gap-6 shrink-0">
                  <span className="w-12 flex justify-center">
                    <input
                      type="checkbox"
                      id={`ai-read-${ws.id}`}
                      aria-label={t("aiScope.readFor", { name: ws.name })}
                      checked={read}
                      disabled={busy}
                      onChange={(e) => setScope(ws.id, e.target.checked, false)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </span>
                  <span className="w-12 flex justify-center">
                    {busy ? (
                      <Loader2 size={14} className="animate-spin text-gray-400" aria-hidden />
                    ) : (
                      <input
                        type="checkbox"
                        id={`ai-write-${ws.id}`}
                        aria-label={t("aiScope.writeFor", { name: ws.name })}
                        checked={write}
                        onChange={(e) => setScope(ws.id, read || e.target.checked, e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">{t("aiScope.footer")}</p>
    </div>
  );
}
