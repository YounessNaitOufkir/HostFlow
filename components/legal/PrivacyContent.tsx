"use client";

import { LegalPage, Section, Bullets } from "@/components/legal/LegalPage";
import { useT } from "@/components/LanguageProvider";

export function PrivacyContent() {
  const t = useT();
  return (
    <LegalPage title={t("legal.privacy.title")} effective="6 September 2026">
      <p>{t("legal.privacy.intro")}</p>

      <Section heading={t("legal.privacy.whoRuns.heading")}>
        <p>
          {t("legal.privacy.whoRuns.body1")}{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          .
        </p>
      </Section>

      <Section heading={t("legal.privacy.whatStored.heading")}>
        <Bullets
          items={[
            t("legal.privacy.whatStored.item1"),
            t("legal.privacy.whatStored.item2"),
            t("legal.privacy.whatStored.item3"),
            t("legal.privacy.whatStored.item4"),
          ]}
        />
        <p>{t("legal.privacy.whatStored.outro")}</p>
      </Section>

      <Section heading={t("legal.privacy.google.heading")}>
        <p>{t("legal.privacy.google.intro")}</p>
        <Bullets
          items={[
            <>
              {t("legal.privacy.google.item1before")}{" "}
              <code className="rounded bg-gray-200 px-1 py-0.5 text-[13px] dark:bg-slate-700">
                calendar.events
              </code>
              {t("legal.privacy.google.item1after")}
            </>,
            t("legal.privacy.google.item2"),
            t("legal.privacy.google.item3"),
            t("legal.privacy.google.item4"),
            t("legal.privacy.google.item5"),
            <>
              {t("legal.privacy.google.item6before")}{" "}
              <a
                className="text-blue-600 dark:text-blue-400 hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer noopener"
              >
                myaccount.google.com/permissions
              </a>
              {t("legal.privacy.google.item6after")}
            </>,
          ]}
        />
        <p>
          {t("legal.privacy.google.outrobefore")}{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("legal.privacy.google.apiPolicyLinkLabel")}
          </a>
          {t("legal.privacy.google.outroafter")}
        </p>
      </Section>

      <Section heading={t("legal.privacy.who.heading")}>
        <p>{t("legal.privacy.who.intro")}</p>
        <Bullets
          items={[
            t("legal.privacy.who.item1"),
            t("legal.privacy.who.item2"),
            t("legal.privacy.who.item3"),
            t("legal.privacy.who.item4"),
            t("legal.privacy.who.item5"),
          ]}
        />
      </Section>

      <Section heading={t("legal.privacy.retention.heading")}>
        <p>{t("legal.privacy.retention.body")}</p>
      </Section>

      <Section heading={t("legal.privacy.rights.heading")}>
        <p>
          {t("legal.privacy.rights.before")}{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          {t("legal.privacy.rights.after")}
        </p>
      </Section>

      <Section heading={t("legal.privacy.security.heading")}>
        <p>{t("legal.privacy.security.body")}</p>
      </Section>

      <Section heading={t("legal.privacy.changes.heading")}>
        <p>{t("legal.privacy.changes.body")}</p>
      </Section>
    </LegalPage>
  );
}
