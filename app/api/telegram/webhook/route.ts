import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyDeepLinkToken, sendTelegramMessage } from "@/lib/telegram";

// ─── Telegram Update Types (subset we care about) ───────────────
interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ─── Webhook Secret Validation ──────────────────────────────────
// Telegram allows setting a secret_token when registering the webhook.
// If set, every request includes an X-Telegram-Bot-Api-Secret-Token header.
function validateTelegramSecret(request: Request): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return true; // No secret configured → skip check
  const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return headerSecret === expectedSecret;
}

// ─── POST Handler ───────────────────────────────────────────────
export async function POST(request: Request) {
  // Optional: validate Telegram's webhook secret header
  if (!validateTelegramSecret(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const update: TelegramUpdate = await request.json();

    // We only handle text messages
    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    // ── Handle /start <token> (deep link onboarding) ──────────
    if (text.startsWith("/start ")) {
      const token = text.slice("/start ".length).trim();

      if (!token) {
        await sendTelegramMessage(
          chatId,
          "❌ Invalid link. Please use the Connect button in your HostFlow profile settings."
        );
        return NextResponse.json({ ok: true });
      }

      // Verify the HMAC-signed token
      const userId = verifyDeepLinkToken(token);

      if (!userId) {
        await sendTelegramMessage(
          chatId,
          "❌ This link has expired or is invalid. Please generate a new one from your HostFlow profile settings."
        );
        return NextResponse.json({ ok: true });
      }

      // Link the Telegram chat_id to the HostFlow user profile
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          telegram_chat_id: chatId,
          telegram_notifications_enabled: true,
        })
        .eq("id", userId);

      if (error) {
        console.error("[Telegram Webhook] Supabase update error:", error);

        if (error.code === "23505") {
          // Unique constraint violation — this Telegram account is already linked
          await sendTelegramMessage(
            chatId,
            "⚠️ This Telegram account is already linked to another HostFlow profile. Please unlink it first."
          );
        } else {
          await sendTelegramMessage(
            chatId,
            "❌ Something went wrong while linking your account. Please try again."
          );
        }

        return NextResponse.json({ ok: true });
      }

      // Fetch the user's name for a personalized message
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const userName = profile?.full_name || "there";

      await sendTelegramMessage(
        chatId,
        `✅ <b>Telegram Connected!</b>\n\n` +
          `Hey ${userName}, your Telegram account is now linked to HostFlow.\n\n` +
          `You will receive:\n` +
          `📋 <b>Daily morning digests</b> of tasks due today\n` +
          `⚡ <b>Instant alerts</b> for overdue tasks and assignments\n\n` +
          `You can manage your notification preferences in HostFlow → Profile Settings → Notifications.`
      );

      return NextResponse.json({ ok: true });
    }

    // ── Handle plain /start (no token) ────────────────────────
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to HostFlow Alerts!</b>\n\n` +
          `To link your account, go to your HostFlow app → Profile Settings → Notifications and click <b>"Connect Telegram"</b>.\n\n` +
          `That button will bring you back here and link everything automatically!`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Handle /help ──────────────────────────────────────────
    if (text === "/help") {
      await sendTelegramMessage(
        chatId,
        `ℹ️ <b>HostFlow Alerts Bot</b>\n\n` +
          `This bot sends you task notifications from HostFlow.\n\n` +
          `<b>Commands:</b>\n` +
          `/start — Link your account\n` +
          `/status — Check your connection status\n` +
          `/help — Show this help message`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Handle /status ────────────────────────────────────────
    if (text === "/status") {
      const supabase = createAdminClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, telegram_notifications_enabled")
        .eq("telegram_chat_id", chatId)
        .single();

      if (profile) {
        const status = profile.telegram_notifications_enabled
          ? "🟢 Enabled"
          : "🔴 Disabled";
        await sendTelegramMessage(
          chatId,
          `📊 <b>Connection Status</b>\n\n` +
            `Account: ${profile.full_name}\n` +
            `Notifications: ${status}`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `⚠️ Your Telegram account is not linked to any HostFlow profile.\n\n` +
            `Go to HostFlow → Profile Settings → Notifications → <b>Connect Telegram</b>.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── Unrecognized message ──────────────────────────────────
    await sendTelegramMessage(
      chatId,
      `I'm a notification bot — I send you task alerts from HostFlow.\n\nType /help for available commands.`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true });
  }
}

// ─── GET Handler (health check) ─────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: "ok",
    bot: "HostFlow Alerts",
    timestamp: new Date().toISOString(),
  });
}
