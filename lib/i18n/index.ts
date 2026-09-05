import { en } from "./en";
import { fr } from "./fr";
import type { Dictionary, Locale, TranslationKey } from "./types";

export const dictionaries: Record<Locale, Dictionary> = { en, fr };

export type { Dictionary, Locale, TranslationKey, LocaleOption } from "./types";
export {
  LOCALE_OPTIONS,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
} from "./types";

/** Values allowed in a {placeholder}. */
export type TranslateVars = Record<string, string | number>;

/**
 * Looks up `key` in `locale` and fills any {placeholders}.
 *
 * Falls back to English, then to the key itself, so a bad key renders something
 * traceable instead of "undefined". Pure and locale-explicit so it can be used
 * from server code (email templates, API routes) as well as from useT().
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslateVars
): string {
  const template = dictionaries[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}
