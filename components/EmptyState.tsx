"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Check, AlertCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { useT } from "@/components/LanguageProvider";

type EmptyStateProps = {
    profile: any;
    onCreateWorkspace: () => void;
};

/**
 * What a new account sees: no workspace, and the two ways out of that.
 *
 * handle_new_user() used to hand every signup a private "My Workspace", which
 * meant nobody ever reached this screen — people were dropped straight into a
 * working board and never learned that Host'lik's shared workspaces exist or
 * that access to them is something you ask for. 20260913000000 stopped that, so
 * this is now the first screen after signing up.
 *
 * It leads with creating a workspace, which any account may do (privately — see
 * the "Workspaces: Insert" policy), and keeps the Host'lik request as a quiet
 * second option, named explicitly so an employee knows it is meant for them.
 */
export default function EmptyState({ profile, onCreateWorkspace }: EmptyStateProps) {
    const t = useT();
    const [requesting, setRequesting] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleRequestAccess = async () => {
        setRequesting(true);
        try {
            // Notifying admins requires reading their rows and writing rows they
            // own, so it runs server-side in request_workspace_access().
            const { error } = await supabase.rpc("request_workspace_access");
            if (!error) {
                showToast(t("empty.requestSent"), "success");
            } else {
                showToast(t("empty.requestFailed"), "error");
            }
        } catch (err) {
            reportMutationError(err, "Failed to send access request", { table: "notifications", operation: "insert" });
            showToast(t("empty.requestFailed"), "error");
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-white dark:bg-[#1f223c] p-8 text-center rounded-xl border border-gray-200 dark:border-white/5 mx-6 my-6 shadow-sm overflow-hidden">

            <div className="mb-6">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-400/15 border border-amber-200 dark:border-amber-400/20 rounded-full flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {t("empty.title", { name: profile?.full_name?.split(" ")[0] || t("empty.fallbackName") })}
            </h1>

            <p className="max-w-md text-gray-500 dark:text-slate-400 mb-8 leading-relaxed text-sm text-balance">
                {t("empty.body")}
            </p>

            <button
                onClick={onCreateWorkspace}
                className="px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-semibold rounded-lg transition-colors shadow-sm text-sm"
            >
                {t("empty.createWorkspace")}
            </button>

            {/* Host'lik is named explicitly: the only shared workspaces that
                exist belong to it, so an employee can tell this is the right
                door and everyone else can tell it is not theirs. */}
            <p className="mt-8 pt-6 border-t border-gray-100 dark:border-white/5 max-w-md text-[13px] leading-relaxed text-gray-400 dark:text-slate-500">
                {t("empty.hostlikPrompt")}{" "}
                <button
                    onClick={handleRequestAccess}
                    disabled={requesting}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                    {requesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {t("empty.hostlikRequest")}
                </button>
            </p>

            {toast && (
                <div className={`fixed bottom-8 right-8 flex items-center p-4 rounded-xl shadow-xl border animate-in slide-in-from-bottom-5 fade-in duration-300 z-50 ${
                    toast.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                    {toast.type === 'success'
                        ? <Check className="w-5 h-5 mr-3 shrink-0" />
                        : <AlertCircle className="w-5 h-5 mr-3 shrink-0" />}
                    <span className="font-medium text-sm">{toast.message}</span>
                    <button
                        onClick={() => setToast(null)}
                        aria-label={t("common.close")}
                        className="ml-4 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors opacity-70 hover:opacity-100"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
