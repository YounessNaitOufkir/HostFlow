/**
 * Escapes text for Telegram's parse_mode "HTML".
 *
 * Its own module rather than living in lib/telegram.ts: the notification messages
 * are composed in client components, and importing the Telegram client there would
 * drag the bot-token module into the browser bundle for the sake of one pure
 * function.
 *
 * Task and board names are user data. An unescaped "<" or "&" makes Telegram reject
 * the whole message with a parse error — and because those sends are fire-and-forget
 * from the client, the notification would vanish with nothing to show why.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
