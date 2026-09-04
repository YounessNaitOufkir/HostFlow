"use client";

import React, { useState, useRef, useEffect } from "react";
import { useT } from "@/components/LanguageProvider";
import { notificationText } from "@/lib/notificationText";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { runWrite } from "@/lib/errorReporting";
import { Notification } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationsMenu({ userId, onNotificationClick }: { userId: string, onNotificationClick?: (boardId?: string, itemId?: string) => void }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userId) return;
    
    // Fetch initial
    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotifications(data);
    };

    fetchNotifications();

    // Subscribe
    const channel = supabase
      .channel("realtime-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        setNotifications((prev) => {
          if (prev.some(n => n.id === payload.new.id)) return prev;
          return [payload.new as Notification, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        setNotifications((prev) => prev.map(n => n.id === payload.new.id ? payload.new as Notification : n));
      })
      .subscribe();

    window.addEventListener('notification-added', fetchNotifications);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('notification-added', fetchNotifications);
    };
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    // Optimistic
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const ok = await runWrite(
      supabase.from("notifications").update({ read: true }).eq("id", id),
      "Could not mark the notification as read",
      { table: "notifications", operation: "update" }
    );
    // Put the dot back rather than showing it read and having it reappear later
    if (!ok) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const results = await Promise.all(
      unreadIds.map(id =>
        runWrite(
          supabase.from("notifications").update({ read: true }).eq("id", id),
          "Could not mark notifications as read",
          { table: "notifications", operation: "update" }
        )
      )
    );
    const failed = new Set(unreadIds.filter((_, i) => !results[i]));
    if (failed.size > 0) {
      setNotifications(prev =>
        prev.map(n => (failed.has(n.id) ? { ...n, read: false } : n))
      );
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-900/20 cursor-pointer text-gray-300 hover:text-white transition relative"
      >
        <Bell size={20} />
      {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-[#1A2C5B]"></span>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-full ml-4 bottom-0 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 z-50 max-h-96 flex flex-col"
          >
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Notifications</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  No notifications yet.
                </div>
              ) : (
                Array.from(new Map(notifications.map(n => [n.id, n])).values()).map((n) => (
                  <div 
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id);
                      if (onNotificationClick && (n.board_id || n.item_id)) {
                        onNotificationClick(n.board_id, n.item_id);
                        setIsOpen(false);
                      }
                    }}
                    className={`p-3 rounded-md transition-colors ${
                      n.read 
                        ? 'bg-transparent hover:bg-gray-50 dark:hover:bg-slate-700 opacity-75' 
                        : 'bg-blue-50 dark:bg-slate-700/50 hover:bg-blue-100 dark:hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                      {notificationText(t, n)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
