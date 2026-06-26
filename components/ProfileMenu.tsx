"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Settings, User, Shield } from "lucide-react";
import { Profile } from "@/types";

interface ProfileMenuProps {
  profile: Profile;
  onSignOut: () => void;
  onOpenAdmin: () => void;
}

export default function ProfileMenu({ profile, onSignOut, onOpenAdmin }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
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

  return (
    <div className="relative" ref={menuRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        title={profile.full_name}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shadow-md cursor-pointer ring-2 ring-transparent hover:ring-white/50 transition-all select-none"
        style={{ backgroundColor: profile.color }}
      >
        {profile.avatar_initials}
      </div>

      {isOpen && (
        <div className="absolute left-full ml-4 bottom-0 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-gray-100 dark:border-slate-700">
            <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{profile.full_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{profile.email}</p>
          </div>
          <div className="p-2 space-y-1">
            {profile.role === "admin" && (
              <div 
                onClick={() => { setIsOpen(false); onOpenAdmin(); }}
                className="flex items-center px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md cursor-pointer transition-colors font-medium"
              >
                <Shield size={16} className="mr-3" />
                Admin Settings
              </div>
            )}
            <div 
              onClick={() => { setIsOpen(false); alert("My Profile features coming soon!"); }}
              className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
            >
              <User size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
              My Profile
            </div>
            <div 
              onClick={() => { setIsOpen(false); alert("Settings features coming soon!"); }}
              className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
            >
              <Settings size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
              Settings
            </div>
            <div 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
            >
              {theme === 'dark' ? (
                <Sun size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
              ) : (
                <Moon size={16} className="mr-3 text-gray-400 dark:text-gray-400" />
              )}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </div>
          </div>
          <div className="p-2 border-t border-gray-100 dark:border-slate-700">
            <div 
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="flex items-center px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md cursor-pointer transition-colors"
            >
              <LogOut size={16} className="mr-3" />
              Log out
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
