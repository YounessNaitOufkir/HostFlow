"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { enUS, fr as frDateFns } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  translate,
  type Locale,
  type TranslateVars,
  type TranslationKey,
} from "@/lib/i18n";

const DATE_LOCALES: Record<Locale, DateFnsLocale> = { en: enUS, fr: frDateFns };
const BCP47: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };

// ─────────────────────────────────────────────────────────────
// The stored locale is external state (localStorage), so it is read through
// useSyncExternalStore rather than "useState + read it in an effect". That
// pattern trips react-hooks/set-state-in-effect, which is error-level in this
// repo, and it is the same shape of mistake that crashed the app once before.
// useSyncExternalStore also gets hydration right for free: React renders
// getServerSnapshot() on the server and during hydration, then re-renders if
// the client snapshot differs, so there is no markup mismatch.
// ─────────────────────────────────────────────────────────────

let cachedLocale: Locale | null = null;
const listeners = new Set<() => void>();

function readLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (isLocale(stored)) return stored;

  // No stored choice: take a hint from the browser, as the Next.js i18n guide
  // recommends respecting the user's own language preference.
  const preferred = typeof navigator !== "undefined" ? navigator.language : "";
  return preferred.toLowerCase().startsWith("fr") ? "fr" : DEFAULT_LOCALE;
}

function getSnapshot(): Locale {
  // Cached so the snapshot is referentially stable between renders; without this
  // useSyncExternalStore would loop.
  if (cachedLocale === null) cachedLocale = readLocale();
  return cachedLocale;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Keeps other tabs in step when the language is changed in one of them.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY) {
      cachedLocale = null;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeLocale(next: Locale) {
  cachedLocale = next;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled: the choice just will not persist.
  }
  listeners.forEach((l) => l());
}

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key, filling any {placeholders}. */
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  /** date-fns locale matching the current language, for format()/formatDistance(). */
  dateLocale: DateFnsLocale;
  /** BCP 47 tag for Intl.* and toLocaleDateString. */
  bcp47: string;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  // Forwards vars: without them a default-context render shows the raw
  // "{name}" placeholder rather than the value.
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  dateLocale: enUS,
  bcp47: BCP47[DEFAULT_LOCALE],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // DOM-only side effect: keeps the document in sync for screen readers,
  // hyphenation and :lang(). No state is set here.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeLocale(next);
    toast.success(
      translate(next, "language.changed", {
        name: translate(next, next === "fr" ? "language.frenchNative" : "language.englishNative"),
      })
    );
  }, []);

  const value = useMemo<LanguageContextType>(
    () => ({
      locale,
      setLocale,
      t: (key: TranslationKey, vars?: TranslateVars) => translate(locale, key, vars),
      dateLocale: DATE_LOCALES[locale],
      bcp47: BCP47[locale],
    }),
    [locale, setLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Access the current language plus the t() translator. */
export function useLanguage() {
  return useContext(LanguageContext);
}

/** Shorthand for components that only need to translate: `const t = useT();` */
export function useT() {
  return useContext(LanguageContext).t;
}
