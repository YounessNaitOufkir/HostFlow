"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { translate, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Sends a Telegram notification to a list of users, provided they have linked their Telegram account
 * and have notifications enabled.
 * 
 * Returns what actually happened, because the caller cannot tell otherwise:
 * sendTelegramMessage reports an API rejection as { ok: false } rather than by
 * throwing, so a caller wrapping these in Promise.allSettled saw "fulfilled"
 * for every send whether or not Telegram accepted it. The daily digest reported
 * `failed: 0` runs in which nothing was delivered at all.
 *
 * @param userIds List of HostFlow user IDs to notify
 * @param message The HTML-formatted message, or a function handed each
 *                recipient's own locale so the message can be written in it.
 */
export interface TelegramFanOut {
  /** Recipients with Telegram linked and notifications on. */
  attempted: number;
  delivered: number;
  failed: number;
}

const NOTHING_SENT: TelegramFanOut = { attempted: 0, delivered: 0, failed: 0 };

export async function notifyUsersViaTelegram(
  userIds: string[],
  message: string | ((locale: Locale) => string),
): Promise<TelegramFanOut> {
  if (!userIds || userIds.length === 0) return NOTHING_SENT;

  try {
    const supabase = createAdminClient();

    // Fetch the profiles to check who has Telegram enabled and linked
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled, language")
      .in("id", userIds);

    if (error) {
      console.error("[notifyUsersViaTelegram] Supabase error:", error);
      return NOTHING_SENT;
    }

    if (!profiles) return NOTHING_SENT;

    // Filter profiles that can receive messages
    const eligibleProfiles = profiles.filter(
      (p) => p.telegram_chat_id && p.telegram_notifications_enabled
    );

    // Awaited: this resolves only once every send has completed. Callers must await
    // it in turn — a serverless route that returns first can be frozen before the
    // request to Telegram finishes. allSettled keeps one failure from losing the rest.
    const results = await Promise.allSettled(
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

    // A send that Telegram refused resolves with { ok: false }; only a thrown
    // error rejects. Both count as failures.
    const delivered = results.filter(
      (r) => r.status === "fulfilled" && r.value?.ok
    ).length;

    return {
      attempted: eligibleProfiles.length,
      delivered,
      failed: eligibleProfiles.length - delivered,
    };
  } catch (err) {
    console.error("[notifyUsersViaTelegram] Unexpected error:", err);
    return { attempted: userIds.length, delivered: 0, failed: userIds.length };
  }
}
