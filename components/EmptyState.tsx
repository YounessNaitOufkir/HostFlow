"use client";

import React, { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";

type EmptyStateProps = {
    profile: any;
    onCreateWorkspace: () => void;
};

export default function EmptyState({ profile, onCreateWorkspace }: EmptyStateProps) {
    const [requesting, setRequesting] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleRequestAccess = async () => {
        setRequesting(true);
        try {
            // Find admins
            const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
            if (admins && admins.length > 0) {
                // Send a notification to all admins
                const notifications = admins.map((admin: any) => ({
                    user_id: admin.id,
                    message: `${profile.full_name} is requesting access to a workspace.`,
                }));
                await supabase.from("notifications").insert(notifications);
                showToast("Request sent successfully! An admin will review it shortly.", "success");
            } else {
                showToast("No admins found in the system to notify.", "error");
            }
        } catch (err) {
            reportMutationError(err, "Failed to send access request", { table: "notifications", operation: "insert" });
            showToast("Failed to send request. Please try again later.", "error");
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-white dark:bg-[#1f223c] p-8 text-center rounded-xl border border-gray-200 dark:border-white/5 mx-6 my-6 shadow-sm overflow-hidden">

            <div className="mb-6">
                <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full flex items-center justify-center">
                    <Lock className="h-8 w-8 text-gray-400 dark:text-gray-300" />
                </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome, {profile?.full_name?.split(" ")[0] || "there"}!
            </h1>

            <p className="max-w-md text-gray-500 dark:text-slate-400 mb-8 leading-relaxed text-sm">
                You don't have access to any workspaces yet. An admin can grant you access, or you can start a new workspace from scratch.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
                <button
                    onClick={onCreateWorkspace}
                    className="px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-semibold rounded-lg transition-colors shadow-sm text-sm"
                >
                    Create Workspace
                </button>

                <button
                    onClick={handleRequestAccess}
                    disabled={requesting}
                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-slate-300 font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 text-sm"
                >
                    {requesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Request Access
                </button>
            </div>

            {/* Custom Toast Notification */}
            {toast && (
                <div className={`fixed bottom-8 right-8 flex items-center p-4 rounded-xl shadow-xl border animate-in slide-in-from-bottom-5 fade-in duration-300 z-50 ${
                    toast.type === 'success' 
                        ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' 
                        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                    {toast.type === 'success' ? (
                        <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    ) : (
                        <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    )}
                    <span className="font-medium text-sm">{toast.message}</span>
                    <button onClick={() => setToast(null)} className="ml-4 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors opacity-70 hover:opacity-100">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </div>
    );
}
