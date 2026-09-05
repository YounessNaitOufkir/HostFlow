/**
 * The HTML shell every outgoing HostFlow email shares.
 *
 * Written as tables with inline styles on purpose. Gmail strips <style> blocks,
 * Outlook renders through Word and supports neither flexbox nor grid, and no
 * client can be relied on for <svg> — so the mark ships as a hosted PNG and the
 * layout is 2005-era HTML. This is the format that actually arrives intact.
 *
 * Every caller-supplied value is escaped: item and board names are user input,
 * and they were previously interpolated raw into the message body.
 */

import { format } from "date-fns";
import { enUS, fr as frDateFns } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { parseDateOnly } from "@/lib/gantt/dates";
import type { Locale as AppLocale } from "@/lib/i18n";

const DATE_LOCALES: Record<AppLocale, DateFnsLocale> = { en: enUS, fr: frDateFns };

/** Brand, matching components/ui/Logo.tsx and public/icon.svg. */
const NAVY = "#1A2C5B";
const AMBER = "#F5A623";
const RED = "#D93025";
const INK = "#1f2430";
const MUTED = "#6b7280";
const HAIRLINE = "#e4e6ec";
const GROUND = "#f4f5f7";

/*
 * Single quotes around the family name, not double. These stacks are written
 * into style="..." attributes, and a double quote there closes the attribute:
 * the rest of the declarations become stray tag attributes and the whole rule
 * is silently dropped. Caught by the render test below.
 */
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export type EmailAccent = "amber" | "red";

const ACCENTS: Record<EmailAccent, string> = { amber: AMBER, red: RED };

export interface EmailDetail {
  label: string;
  value: string;
}

export interface EmailOptions {
  /** Sits under the subject in the inbox list. Never rendered in the body. */
  preheader: string;
  heading: string;
  /** Already translated by the caller — this module holds no dictionary. */
  greeting?: string;
  /** Sentences of the message. Plain text; markup is escaped. */
  paragraphs: string[];
  /** The label/value block — board, due date, status. */
  details?: EmailDetail[];
  accent?: EmailAccent;
  cta?: { label: string; href: string };
  /** Why this landed in their inbox. */
  footerNote?: string;
}

/**
 * The app's public origin, without a trailing slash.
 *
 * NEXT_PUBLIC_ is readable on the server too, so the cron routes that actually
 * send these emails resolve it the same way the browser would.
 */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/**
 * A link that opens one item in context.
 *
 * The app is a single page with no router, so the board and item travel as
 * query parameters and lib/deepLink.ts hands them to navigateToItem on load.
 */
export function itemUrl(boardId: string, itemId: string): string {
  const params = new URLSearchParams({ board: boardId, item: itemId });
  return `${appUrl()}/?${params.toString()}`;
}

/**
 * A yyyy-MM-dd value written the way the reader writes dates.
 *
 * Goes through parseDateOnly rather than new Date(): the latter reads a bare
 * date as UTC midnight and renders the day before west of Greenwich.
 */
export function formatEmailDate(value: string, locale: AppLocale): string {
  const date = parseDateOnly(value);
  if (!date) return value;
  return format(date, "d MMMM yyyy", { locale: DATE_LOCALES[locale] });
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds both representations at once so they cannot drift. A client that
 * blocks images or prefers text still gets the whole message, the link
 * included.
 */
export function renderEmail(options: EmailOptions): { html: string; text: string } {
  const accent = ACCENTS[options.accent ?? "amber"];
  const logo = `${appUrl()}/email-logo.png`;

  const greeting = options.greeting
    ? `<p style="margin:0 0 12px;font:400 15px/1.55 ${FONT};color:${INK};">${escapeHtml(
        options.greeting
      )}</p>`
    : "";

  const body = options.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font:400 15px/1.55 ${FONT};color:${INK};">${escapeHtml(p)}</p>`
    )
    .join("");

  const details = options.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="margin:20px 0;border-left:3px solid ${accent};background:${GROUND};border-radius:4px;">
         <tr><td style="padding:14px 16px;">
           ${options.details
             .map(
               (d) =>
                 `<div style="margin:0 0 6px;font:400 13px/1.5 ${FONT};color:${MUTED};">
                    ${escapeHtml(d.label)}:
                    <span style="color:${INK};font-weight:600;">${escapeHtml(d.value)}</span>
                  </div>`
             )
             .join("")}
         </td></tr>
       </table>`
    : "";

  // A table rather than a styled <a>: Outlook ignores padding on inline
  // elements, which would collapse the button to bare text.
  const cta = options.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
         <tr><td align="center" bgcolor="${NAVY}" style="border-radius:6px;">
           <a href="${escapeHtml(options.cta.href)}"
              style="display:inline-block;padding:11px 22px;font:600 15px/1 ${FONT};
                     color:#ffffff;text-decoration:none;border-radius:6px;">
             ${escapeHtml(options.cta.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  const footer = options.footerNote
    ? `<p style="margin:0;font:400 12px/1.5 ${FONT};color:${MUTED};">${escapeHtml(
        options.footerNote
      )}</p>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:${GROUND};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    options.preheader
  )}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${GROUND};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
             style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:8px;">
        <tr><td style="background:${NAVY};padding:18px 24px;border-radius:8px 8px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><img src="${logo}" width="40" height="40" alt="HostFlow"
                       style="display:block;border:0;border-radius:8px;"></td>
              <td style="padding-left:12px;font:700 18px/1 ${FONT};color:#ffffff;">HostFlow</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 24px 24px;">
          <h1 style="margin:0 0 16px;font:700 20px/1.3 ${FONT};color:${INK};">${escapeHtml(
            options.heading
          )}</h1>
          ${greeting}${body}${details}${cta}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid ${HAIRLINE};background:#fafbfc;border-radius:0 0 8px 8px;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    options.heading,
    "",
    options.greeting ?? "",
    ...options.paragraphs,
    "",
    ...(options.details ?? []).map((d) => `${d.label}: ${d.value}`),
    "",
    options.cta ? `${options.cta.label}: ${options.cta.href}` : "",
    "",
    options.footerNote ?? "",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n")
    .trim();

  return { html, text };
}
