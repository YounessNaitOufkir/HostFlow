"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import {
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  ImageIcon,
  Send,
  ChevronDown,
  MessageSquare,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Item, Column, Update, Profile, STATUS_OPTIONS, ActivityLog } from "@/types";
import { Clock } from "lucide-react";

// ============================================================
// Relative time formatter (no dependency needed)
// ============================================================
function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour === 1) return "1 hour ago";
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ============================================================
// Editor Toolbar
// ============================================================
function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  const btnClass = (isActive: boolean) =>
    `p-1.5 rounded transition-colors ${
      isActive
        ? "bg-blue-100 text-blue-600"
        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:bg-slate-700"
    }`;

  const handleAddImage = () => {
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 flex-wrap">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
        title="Bold"
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
        title="Italic"
      >
        <Italic size={15} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive("underline"))}
        title="Underline"
      >
        <UnderlineIcon size={15} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive("strike"))}
        title="Strikethrough"
      >
        <Strikethrough size={15} />
      </button>

      <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-1"></div>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive("bulletList"))}
        title="Bullet List"
      >
        <List size={15} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive("orderedList"))}
        title="Ordered List"
      >
        <ListOrdered size={15} />
      </button>

      <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-1"></div>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btnClass(editor.isActive("heading", { level: 2 }))}
        title="Heading"
      >
        <Heading2 size={15} />
      </button>
      <button
        type="button"
        onClick={handleAddImage}
        className={btnClass(false)}
        title="Insert Image"
      >
        <ImageIcon size={15} />
      </button>
    </div>
  );
}

// ============================================================
// ItemPanel Component
// ============================================================
interface ItemPanelProps {
  item: Item;
  columns: Column[];
  currentUser: {
    id: string;
    name: string;
    avatar: string;
    color: string;
  };
  onClose: () => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  profiles: Profile[];
}

