"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage, hasStoredLocale } from "@/components/LanguageProvider";
import { isLocale, type Locale } from "@/lib/i18n";
import type { Profile } from "@/types";

/**
 * Keeps profiles.language in step with the language chosen in the browser.
 *
 * The choice itself stays in localStorage: it has to work before anyone signs
 * in, and it is what every render reads. But automation emails are composed in
 * a Vercel cron with no session and no browser, so without a copy on the profile
 * a user working in French was still sent English notifications.
 *
 * The sync runs both ways, with the browser winning:
 *
 *   - A browser that has never been given a choice adopts the one on the
 *     account, so signing in on a new machine or a phone matches.
 *   - Otherwise the stored choice is pushed to the profile, because that is the
 *     one the user is actually looking at.
 */
export function useLocaleSync(profile: Profile | null | undefined): void {
  const { locale, setLocale } = useLanguage();

  // Adoption is a once-per-session event. Without this guard, changing the
  // language would be undone by the next render that still carried the old
  // profile row.
  const adopted = useRef(false);
  const lastPushed = useRef<Locale | null>(null);

  useEffect(() => {
    const id = profile?.id;
    if (!id) return;

    const stored = profile?.language;

    if (!adopted.current) {
      adopted.current = true;
      if (!hasStoredLocale() && isLocale(stored) && stored !== locale) {
        setLocale(stored);
        lastPushed.current = stored;
        return;
      }
    }

    if (stored === locale || lastPushed.current === locale) return;
    lastPushed.current = locale;

    // Fire and forget: failing to record a language preference is not worth
    // interrupting anyone for, and the next change will try again.
    void supabase
      .from("profiles")
      .update({ language: locale })
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("[useLocaleSync] could not save language:", error.message);
      });
  }, [profile?.id, profile?.language, locale, setLocale]);
}
