import { renderEmail, appUrl, type EmailSection } from "@/lib/emailTemplate";
import { translate, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { MAX_ITEMS_PER_SECTION, MAX_NAME_CHARS, type DigestTask } from "@/lib/digestMessage";

/**
 * The daily digest, as an email.
 *
 * The digest was Telegram-only, and nothing said so: the setting reads "A
 * morning summary of what is due today" and names no channel, while the cron
 * additionally required telegram_notifications_enabled and a chat id. Everyone
 * who had switched the digest on without connecting Telegram received nothing,
 * every morning, with no indication why.
 *
 * This deliberately mirrors buildDigestMessage rather than inventing a second
 * voice: same sections, same order, same caps, same translations. The two
 * channels must not disagree about what is due — a reader with both should see
 * one digest twice, not two digests.
 *
 * The caps are the reason this shares MAX_ITEMS_PER_SECTION with Telegram even
 * though email has no 4096-character limit. A digest is a summary; a mail
 * listing two hundred tasks is not read either.
 */

function line(task: DigestTask): string {
  const name =
    task.name.length > MAX_NAME_CHARS
      ? `${task.name.slice(0, MAX_NAME_CHARS - 1)}…`
      : task.name;
  const property = task.workspace?.trim();
  // The property is what distinguishes otherwise identical lines: every
  // apartment runs the same lifecycle, so the same task name recurs verbatim
  // across properties. renderEmail escapes it, so nothing is escaped here.
  return property ? `${name} — ${property}` : name;
}

function section(
  title: string,
  tasks: DigestTask[],
  locale: Locale,
  accent: "amber" | "red"
): EmailSection | null {
  if (tasks.length === 0) return null;

  const shown = tasks.slice(0, MAX_ITEMS_PER_SECTION);
  const lines = shown.map(line);
  const remaining = tasks.length - shown.length;
  if (remaining > 0) {
    lines.push(translate(locale, "digest.more", { count: remaining }));
  }

  return { title: `${title} (${tasks.length})`, lines, accent };
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildDigestEmail(
  dueToday: DigestTask[],
  overdue: DigestTask[],
  locale: Locale = DEFAULT_LOCALE,
  recipientName?: string | null
): DigestEmail {
  const total = dueToday.length + overdue.length;
  const tr = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate(locale, key, vars);

  const sections = [
    section(tr("digest.dueToday"), dueToday, locale, "amber"),
    section(tr("digest.overdue"), overdue, locale, "red"),
  ].filter((s): s is EmailSection => s !== null);

  const { html, text } = renderEmail({
    preheader:
      total === 1 ? tr("digest.introOne") : tr("digest.intro", { count: total }),
    heading: tr("digest.title"),
    greeting: recipientName ? tr("email.greeting", { name: recipientName }) : undefined,
    paragraphs: [
      total === 1 ? tr("digest.introOne") : tr("digest.intro", { count: total }),
    ],
    sections,
    // Red only when overdue is all there is; a day with work due today as well
    // should not read as an emergency.
    accent: dueToday.length === 0 ? "red" : "amber",
    cta: { label: tr("digest.openBoard"), href: appUrl() },
    footerNote: tr("digest.footer"),
  });

  return {
    subject:
      total === 1
        ? tr("digest.subjectOne")
        : tr("digest.subject", { count: total }),
    html,
    text,
  };
}
