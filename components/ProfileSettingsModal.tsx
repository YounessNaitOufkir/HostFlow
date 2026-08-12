"use client";

import React, { useState, useRef } from "react";
import { Profile } from "@/types";
import { supabase } from "@/lib/supabase";
import { X, Upload, Loader2, Camera, Shield } from "lucide-react";
import { toast } from "sonner";

interface ProfileSettingsModalProps {
  profile: Profile;
  onClose: () => void;
  onProfileUpdated: () => void;
}

export default function ProfileSettingsModal({ profile, onClose, onProfileUpdated }: ProfileSettingsModalProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setError(null);
      
      const file = e.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `${profile.id}/avatar.${fileExt}`;

      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;
      
      onProfileUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', profile.id);

      if (error) throw error;
      
      onProfileUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#252849] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-white/[0.02]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Profile Settings</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full p-1 hover:bg-gray-200 dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div 
                className="w-24 h-24 rounded-full overflow-hidden shadow-md border-4 border-white dark:border-[#252849] flex items-center justify-center text-white text-3xl font-bold"
                style={{ backgroundColor: profile.color }}
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  profile.avatar_initials
                )}
              </div>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex flex-col items-center justify-center text-white cursor-pointer"
              >
                {uploading ? (
                  <Loader2 size={24} className="animate-spin text-white" />
                ) : (
                  <>
                    <Camera size={24} className="mb-1" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">Change</span>
                  </>
                )}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{profile.full_name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
              <div className="mt-1 inline-flex px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium capitalize border border-blue-100 dark:border-blue-500/20">
                {profile.role || "Member"}
              </div>
              {profile.role !== "admin" && profile.email?.toLowerCase() === "younessnaitoufkir@gmail.com" && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { error } = await supabase
                          .from("profiles")
                          .update({ role: "admin" })
                          .eq("id", profile.id);
                        if (error) {
                          const { error: rpcError } = await supabase.rpc("restore_my_admin");
                          if (rpcError) throw rpcError;
                        }
                        toast.success("Admin privileges restored successfully!");
                        setTimeout(() => window.location.reload(), 500);
                      } catch (err) {
                        toast.error("Failed to restore admin role.");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors shadow-sm"
                  >
                    <Shield size={12} />
                    Restore Admin Rights
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700/50">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="fullName">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !fullName.trim() || fullName === profile.full_name}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
