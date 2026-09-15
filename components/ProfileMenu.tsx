"use client";

import React, { useState, useRef, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, User, Shield, Type } from "lucide-react";
import { Profile } from "@/types";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/Tooltip";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useT } from "@/components/LanguageProvider";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileMenuProps {
  profile: Profile;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onOpenProfileSettings: () => void;
  onOpenReadability?: () => void;
}

export default function ProfileMenu({ profile, onSignOut, onOpenAdmin, onOpenProfileSettings, onOpenReadability }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRestoreAdmin = async () => {
    setIsOpen(false);
    try {
      // First try standard RLS self-update
      const { error } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", profile.id);
      if (error) {
        // Fallback to self-recovery RPC
        const { error: rpcError } = await supabase.rpc("restore_my_admin");
        if (rpcError) throw rpcError;
      }
      toast.success(t("profile.adminRestored"));
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error(t("profile.adminRestoreFailed"));
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Tooltip content={t("profile.profileAndSettings")} side="right" disabled={isOpen}>
      <div className="relative" ref={menuRef}>
        {/* Was a div: the trigger for the whole menu was unreachable by
            keyboard. */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={t("profile.profileAndSettings")}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shadow-md cursor-pointer ring-2 ring-transparent hover:ring-white/50 transition-all select-none overflow-hidden"
          style={{ backgroundColor: profile.color }}
      >
        <Avatar
          name={profile.full_name}
          initials={profile.avatar_initials}
          url={profile.avatar_url}
          color={profile.color}
          size={40}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            // Same reasoning as NotificationsMenu: this opens beside the rail,
            // which the shared useAnchoredMenu hook can't do (below/above
            // only), so the real fix is bounding the height to the viewport
            // rather than swapping the positioning approach.
            className="absolute left-full ml-4 bottom-0 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 z-50 max-h-[calc(100vh-32px)] overflow-y-auto"
          >
            <div className="p-4 border-b border-gray-100 dark:border-slate-700">
              <TruncatedText as="p" className="font-semibold text-gray-800 dark:text-gray-100 truncate">{profile.full_name}</TruncatedText>
              <TruncatedText as="p" className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{profile.email}</TruncatedText>
            </div>
            <div className="p-2 space-y-1">
              {profile.role === "admin" && (
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); onOpenAdmin(); }}
                  className="w-full text-left flex items-center px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md cursor-pointer transition-colors font-medium"
                >
                  <Shield size={16} className="mr-3" />
                  {t("profile.admin")}
                </button>
              )}
              {profile.role !== "admin" && profile.is_owner && (
                <button
                  type="button"
                  onClick={handleRestoreAdmin}
                  // amber-600/amber-400 → brand-amber: same drift already
                  // unified on the landing and login pages.
                  className="w-full text-left flex items-center px-3 py-2 text-sm text-amber-700 dark:text-brand-amber hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md cursor-pointer transition-colors font-semibold border border-amber-200 dark:border-amber-800/50 my-1"
                >
                  <Shield size={16} className="mr-3" />
                  {t("profile.restoreAdmin")}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setIsOpen(false); onOpenProfileSettings(); }}
                className="w-full text-left flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
              >
                <User size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
                {t("profile.myProfile")}
              </button>

              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full text-left flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
              >
                {theme === 'dark' ? (
                  <Sun size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
                ) : (
                  <Moon size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
                )}
                {theme === "dark" ? t("profile.lightMode") : t("profile.darkMode")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (onOpenReadability) onOpenReadability();
                  else window.dispatchEvent(new CustomEvent("open-readability"));
                }}
                className="w-full text-left flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
              >
                <Type size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
                {t("profile.readabilityFont")}
              </button>
            </div>
            <div className="p-2 border-t border-gray-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSignOut();
                }}
                className="w-full text-left flex items-center px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md cursor-pointer transition-colors"
              >
                <LogOut size={16} className="mr-3" />
                {t("profile.logOut")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </Tooltip>
  );
}
