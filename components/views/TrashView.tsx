"use client";

import React, { useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { Item, Group } from "@/types";
import { Trash2, RotateCcw, AlertTriangle, MessageSquare, Trash } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Update } from "@/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { reportFetchError, reportMutationError } from "@/lib/errorReporting";
import { useAuth } from "@/components/AuthProvider";
import { TruncatedText } from "@/components/ui/TruncatedText";


interface TrashViewProps {
  trashItems: Item[];
  groups: Group[];
  allItems: Item[];
  onRestore: (itemId: string) => void;
  onDeletePermanently: (itemId: string) => void;
}

export default function TrashView({ trashItems, groups, allItems, onRestore, onDeletePermanently }: TrashViewProps) {
  const t = useT();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const allItemIds = allItems.map(i => i.id);

  const {
    data: trashUpdates = [],
    isLoading: loadingUpdates,
  } = useQuery({
    queryKey: queryKeys.trashUpdates(allItemIds),
    queryFn: async () => {
      if (allItemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("updates")
        .select("*")
        .not("deleted_at", "is", null)
        .in("item_id", allItemIds);
      if (error) throw error;
      return (data || []) as Update[];
    },
    enabled: allItemIds.length > 0,
  });

  const handleRestoreUpdate = async (id: string) => {
    try {
      const updateToRestore = trashUpdates.find(u => u.id === id);
      const { error } = await supabase.from("updates").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      queryClient.setQueryData<Update[]>(queryKeys.trashUpdates(allItemIds), (old = []) =>
        old.filter(u => u.id !== id)
      );
      if (updateToRestore) {
        window.dispatchEvent(new CustomEvent('update-restored', { detail: { itemId: updateToRestore.item_id } }));
        queryClient.invalidateQueries({ queryKey: queryKeys.itemUpdates(updateToRestore.item_id) });
      }
    } catch (err) {
      reportMutationError(err, "Failed to restore update", { table: "updates", operation: "update" });
    }
  };


  const handleDeleteUpdatePermanently = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this update? This action cannot be undone.")) return;
    try {
      const { error } = await supabase.from("updates").delete().eq("id", id);
      if (error) throw error;
      queryClient.setQueryData<Update[]>(queryKeys.trashUpdates(allItemIds), (old = []) =>
        old.filter(u => u.id !== id)
      );
    } catch (err) {
      reportMutationError(err, "Failed to permanently delete update", { table: "updates", operation: "delete" });
    }
  };


  const filteredItems = trashItems.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-auto bg-[#f6f7fb] dark:bg-[#181b34] p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
              <Trash2 size={24} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {t("trash.title")}
            </h1>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {trashItems.length + trashUpdates.length === 1
              ? t("trash.countOne")
              : t("trash.count", { count: trashItems.length + trashUpdates.length })}
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-4 flex items-start space-x-3 text-yellow-800 dark:text-yellow-200 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>{t("trash.notice")}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50">
            <input
              type="text"
              placeholder={t("trash.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          
          {filteredItems.length === 0 && trashUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <Trash2 size={48} className="opacity-20 mb-4" />
              <p>{t("trash.empty")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                <thead className="bg-gray-50 dark:bg-slate-800/50 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 border-b border-gray-200 dark:border-slate-700/50">{t("trash.itemName")}</th>
                    <th className="px-6 py-3 border-b border-gray-200 dark:border-slate-700/50">{t("trash.originalGroup")}</th>
                    <th className="px-6 py-3 border-b border-gray-200 dark:border-slate-700/50">{t("trash.deletedAt")}</th>
                    <th className="px-6 py-3 border-b border-gray-200 dark:border-slate-700/50 text-right">{t("trash.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {filteredItems.map(item => {
                    const group = groups.find(g => g.id === item.group_id);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3 font-medium text-gray-800 dark:text-gray-200">
                          {item.name}
                        </td>
                        <td className="px-6 py-3">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group?.color || '#ccc' }}></span>
                            {group?.title || "Unknown Group"}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          {item.deleted_at ? format(new Date(item.deleted_at), "MMM d, yyyy HH:mm") : "Unknown"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onRestore(item.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                            >
                              <RotateCcw size={14} /> Restore
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  if (window.confirm("Are you sure you want to permanently delete this task? This action cannot be undone.")) {
                                    onDeletePermanently(item.id);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                              >
                                <Trash size={14} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {trashUpdates.filter(u => u.body.toLowerCase().includes(searchTerm.toLowerCase())).map(update => {
                    return (
                      <tr key={update.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3 font-medium text-gray-800 dark:text-gray-200">
                          <div className="flex items-center gap-2">
                            <MessageSquare size={14} className="text-blue-500" />
                            <TruncatedText
                              as="div"
                              className="line-clamp-1 max-w-sm text-sm opacity-80"
                              tooltip={update.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(update.body) }}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className="text-gray-500 text-sm italic">Update from {update.author_name}</span>
                        </td>
                        <td className="px-6 py-3">
                          {update.deleted_at ? format(new Date(update.deleted_at), "MMM d, yyyy HH:mm") : "Unknown"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleRestoreUpdate(update.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                            >
                              <RotateCcw size={14} /> Restore
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteUpdatePermanently(update.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                              >
                                <Trash size={14} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
