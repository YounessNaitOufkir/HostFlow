"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types";

interface GoogleCalendarConnectButtonProps {
  profile: Profile;
}

export default function GoogleCalendarConnectButton({ profile }: GoogleCalendarConnectButtonProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, [profile.id]);

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("google_refresh_token")
        .eq("user_id", profile.id)
        .single();

      if (data && data.google_refresh_token) {
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Failed to check Google Calendar connection", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    window.location.href = "/api/auth/google";
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await supabase
        .from("user_integrations")
        .update({
          google_access_token: null,
          google_refresh_token: null,
        })
        .eq("user_id", profile.id);
      
      setIsConnected(false);
    } catch (err) {
      console.error("Failed to disconnect", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <button disabled className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </button>
    );
  }

  if (isConnected) {
    return (
      <div className="w-full flex items-center justify-between p-3 rounded-lg border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
            <Check size={14} className="stroke-[3]" />
          </div>
          <span className="text-sm font-medium">Connected to Google Calendar</span>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-xs font-medium text-gray-500 hover:text-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
    >
      <Calendar size={18} />
      Connect Google Calendar
    </button>
  );
}
