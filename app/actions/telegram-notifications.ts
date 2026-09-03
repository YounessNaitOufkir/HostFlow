"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { translate, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Sends a Telegram notification to a list of users, provided they have linked their Telegram account
 * and have notifications enabled.
 * 
 * @param userIds List of HostFlow user IDs to notify
 * @param message The HTML-formatted message, or a function handed each
 *                recipient's own locale so the message can be written in it.
 */
export async function notifyUsersViaTelegram(
  userIds: string[],
  message: string | ((locale: Locale) => string),
) {
  if (!userIds || userIds.length === 0) return;

  try {
    const supabase = createAdminClient();

    // Fetch the profiles to check who has Telegram enabled and linked
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled, language")
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
        // The tip is ours, so it is written in the recipient's language rather
        // than the sender's - a French colleague mentioning an English one must
        // not send them French. <i>, not _italics_: parse_mode is "HTML".
        const locale: Locale = isLocale(p.language) ? p.language : DEFAULT_LOCALE;
        const body = typeof message === "function" ? message(locale) : message;
        const finalMessage = `${body}

<i>${translate(locale, "tg.tip")}</i>`;
        return sendTelegramMessage(p.telegram_chat_id!, finalMessage);
      })
    );
  } catch (err) {
    console.error("[notifyUsersViaTelegram] Unexpected error:", err);
  }
}
