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
const KINDS: Record<string, TranslationKey> = {
  "mention.update": "tg.mentionUpdate",
  "mention.reply": "tg.mentionReply",
};

/** Values a caller may interpolate. Escaped, and capped so a name cannot flood a chat. */
const MAX_VAR_CHARS = 200;

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

    const messageKey = KINDS[kind];
    if (!messageKey) {
      return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
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
    await notifyUsersViaTelegram(userIds, (locale: Locale) => {
      const title = translate(locale, "tg.mentionTitle");
      return `💬 <b>${title}</b>\n${translate(locale, messageKey, safeVars)}`;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Telegram Notify API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
