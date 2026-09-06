/**
 * Which single channel one reader's daily digest goes to.
 *
 * The digest has been wrong in both directions. It was Telegram-only while its
 * setting named no channel, so everyone without Telegram silently got nothing;
 * then it fanned out to every channel at once, so anyone with both got the same
 * digest twice. The reader was never asked. Now they are, and the answer is
 * exactly one channel.
 *
 * This is a pure function so the rule can be tested without a cron, a database
 * or a mail provider — the decision is the part that has been wrong twice, not
 * the sending.
 */

export type DigestChannel = "email" | "telegram";

/** Only the fields the decision reads. */
export interface DigestRecipient {
  digest_channel?: string | null;
  email?: string | null;
  telegram_chat_id?: string | null;
  telegram_notifications_enabled?: boolean | null;
}

export type DigestDelivery =
  | { via: "telegram" }
  /** `fallback` when Telegram was chosen but is not usable. */
  | { via: "email"; fallback: boolean }
  | { via: "none"; reason: "no-telegram-and-no-email" | "no-email" };

/** What the column holds when it holds something meaningful. */
export function isDigestChannel(value: unknown): value is DigestChannel {
  return value === "email" || value === "telegram";
}

/**
 * Telegram needs three things at once, and the pair is easy to half-satisfy: a
 * chat id from connecting the bot, and the master switch that /stop turns off.
 * Someone who has stopped the bot has said they want no Telegram, so their
 * digest must not go there whatever the digest preference says.
 */
export function telegramIsUsable(recipient: DigestRecipient): boolean {
  return Boolean(
    recipient.telegram_chat_id && recipient.telegram_notifications_enabled
  );
}

/**
 * The one channel this digest is sent on.
 *
 * Email is the fallback rather than silence: choosing Telegram and then
 * disconnecting it should not quietly end the digest, which is the exact
 * failure this whole change exists to stop. The caller is told it fell back so
 * the settings screen can say so instead of looking like it ignored the choice.
 */
export function digestDeliveryFor(recipient: DigestRecipient): DigestDelivery {
  const wanted: DigestChannel = isDigestChannel(recipient.digest_channel)
    ? recipient.digest_channel
    : "email"; // also covers a row written before the column existed

  if (wanted === "telegram") {
    if (telegramIsUsable(recipient)) return { via: "telegram" };
    if (recipient.email) return { via: "email", fallback: true };
    return { via: "none", reason: "no-telegram-and-no-email" };
  }

  if (recipient.email) return { via: "email", fallback: false };
  return { via: "none", reason: "no-email" };
}
