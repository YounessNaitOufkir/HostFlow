import { NextResponse } from "next/server";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";
import { createClient } from "@/lib/supabase/server";
import { escapeHtml } from "@/lib/telegram";
import { translate, type Locale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/types";

/**
 * The alerts a client may ask for, and the sentence each one sends.
 *
 * The caller names a kind rather than supplying the text. Two reasons: the
 * message has to be written in each RECIPIENT's language, which only the server
 * knows, and the previous contract let any signed-in user post arbitrary HTML
 * to any other user's Telegram.
 */
export const KINDS: Record<string, { title: TranslationKey; body: TranslationKey }> = {
  "mention.update": { title: "tg.mentionTitle", body: "tg.mentionUpdate" },
  "mention.reply": { title: "tg.mentionTitle", body: "tg.mentionReply" },
  // Missing until now, which is what silently killed assignment alerts: the
  // caller in useItemMutations was never moved onto this contract when the
  // route stopped accepting caller-written text, so it kept posting `message`
  // and got a 400 every time. A 400 is a resolved fetch, so its .catch() never
  // ran and nothing was logged on either side.
  assignment: { title: "tg.assignmentTitle", body: "tg.assignment" },
};

/** Values a caller may interpolate. Escaped, and capped so a name cannot flood a chat. */
const MAX_VAR_CHARS = 200;

/** A mention names a handful of people, never a mailing list. */
const MAX_RECIPIENTS = 25;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userIds, kind, vars } = body;

    if (!userIds || !Array.isArray(userIds) || typeof kind !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const template = KINDS[kind];
    if (!template) {
      return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
    }

    if (userIds.length === 0 || userIds.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: "Invalid recipient list" }, { status: 400 });
    }

    // Who the CALLER is allowed to notify.
    //
    // The kind allowlist stopped a caller writing the message, but not choosing
    // the reader: any signed-in account could name any user id and ring a
    // stranger's phone. user_directory is already scoped to the people you share
    // a workspace or board with, and this reads it as the caller rather than as
    // the service role, so the database decides the answer rather than this
    // route re-deriving it.
    const { data: reachable, error: reachError } = await supabase
      .from("user_directory")
      .select("id")
      .in("id", userIds);

    if (reachError) {
      console.error("[Telegram Notify API] recipient check failed:", reachError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    // Silently dropping the rest rather than failing: a mention of somebody who
    // has since left the workspace should still notify everyone else named.
    const allowedIds = (reachable ?? []).map((r: { id: string }) => r.id);
    if (allowedIds.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const safeVars: Record<string, string> = {};
    for (const [name, value] of Object.entries(vars ?? {})) {
      safeVars[name] = escapeHtml(String(value).slice(0, MAX_VAR_CHARS));
    }
    // The task is what the reader is being sent to look at, so it carries the
    // emphasis - after escaping, never before.
    if (safeVars.item) safeVars.item = `<b>${safeVars.item}</b>`;

    // Built per recipient, so a French colleague mentioning an English one
    // sends English - the reader's language decides, not the writer's.
    await notifyUsersViaTelegram(allowedIds, (locale: Locale) => {
      const title = translate(locale, template.title);
      const icon = kind === "assignment" ? "🔔" : "💬";
      return `${icon} <b>${title}</b>\n${translate(locale, template.body, safeVars)}`;
    });

    return NextResponse.json({ success: true, notified: allowedIds.length });
  } catch (error) {
    console.error("[Telegram Notify API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
