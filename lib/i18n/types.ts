import type { en } from "./en";

/** Every key that exists in the English dictionary. */
export type TranslationKey = keyof typeof en;

/**
 * A complete dictionary. Every locale must supply every key — a missing entry is
 * a type error, which is what stops French from silently degrading to raw keys.
 */
export type Dictionary = Record<TranslationKey, string>;

export type Locale = "en" | "fr";

export interface LocaleOption {
  id: Locale;
  /** Name in the current UI language, e.g. "French". */
  labelKey: TranslationKey;
  /** Name in its own language, always shown as-is: "Français". */
  nativeLabelKey: TranslationKey;
  flag: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { id: "en", labelKey: "language.english", nativeLabelKey: "language.englishNative", flag: "🇬🇧" },
  { id: "fr", labelKey: "language.french", nativeLabelKey: "language.frenchNative", flag: "🇫🇷" },
];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "hostflow_locale";

export const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "fr";
