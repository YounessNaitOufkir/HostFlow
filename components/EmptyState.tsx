"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { HostlikAccessPrompt } from "@/components/access/HostlikAccessPrompt";
import type { Profile } from "@/types";

type EmptyStateProps = {
    profile: Profile | null;
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
                className="px-6 py-2.5 bg-brand-amber hover:bg-brand-amber-hover text-gray-900 font-semibold rounded-lg transition-colors shadow-sm text-sm"
            >
                {t("empty.createWorkspace")}
            </button>

            {/* Host'lik is named explicitly: the only shared workspaces that
                exist belong to it, so an employee can tell this is the right
                door and everyone else can tell it is not theirs. */}
            <HostlikAccessPrompt
                profile={profile}
                variant="page"
                className="mt-8 pt-6 border-t border-gray-100 dark:border-white/5"
            />
        </div>
    );
}
