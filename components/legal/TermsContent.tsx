"use client";

import { LegalPage, Section, Bullets } from "@/components/legal/LegalPage";
import { useT } from "@/components/LanguageProvider";

export function TermsContent() {
  const t = useT();
  return (
    <LegalPage title={t("legal.terms.title")} effective="6 September 2026">
      <p>{t("legal.terms.intro")}</p>

      <Section heading={t("legal.terms.accounts.heading")}>
        <p>{t("legal.terms.accounts.body")}</p>
      </Section>

      <Section heading={t("legal.terms.acceptable.heading")}>
        <p>{t("legal.terms.acceptable.intro")}</p>
        <Bullets
          items={[
            t("legal.terms.acceptable.item1"),
            t("legal.terms.acceptable.item2"),
            t("legal.terms.acceptable.item3"),
            t("legal.terms.acceptable.item4"),
          ]}
        />
      </Section>

      <Section heading={t("legal.terms.content.heading")}>
        <p>{t("legal.terms.content.body")}</p>
      </Section>

      <Section heading={t("legal.terms.integrations.heading")}>
        <p>
          {t("legal.terms.integrations.before")}{" "}
          <a className="text-blue-600 dark:text-blue-400 hover:underline" href="/privacy">
            {t("legal.privacyPolicy")}
          </a>
          {t("legal.terms.integrations.after")}
        </p>
      </Section>

      <Section heading={t("legal.terms.availability.heading")}>
        <p>{t("legal.terms.availability.body")}</p>
      </Section>

      <Section heading={t("legal.terms.liability.heading")}>
        <p>{t("legal.terms.liability.body")}</p>
      </Section>

      <Section heading={t("legal.terms.ending.heading")}>
        <p>
          {t("legal.terms.ending.before")}{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          {t("legal.terms.ending.after")}
        </p>
      </Section>

      <Section heading={t("legal.terms.changes.heading")}>
        <p>{t("legal.terms.changes.body")}</p>
      </Section>
    </LegalPage>
  );
}
