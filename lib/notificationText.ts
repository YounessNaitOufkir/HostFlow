import type { Notification } from "@/types";
import type { TranslationKey, TranslateVars } from "@/lib/i18n";

/**
 * A notification, in the language of whoever is reading it.
 *
 * Notifications used to store a finished sentence, rendered in whatever
 * language the WRITER happened to be using - so a French colleague mentioning
 * an English one wrote French into their bell, and changing your own language
 * left every past notification stuck in the old one. The sentence is stored as
 * a key and its values now, and assembled here at read time.
 *
 * `message` remains the fallback, for two reasons that both still apply: rows
 * written before this exist and have no key, and a key this build does not
 * recognise (an older client reading a newer row) should show the sentence
 * rather than nothing.
 */
export function notificationText(
  t: (key: TranslationKey, vars?: TranslateVars) => string,
  notification: Pick<Notification, "message" | "message_key" | "message_vars">
): string {
  const key = notification.message_key;
  if (!key) return notification.message ?? "";

  // The values are user data - names and task titles - so they are passed as
  // interpolation values and land as text. Nothing here builds markup.
  const vars: TranslateVars = {};
  for (const [name, value] of Object.entries(notification.message_vars ?? {})) {
    if (value != null) vars[name] = String(value);
  }
  // A decline with no reason of its own gave the standard one, which is
  // stored empty so it reads in the requester's language.
  if (key === "notif.accessDeclined" && !vars.reason) {
    vars.reason = t("access.defaultReason");
  }

  const rendered = t(key, vars);
  // translate() hands back the key itself when it knows nothing about it,
  // which would be a worse thing to show than the stored sentence.
  return rendered === key && notification.message ? notification.message : rendered;
}
