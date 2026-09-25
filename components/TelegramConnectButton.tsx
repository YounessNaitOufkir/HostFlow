"use client";

import React, { useState, useTransition } from "react";
import { Profile } from "@/types";
import { generateTelegramLink, unlinkTelegram } from "@/app/actions/telegram";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Unplug } from "lucide-react";
import { useT } from "@/components/LanguageProvider";

interface TelegramConnectButtonProps {
  profile: Profile;
  onProfileUpdated: () => void;
}

export default function TelegramConnectButton({
  profile,
  onProfileUpdated,
}: TelegramConnectButtonProps) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [isUnlinking, setIsUnlinking] = useState(false);

  const isConnected = !!profile.telegram_chat_id;

  const handleConnect = () => {
    startTransition(async () => {
      const { url, error } = await generateTelegramLink();

      if (error || !url) {
        toast.error(error || t("telegram.errGenerateLink"));
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
      toast.info(t("telegram.windowOpened"), { duration: 8000 });
    });
  };

  const handleDisconnect = () => {
    setIsUnlinking(true);
    startTransition(async () => {
      const { success, error } = await unlinkTelegram();

      if (error || !success) {
        toast.error(error || t("telegram.errUnlink"));
        setIsUnlinking(false);
        return;
      }

      toast.success(t("telegram.unlinked"));
      setIsUnlinking(false);
      onProfileUpdated();
    });
  };

  if (isConnected) {
    return (
      <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-green-600 dark:text-green-400"
              fill="currentColor"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-300">
              <CheckCircle2 size={15} aria-hidden />
              {t("telegram.connected")}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400/70">
              {t("telegram.connectedBody")}
            </p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={isPending || isUnlinking}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
        >
          {isUnlinking ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Unplug className="w-3 h-3" />
          )}
          {t("telegram.disconnect")}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold rounded-xl transition-colors disabled:opacity-60 shadow-sm"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="currentColor"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      )}
      {t("telegram.connect")}
    </button>
  );
}
