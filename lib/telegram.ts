import crypto from "crypto";

// ─── Environment ────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const LINK_SECRET = process.env.TELEGRAM_LINK_SECRET || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Deep-Link Token (HMAC-signed) ─────────────────────────────

/**
 * Creates a signed deep-link token for a given HostFlow user ID.
 * Format: `hf_<userId>_<hmacSignature>`
 *
 * The HMAC prevents attackers from forging tokens to link
 * someone else's HostFlow account to their Telegram.
 */
export function generateDeepLinkToken(userId: string): string {
  if (!LINK_SECRET) {
    throw new Error("TELEGRAM_LINK_SECRET is not configured");
  }
  const signature = crypto
    .createHmac("sha256", LINK_SECRET)
    .update(userId)
    .digest("hex")
    .slice(0, 16); // 16 hex chars = 64 bits of entropy — sufficient for this use-case
  return `hf_${userId}_${signature}`;
}

/**
 * Verifies a deep-link token and extracts the HostFlow user ID.
 * Returns the userId if valid, or `null` if the token is forged/malformed.
 */
export function verifyDeepLinkToken(token: string): string | null {
  if (!LINK_SECRET) return null;

  const parts = token.split("_");
  // Expected format: ["hf", "<userId>", "<signature>"]
  if (parts.length < 3 || parts[0] !== "hf") return null;

  // userId may itself contain underscores (UUID format), so rejoin all middle parts
  const signature = parts[parts.length - 1];
  const userId = parts.slice(1, -1).join("_");

  const expectedSignature = crypto
    .createHmac("sha256", LINK_SECRET)
    .update(userId)
    .digest("hex")
    .slice(0, 16);

  // Timing-safe comparison to prevent timing attacks.
  //
  // The shape is checked before decoding, not just the length: "zzzzzzzzzzzzzzzz"
  // is sixteen characters but decodes to zero bytes, and timingSafeEqual throws
  // on a length mismatch rather than returning false. A malformed token has to
  // be rejected, not turned into a 500.
  if (!/^[0-9a-f]{16}$/i.test(signature)) return null;

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );

  return isValid ? userId : null;
}

// ─── Telegram Bot API Helpers ───────────────────────────────────

interface TelegramSendResult {
  ok: boolean;
  description?: string;
}

/**
 * Sends a text message to a Telegram chat via the Bot API.
 */
/**
 * Telegram rejects any sendMessage over 4096 characters with
 * "Bad Request: message is too long". The daily digest hit this the moment a user
 * had a real backlog: 201 due/overdue tasks came to roughly 6,300 characters.
 */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export { escapeHtml } from "@/lib/escapeHtml";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<TelegramSendResult> {
  if (!BOT_TOKEN) {
    console.error("[Telegram] BOT_TOKEN is not configured");
    return { ok: false, description: "BOT_TOKEN missing" };
  }

  // Last-resort guard. Callers should keep their own messages within budget, but a
  // message that is one character too long is rejected outright, and losing a
  // notification is worse than losing its tail.
  let safeText = text;
  if (safeText.length > TELEGRAM_MAX_MESSAGE_CHARS) {
    console.warn(
      `[Telegram] message of ${safeText.length} chars exceeds the ${TELEGRAM_MAX_MESSAGE_CHARS} limit; truncating.`
    );
    const notice = "\n\n… truncated.";
    safeText = safeText.slice(0, TELEGRAM_MAX_MESSAGE_CHARS - notice.length) + notice;
  }

  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText,
      parse_mode: parseMode,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("[Telegram] sendMessage failed:", result.description);
  }

  return result as TelegramSendResult;
}
