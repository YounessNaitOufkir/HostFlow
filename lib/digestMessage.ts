import { escapeHtml, TELEGRAM_MAX_MESSAGE_CHARS } from "@/lib/telegram";

/**
 * Builds the daily digest message.
 *
 * Extracted from the cron route so it can be tested: the bug that made this
 * necessary — "Bad Request: message is too long" — is a property of the produced
 * string, and a route handler that talks to Supabase and Telegram is a poor place
 * to assert one.
 *
 * Three things this has to get right, all of which the inline version got wrong:
 *
 * 1. **Length.** Telegram rejects anything over 4096 characters outright. A real
 *    backlog blew straight past it: 201 due/overdue tasks came to roughly 6,300
 *    characters, so nothing was delivered at all.
 * 2. **Markup.** sendTelegramMessage sends parse_mode "HTML", but the message was
 *    written in Markdown, so `*Your Daily Digest*` arrived with literal asterisks.
 * 3. **Escaping.** Task names are user data. An unescaped "<" or "&" makes Telegram
 *    reject the message with a parse error and the notification is lost silently.
 *
 * A digest is a summary, so long sections are capped and counted rather than
 * listed in full — nobody reads two hundred lines in a chat window.
 */

/** How many task names to list per section before summarising the remainder. */
export const MAX_ITEMS_PER_SECTION = 12;

/** Longest single task name to show, before an ellipsis. */
export const MAX_NAME_CHARS = 80;

/**
 * Budget for this message. Below Telegram's hard limit because
 * notifyUsersViaTelegram appends a short tip line after we return.
 */
export const DIGEST_CHAR_BUDGET = TELEGRAM_MAX_MESSAGE_CHARS - 300;

export interface DigestTask {
  name: string;
}

function renderName(name: string): string {
  const trimmed =
    name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name;
  return escapeHtml(trimmed);
}

function section(title: string, emoji: string, tasks: DigestTask[]): string {
  if (tasks.length === 0) return "";

  const shown = tasks.slice(0, MAX_ITEMS_PER_SECTION);
  const remaining = tasks.length - shown.length;

  const lines = shown.map((t) => `• ${renderName(t.name)}`);
  if (remaining > 0) {
    lines.push(`<i>…and ${remaining} more</i>`);
  }

  return `${emoji} <b>${title} (${tasks.length})</b>\n${lines.join("\n")}\n\n`;
}

export function buildDigestMessage(dueToday: DigestTask[], overdue: DigestTask[]): string {
  const total = dueToday.length + overdue.length;

  let message = `📋 <b>Your Daily HostFlow Digest</b>\n`;
  message += `You have ${total} task${total === 1 ? "" : "s"} needing attention:\n\n`;
  message += section("Due Today", "🚨", dueToday);
  message += section("Overdue", "⚠️", overdue);

  message = message.trimEnd();

  // Belt and braces: the caps above make this unreachable for realistic data, but
  // a single pathological name should degrade to a shorter message, never to a
  // rejected one.
  if (message.length > DIGEST_CHAR_BUDGET) {
    message = `${message.slice(0, DIGEST_CHAR_BUDGET - 1)}…`;
  }

  return message;
}
