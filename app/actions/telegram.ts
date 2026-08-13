"use server";

import { createClient } from "@/lib/supabase/server";
import { generateDeepLinkToken } from "@/lib/telegram";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

/**
 * Generates a Telegram deep link for the currently authenticated user.
 * Returns the full t.me URL that opens the bot with a signed /start token.
 */
export async function generateTelegramLink(): Promise<{
  url: string | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { url: null, error: "Not authenticated" };
    }

    if (!BOT_USERNAME) {
      return { url: null, error: "Telegram bot is not configured" };
    }

    const token = generateDeepLinkToken(user.id);
    const url = `https://t.me/${BOT_USERNAME}?start=${token}`;

    return { url, error: null };
  } catch (err) {
    console.error("[generateTelegramLink]", err);
    return { url: null, error: "Failed to generate link" };
  }
}

/**
 * Unlinks the current user's Telegram account by clearing their chat_id.
 */
export async function unlinkTelegram(): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: null,
        telegram_notifications_enabled: false,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[unlinkTelegram]", error);
      return { success: false, error: "Failed to unlink Telegram" };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error("[unlinkTelegram]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}