export default function ItemPanel({ item, columns, currentUser, onClose, onUpdateCell, profiles }: ItemPanelProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"updates" | "activity">("updates");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Write an update...",
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Underline,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose-editor outline-none p-4 min-h-[120px] text-sm text-gray-700 dark:text-gray-200",
      },
    },
  });

  // ---- Fetch Updates ----
  const fetchUpdates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("updates")
        .select("*")
        .eq("item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUpdates(data || []);
    } catch (err) {
      console.error("Error fetching updates:", err);
    } finally {
      setLoadingUpdates(false);
    }
  }, [item.id]);

  // ---- Fetch Activity Logs ----
  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActivityLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, [item.id]);

  useEffect(() => {
    fetchUpdates();
    fetchLogs();

    // Subscribe to realtime updates for this specific item
    const channel = supabase
      .channel(`item-updates-${item.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "updates", filter: `item_id=eq.${item.id}` },
        (payload) => {
          setUpdates((prev) => [payload.new as Update, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [item.id, fetchUpdates, fetchLogs]);

  // ---- Close on Escape ----
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // ---- Post a new update ----
  const handlePostUpdate = async () => {
    if (!editor || editor.isEmpty || isSubmitting) return;

    const htmlBody = editor.getHTML();
    setIsSubmitting(true);

    // Optimistic UI
    const tempUpdate: Update = {
      id: `temp-${Date.now()}`,
      item_id: item.id,
      body: htmlBody,
      author_id: currentUser.id,
      author_name: currentUser.name,
      created_at: new Date().toISOString(),
    };
    setUpdates((prev) => [tempUpdate, ...prev]);
    editor.commands.clearContent();

    try {
      const { data, error } = await supabase
        .from("updates")
        .insert({
          item_id: item.id,
          body: htmlBody,
          author_id: currentUser.id,
          author_name: currentUser.name,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setUpdates((prev) => prev.map((u) => (u.id === tempUpdate.id ? data : u)));
      }
    } catch (error) {
      console.error("Failed to post update:", error);
      // Remove the optimistic entry on failure
      setUpdates((prev) => prev.filter((u) => u.id !== tempUpdate.id));
    }
    setIsSubmitting(false);
  };

  // ---- Render column value chips ----
  const renderColumnChips = () => {
    return columns.slice(0, 4).map((col) => {
      const value = item.column_values?.[col.id];
      if (!value && value !== 0) return null;

      if (col.type === "status") {
        const opt = STATUS_OPTIONS.find((o) => o.label === value);
        const bg = opt ? opt.color : "bg-gray-200 dark:bg-slate-600";
        return (
          <span key={col.id} className={`${bg} text-white text-xs font-medium px-2.5 py-1 rounded-full`}>
            {value}
          </span>
        );
      }

      if (col.type === "people" && Array.isArray(value)) {
        return (
          <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
            {col.title}: {value.length} assigned
          </span>
        );
      }

      return (
        <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
          {col.title}: {String(value)}
        </span>
      );
    });
  };

  // ---- Find user avatar info from author_id ----
  const getAuthorUser = (authorId: string) => {
    const p = profiles.find((u) => u.id === authorId);
    if (p) {
      return {
        name: p.full_name,
        avatar: p.avatar_initials,
        color: p.color,
      };
    }
    return {
      name: "Unknown",
      avatar: "??",
      color: "#6b7280",
    };
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 panel-overlay-fade"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col panel-slide-in">
        {/* ===== HEADER ===== */}
        <div className="border-b border-gray-200 dark:border-slate-600 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate pr-4">{item.name}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>
          {/* Column value chips */}
          <div className="flex flex-wrap gap-2">{renderColumnChips()}</div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 px-6 shrink-0">
          <button 
            onClick={() => setActiveTab("updates")}
            className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors flex items-center ${activeTab === "updates" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            <MessageSquare size={16} className="mr-2" /> Updates {updates.length > 0 && `(${updates.length})`}
          </button>
          <button 
            onClick={() => setActiveTab("activity")}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center ${activeTab === "activity" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            <Clock size={16} className="mr-2" /> Activity Log
          </button>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "updates" ? (
            <>
              {/* ---- COMPOSER ---- */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
                {/* User identification */}
                <div className="flex items-center space-x-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ backgroundColor: currentUser.color }}
                  >
                    {currentUser.avatar}
                  </div>
                  <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{currentUser.name}</span>
                </div>

                {/* TipTap Editor */}
                <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                  <EditorToolbar editor={editor} />
                  <EditorContent editor={editor} />
                </div>

                {/* Submit button */}
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handlePostUpdate}
                    disabled={isSubmitting || !editor || editor?.isEmpty}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm dark:shadow-none"
                  >
                    <Send size={14} />
                    Update
                  </button>
                </div>
              </div>

              {/* ---- UPDATES FEED ---- */}
              <div className="flex-1 overflow-y-auto">
                {loadingUpdates ? (
                  <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Loading updates...</div>
                ) : updates.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <MessageSquare size={32} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 dark:text-gray-500 text-sm">No updates yet.</p>
                    <p className="text-gray-300 text-xs mt-1">Be the first to post an update!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {updates.map((update) => {
                      const author = getAuthorUser(update.author_id);
                      return (
                        <div key={update.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="flex items-center gap-2.5 mb-2">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: author.color }}
                            >
                              {author.avatar}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{author.name}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                                {formatRelativeTime(update.created_at)}
                              </span>
                            </div>
                          </div>
                          <div
                            className="update-body text-sm text-gray-700 dark:text-gray-200 pl-[42px]"
                            dangerouslySetInnerHTML={{ __html: update.body }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ---- ACTIVITY LOG FEED ---- */
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950 p-6">
              {loadingLogs ? (
                <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">Loading logs...</div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
                  <Clock size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No activity logged.</p>
                  <p className="text-gray-400 text-xs mt-2">Make a change to this item to see it logged here. Only you can see your activity.</p>
                </div>
              ) : (
                <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-[23px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                  {activityLogs.map((log) => {
                    const author = getAuthorUser(log.user_id);
                    return (
                      <div key={log.id} className="relative flex items-center justify-between group">
                        {/* Timeline dot */}
                        <div className="absolute left-[-24px] w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-slate-950"></div>
                        
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm flex-1 ml-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: author.color }}
                          >
                            {author.avatar}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                              <span className="font-semibold mr-1">{author.name}</span>
                              {log.action}
                            </p>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 block flex items-center gap-1">
                              <Clock size={10} />
                              {formatRelativeTime(log.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
