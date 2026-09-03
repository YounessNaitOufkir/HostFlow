"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { displayColumnTitle, displayCellLabel, displayStatus } from "@/lib/i18n/labels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { ItemPanelSkeleton } from "@/components/skeletons/ItemPanelSkeleton";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
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
  AtSign,
  Paperclip,
  Smile
} from "lucide-react";

import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { MentionList } from './MentionList';
import { motion } from "framer-motion";
import { useUpdateEditor } from "@/hooks/useUpdateEditor";
import { usePromptModal } from "@/hooks/usePromptModal";

import { supabase } from "@/lib/supabase";
import { useT, useLanguage } from "@/components/LanguageProvider";
import { Item, Column, Update, Profile, STATUS_OPTIONS, ActivityLog } from "@/types";
import { Clock, Reply, Trash2 } from "lucide-react";
import { reportError, reportFetchError, reportMutationError } from "@/lib/errorReporting";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { escapeHtml } from "@/lib/escapeHtml";

const sanitizeHtml = (html: string) => typeof window !== "undefined" ? DOMPurify.sanitize(html) : html;

// ============================================================
// Relative time formatter (no dependency needed)
// ============================================================

// ============================================================
// Bottom Toolbar
// ============================================================
function BottomToolbar({ editor, requestPrompt }: { editor: any, requestPrompt: (title: string) => Promise<string | null> }) {
  const t = useT();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) return null;

  const btnClass = "p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-slate-700 transition-colors";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `updates/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file);

      if (uploadError) {
        reportMutationError(uploadError, "File upload failed", { table: "storage", operation: "upload" });
        return;
      }
      
      const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
      
      if (file.type.startsWith('image/')) {
        editor.chain().focus().setImage({ src: data.publicUrl }).run();
      } else {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const icon = isPdf ? '📄' : '📎';
        editor.chain().focus().insertContent(`<a href="${data.publicUrl}" target="_blank">${icon} ${file.name}</a> `).run();
      }
    } catch (err) {
      reportMutationError(err, "File upload failed", { table: "storage", operation: "upload" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleMention = () => {
    editor.chain().focus().insertContent('@').run();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleMention}
        className={btnClass}
        title={t("panel.mentionSomeone")}
      >
        <AtSign size={18} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={handleAddAttachment}
        disabled={isUploading}
        className={`${btnClass} ${isUploading ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
        title={t("panel.addFiles")}
      >
        <Paperclip size={18} strokeWidth={2} />
      </button>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <div className="relative" ref={emojiPickerRef}>
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`${btnClass} ${showEmojiPicker ? 'bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-gray-200' : ''}`}
          title={t("panel.addEmoji")}
        >
          <Smile size={18} strokeWidth={2} />
        </button>
        {showEmojiPicker && (
          <motion.div 
            drag 
            dragMomentum={false}
            className="absolute top-full left-0 mt-2 z-50 shadow-xl rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 cursor-move"
          >
            <EmojiPicker 
              emojiStyle={EmojiStyle.NATIVE}
              onEmojiClick={(emojiObj) => {
                editor.chain().focus().insertContent(emojiObj.emoji).run();
              }}
              autoFocusSearch={false}
              theme={Theme.AUTO}
              lazyLoadEmojis={true}
              searchDisabled={true}
              width={300}
              height={350}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Reply Composer Component
// ============================================================
function ReplyComposer({ 
  parentId, 
  itemId, 
  profiles, 
  currentUser,
  requestPrompt,
  onCancel,
  onPostReply
}: {
  parentId: string;
  itemId: string;
  profiles: Profile[];
  currentUser: { id: string; name: string; avatar: string; color: string; avatar_url?: string };
  requestPrompt: (title: string) => Promise<string | null>;
  onCancel: () => void;
  onPostReply: (tempUpdate: Update, htmlBody: string, editorJson: any) => Promise<void>;
}) {
  const t = useT();
  const { editor, isEditorEmpty, setIsEditorEmpty } = useUpdateEditor(profiles, "Write a reply...");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePost = async () => {
    if (!editor || isEditorEmpty || isSubmitting) return;
    const htmlBody = editor.getHTML();
    const editorJson = editor.getJSON();
    setIsSubmitting(true);
    
    const tempUpdate: Update = {
      id: `temp-${Date.now()}`,
      item_id: itemId,
      parent_id: parentId,
      body: htmlBody,
      author_id: currentUser.id,
      author_name: currentUser.name,
      created_at: new Date().toISOString(),
    };

    await onPostReply(tempUpdate, htmlBody, editorJson);
  };

  return (
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all flex flex-col mt-3 bg-white dark:bg-slate-900">
      <EditorContent editor={editor} className="flex-1 rounded-t-lg" />
      <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/50 px-3 py-2 border-t border-gray-200 dark:border-slate-600 rounded-b-lg">
        <BottomToolbar editor={editor} requestPrompt={requestPrompt} />
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium transition-colors"
          >
            {t("panel.cancel")}
          </button>
          <button
            onClick={handlePost}
            disabled={isSubmitting || !editor || isEditorEmpty}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm dark:shadow-none"
          >
            {t("panel.reply")}
          </button>
        </div>
      </div>
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
    avatar_url?: string;
  };
  onClose: () => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  profiles: Profile[];
  boardItems?: Item[];
}

export default function ItemPanel({ item, columns, currentUser, onClose, onUpdateCell, profiles, boardItems = [] }: ItemPanelProps) {
  const { t, bcp47 } = useLanguage();
  const queryClient = useQueryClient();

  const {
    data: updates = [],
    isLoading: loadingUpdates,
  } = useQuery({
    queryKey: queryKeys.itemUpdates(item.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("updates")
        .select("*")
        .eq("item_id", item.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Update[];
    },
  });

  const {
    data: activityLogs = [],
    isLoading: loadingLogs,
  } = useQuery({
    queryKey: queryKeys.itemActivityLogs(item.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("item_id", item.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ActivityLog[];
    },
  });

  const setUpdates = useCallback(
    (updater: Update[] | ((old: Update[]) => Update[])) => {
      queryClient.setQueryData<Update[]>(queryKeys.itemUpdates(item.id), (old = []) =>
        typeof updater === "function" ? updater(old) : updater
      );
    },
    [queryClient, item.id]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"updates" | "activity">("updates");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);

  // Resizing state
  const [panelWidth, setPanelWidth] = useState(520);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { requestPrompt, PromptComponent } = usePromptModal();

  // TipTap editor
  const { editor, isEditorEmpty, setIsEditorEmpty } = useUpdateEditor(profiles);

  // ---- Handle Resizing ----
  useEffect(() => {
    if (!isResizing) return;

    // Prevent text selection across the whole page while dragging
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = Math.max(300, Math.min(window.innerWidth * 0.9, window.innerWidth - e.clientX));
      if (panelRef.current) {
        // Direct DOM update for 60fps dragging without React re-renders
        panelRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.body.style.userSelect = '';
      setIsResizing(false);
      // Only commit to state on release
      const finalWidth = Math.max(300, Math.min(window.innerWidth * 0.9, window.innerWidth - e.clientX));
      setPanelWidth(finalWidth);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    // Subscribe to realtime updates for this specific item
    const channel = supabase
      .channel(`item-updates-${item.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "updates", filter: `item_id=eq.${item.id}` },
        (payload) => {
          setUpdates((prev) => [payload.new as Update, ...prev]);
          queryClient.invalidateQueries({ queryKey: queryKeys.itemUpdates(item.id) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [item.id, setUpdates, queryClient]);

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
    if (!editor || isEditorEmpty || isSubmitting) return;

    const htmlBody = editor.getHTML();
    const editorJson = editor.getJSON();
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
    setIsEditorEmpty(true);

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
        // Notify ItemRow to increment the update count locally
        window.dispatchEvent(new CustomEvent('update-added', { detail: { itemId: item.id } }));
      }

      // Extract mentions and send notifications
      const extractMentionIds = (node: any, ids = new Set<string>()): Set<string> => {
        if (node.type === 'mention' && node.attrs?.id) {
          ids.add(node.attrs.id);
        }
        if (node.content) {
          node.content.forEach((child: any) => extractMentionIds(child, ids));
        }
        return ids;
      };

      const mentionedIds = Array.from(extractMentionIds(editorJson));
      if (mentionedIds.length > 0) {
        // Notifying other users goes through notify_users, which authorises the
        // recipient list server-side; a direct insert is no longer permitted.
        const { error: notifError } = await supabase.rpc("notify_users", {
          recipient_ids: mentionedIds,
          message: `${currentUser.name} mentioned you in an update on "${item.name}"`,
          board_id: item.board_id,
          item_id: item.id,
        });
        if (notifError) {
          reportMutationError(notifError, "Failed to send mention notifications", { table: "notifications" });
        } else {
          // Send Telegram alert asynchronously
          fetch('/api/telegram/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: mentionedIds,
              message: `💬 <b>New Mention</b>\n${escapeHtml(currentUser.name)} mentioned you in an update on <b>${escapeHtml(item.name)}</b>`,
            })
          }).catch(console.error);
          // Trigger local refresh for instant UI feedback
          window.dispatchEvent(new CustomEvent('notification-added'));
        }
      }
    } catch (error) {
      reportMutationError(error, "Failed to post update", { table: "updates", operation: "insert" });
      // Remove the optimistic entry on failure
      setUpdates((prev) => prev.filter((u) => u.id !== tempUpdate.id));
    }
    setIsSubmitting(false);
  };

  const handlePostReply = async (tempUpdate: Update, htmlBody: string, editorJson: any) => {
    setUpdates((prev) => [...prev, tempUpdate]);
    setReplyingToId(null);
    try {
      const { data, error } = await supabase
        .from("updates")
        .insert({
          item_id: item.id,
          parent_id: tempUpdate.parent_id,
          body: htmlBody,
          author_id: currentUser.id,
          author_name: currentUser.name,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setUpdates((prev) => prev.map((u) => (u.id === tempUpdate.id ? data : u)));
        window.dispatchEvent(new CustomEvent('update-added', { detail: { itemId: item.id } }));
      }
      
      const extractMentionIds = (node: any, ids = new Set<string>()): Set<string> => {
        if (node.type === 'mention' && node.attrs?.id) {
          ids.add(node.attrs.id);
        }
        if (node.content) {
          node.content.forEach((child: any) => extractMentionIds(child, ids));
        }
        return ids;
      };

      const mentionedIds = Array.from(extractMentionIds(editorJson));
      if (mentionedIds.length > 0) {
        const { error: notifError } = await supabase.rpc("notify_users", {
          recipient_ids: mentionedIds,
          message: `${currentUser.name} mentioned you in a reply on "${item.name}"`,
          board_id: item.board_id,
          item_id: item.id,
        });
        if (notifError) {
          reportMutationError(notifError, "Failed to send mention notifications", { table: "notifications" });
        } else {
          // Send Telegram alert asynchronously
          fetch('/api/telegram/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: mentionedIds,
              message: `💬 <b>New Mention</b>\n${escapeHtml(currentUser.name)} mentioned you in a reply on <b>${escapeHtml(item.name)}</b>`,
            })
          }).catch(console.error);
          window.dispatchEvent(new CustomEvent('notification-added'));
        }
      }
    } catch (err) {
      reportMutationError(err, "Failed to post reply", { table: "updates", operation: "insert" });
      setUpdates((prev) => prev.filter((u) => u.id !== tempUpdate.id));
    }
  };

  const handleDeleteUpdate = async (id: string) => {
    try {
      setUpdates(prev => prev.filter(u => u.id !== id && u.parent_id !== id));
      const { error } = await supabase.from('updates').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('update-deleted', { detail: { itemId: item.id } }));
      queryClient.invalidateQueries({ queryKey: queryKeys.itemUpdates(item.id) });
    } catch (err) {
      reportMutationError(err, "Failed to delete update", { table: "updates", operation: "delete" });
      queryClient.invalidateQueries({ queryKey: queryKeys.itemUpdates(item.id) });
    }
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
          <span key={col.id} className={`${bg} text-white text-xs font-medium px-2.5 py-1 rounded-full inline-flex items-center`}>
            {displayStatus(t, value as string)}
          </span>
        );
      }

      if (col.type === "timeline" && value?.start && value?.end) {
        const startDate = new Date(value.start).toLocaleDateString(bcp47, {month: 'short', day: 'numeric'});
        const endDate = new Date(value.end).toLocaleDateString(bcp47, {month: 'short', day: 'numeric'});
        const displayDate = startDate === endDate ? startDate : `${startDate} - ${endDate}`;
        
        return (
          <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-full inline-flex items-center">
            {displayColumnTitle(t, col.title)}: {displayDate}
          </span>
        );
      }

      if (col.type === "people" && Array.isArray(value)) {
        const validIds = value.filter(Boolean);
        if (validIds.length === 0) return null;
        
        return (
          <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 pl-2.5 pr-1.5 py-1 rounded-full inline-flex items-center gap-1.5">
            <span className="text-[11px] font-medium">{displayColumnTitle(t, col.title)}:</span>
            <div className="flex gap-0.5">
              {validIds.slice(0, 3).map((id) => {
                const u = getAuthorUser(id);
                const bgColor = u.color && u.color.trim() !== '' ? u.color : '#6b7280';
                return (
                  <div key={id} className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] shrink-0 shadow-sm" style={{ backgroundColor: bgColor }} title={u.name}>
                    {u.avatar || '?'}
                  </div>
                )
              })}
              {validIds.length > 3 && <span className="text-[9px] pl-1 font-medium flex items-center">+{validIds.length - 3}</span>}
            </div>
          </span>
        );
      }

      if (col.type === "dependency" && Array.isArray(value)) {
        const validIds = value.filter(Boolean);
        if (validIds.length === 0) return null;

        const depNames = validIds.map(id => {
          const depItem = boardItems.find(i => i.id === id);
          return depItem ? depItem.name : "Unknown Item";
        });

        return (
          <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-full max-w-[200px] truncate inline-flex items-center">
            <TruncatedText className="truncate block">{displayColumnTitle(t, col.title)}: {depNames.join(", ")}</TruncatedText>
          </span>
        );
      }

      return (
        <span key={col.id} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-full inline-flex items-center">
          {displayColumnTitle(t, col.title)}: {displayCellLabel(t, col.type, String(value))}
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
        avatar_url: p.avatar_url,
      };
    }
    return {
      name: "Unknown",
      avatar: "??",
      color: "#6b7280",
      avatar_url: undefined,
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
      <div 
        ref={panelRef}
        className="fixed top-0 right-0 h-full max-w-[90vw] bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col panel-slide-in"
        style={{ width: panelWidth }}
      >
        {/* Resize Handle */}
        <div 
          className="absolute left-[-4px] top-0 bottom-0 w-3 cursor-col-resize z-[60] flex justify-center group/resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        >
          <div className={`w-[2px] h-full transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent group-hover/resizer:bg-blue-400'}`} />
        </div>

        {/* ===== HEADER ===== */}
        <div className="border-b border-gray-200 dark:border-slate-600 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 pr-4 leading-snug break-words">{item.name}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 px-6 shrink-0">
          <button 
            className="py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors flex items-center border-blue-500 text-blue-600 dark:text-blue-400"
          >
            <MessageSquare size={16} className="mr-2" /> Updates {updates.length > 0 && `(${updates.length})`}
          </button>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <>
            {/* ---- COMPOSER ---- */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
              {/* User identification */}
              <div className="flex items-center space-x-3 mb-3">
                {currentUser.avatar_url ? (
                  <img src={currentUser.avatar_url} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ backgroundColor: currentUser.color }}
                  >
                    {currentUser.avatar}
                  </div>
                )}
                <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{currentUser.name}</span>
              </div>

              {/* TipTap Editor */}
              <div className="border border-gray-200 dark:border-slate-600 rounded-lg focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all flex flex-col">
                <EditorContent editor={editor} className="flex-1 rounded-t-lg" />
                <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/50 px-3 py-2 border-t border-gray-200 dark:border-slate-600 rounded-b-lg">
                  <BottomToolbar editor={editor} requestPrompt={requestPrompt} />
                  <button
                    onClick={handlePostUpdate}
                    disabled={isSubmitting || !editor || isEditorEmpty}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm dark:shadow-none"
                  >
                    {t("panel.update")}
                  </button>
                </div>
              </div>
            </div>

            {/* ---- UPDATES FEED ---- */}
            <div className="flex-1 overflow-y-auto">
              {loadingUpdates ? (
                <ItemPanelSkeleton />
              ) : updates.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <MessageSquare size={32} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 dark:text-gray-500 text-sm">No updates yet.</p>
                  <p className="text-gray-300 text-xs mt-1">Be the first to post an update!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(() => {
                    const topLevelUpdates = updates.filter(u => !u.parent_id);
                    const repliesMap = new Map<string, Update[]>();
                    updates.forEach(u => {
                      if (u.parent_id) {
                        if (!repliesMap.has(u.parent_id)) repliesMap.set(u.parent_id, []);
                        repliesMap.get(u.parent_id)!.push(u);
                      }
                    });

                    return topLevelUpdates.map((update) => {
                      const author = getAuthorUser(update.author_id);
                      const isOwner = currentUser.id === update.author_id;
                      const replies = repliesMap.get(update.id) || [];

                      return (
                        <div key={update.id} className="px-6 py-5 group">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-3">
                              {author.avatar_url ? (
                                <img src={author.avatar_url} alt={author.name} className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                                  style={{ backgroundColor: author.color }}
                                >
                                  {author.avatar}
                                </div>
                              )}
                              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                {update.author_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center">
                                <Clock size={12} className="mr-1" />
                                {format(new Date(update.created_at), "MMM d, yyyy 'at' h:mm a")}
                              </span>
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteUpdate(update.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                                  title={t("panel.deleteUpdate")}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none ml-11 text-gray-700 dark:text-gray-300"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(update.body) }}
                          />

                          <div className="ml-11 mt-3 flex items-center">
                            <button
                              onClick={() => setReplyingToId(update.id)}
                              className="text-xs font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 flex items-center transition-colors"
                            >
                              <Reply size={14} className="mr-1" /> Reply
                            </button>
                          </div>

                          {/* Replies Section */}
                          {replies.length > 0 && (
                            <div className="ml-11 mt-4 space-y-4 border-l-2 border-gray-100 dark:border-slate-800 pl-4">
                              {replies.map(reply => {
                                const replyAuthor = getAuthorUser(reply.author_id);
                                const isReplyOwner = currentUser.id === reply.author_id;
                                return (
                                  <div key={reply.id} className="group/reply">
                                    <div className="flex items-start justify-between mb-1">
                                      <div className="flex items-center space-x-2">
                                        {replyAuthor.avatar_url ? (
                                          <img src={replyAuthor.avatar_url} alt={replyAuthor.name} className="w-6 h-6 rounded-full object-cover" />
                                        ) : (
                                          <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                                            style={{ backgroundColor: replyAuthor.color }}
                                          >
                                            {replyAuthor.avatar}
                                          </div>
                                        )}
                                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                                          {reply.author_name}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center">
                                          <Clock size={10} className="mr-1" />
                                          {format(new Date(reply.created_at), "MMM d, h:mm a")}
                                        </span>
                                        {isReplyOwner && (
                                          <button
                                            onClick={() => handleDeleteUpdate(reply.id)}
                                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover/reply:opacity-100 transition-all"
                                            title={t("panel.deleteReply")}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div
                                      className="prose prose-sm dark:prose-invert max-w-none ml-8 text-gray-600 dark:text-gray-400 text-sm"
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(reply.body) }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Reply Composer */}
                          {replyingToId === update.id && (
                            <div className="ml-11">
                              <ReplyComposer 
                                parentId={update.id} 
                                itemId={item.id} 
                                profiles={profiles} 
                                currentUser={currentUser} 
                                requestPrompt={requestPrompt} 
                                onCancel={() => setReplyingToId(null)}
                                onPostReply={handlePostReply}
                              />
                            </div>
                          )}

                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </>
        </div>
      </div>
      {PromptComponent}
    </>
  );
}
