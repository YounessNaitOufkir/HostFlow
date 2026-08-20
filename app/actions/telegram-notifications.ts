"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Sends a Telegram notification to a list of users, provided they have linked their Telegram account
 * and have notifications enabled.
 * 
 * @param userIds List of HostFlow user IDs to notify
 * @param message The markdown-formatted message to send
 */
export async function notifyUsersViaTelegram(userIds: string[], message: string) {
  if (!userIds || userIds.length === 0) return;

  try {
    const supabase = createAdminClient();

    // Fetch the profiles to check who has Telegram enabled and linked
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled")
      .in("id", userIds);

    if (error) {
      console.error("[notifyUsersViaTelegram] Supabase error:", error);
      return;
    }

    if (!profiles) return;

    // Filter profiles that can receive messages
    const eligibleProfiles = profiles.filter(
      (p) => p.telegram_chat_id && p.telegram_notifications_enabled
    );

    // Awaited: this resolves only once every send has completed. Callers must await
    // it in turn — a serverless route that returns first can be frozen before the
    // request to Telegram finishes. allSettled keeps one failure from losing the rest.
    await Promise.allSettled(
      eligibleProfiles.map((p) => {
        // We add a helpful tip at the end of the first few messages, but since this is generic,
        // we'll just send the message as is. We'll handle opt-out globally in the webhook.
        const finalMessage = `${message}\n\n_Tip: Type /stop to disable these alerts._`;
        return sendTelegramMessage(p.telegram_chat_id!, finalMessage);
      })
    );
  } catch (err) {
    console.error("[notifyUsersViaTelegram] Unexpected error:", err);
  }
}
