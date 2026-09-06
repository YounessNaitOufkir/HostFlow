import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · HostFlow",
  description:
    "What HostFlow stores, why, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="6 September 2026">
      <p>
        HostFlow is a work management tool for property fit-out and lettings. This
        policy describes what the service stores, why it stores it, and how to have
        it removed. It is written to be accurate about what the software actually
        does rather than to be broad enough to cover anything it might do.
      </p>

      <Section heading="Who runs the service">
        <p>
          HostFlow is operated by Youness Nait Oufkir. Contact for any privacy
          question, including access and deletion requests:{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          .
        </p>
      </Section>

      <Section heading="What is stored">
        <Bullets
          items={[
            <>
              <strong>Account details</strong> — your email address, your name, an
              optional profile picture, your chosen interface language, and a
              display colour. Passwords are handled by our authentication provider
              and stored only as a hash; HostFlow never sees your password.
            </>,
            <>
              <strong>The work you enter</strong> — workspaces, boards, tasks,
              dates, assignments, statuses, comments, file attachments, and the
              activity log of changes made to them.
            </>,
            <>
              <strong>Notification settings</strong> — whether you want email,
              Telegram, or in-app alerts, and which single channel your daily
              digest is sent on.
            </>,
            <>
              <strong>Integration credentials</strong> — if you connect Google
              Calendar or Telegram, the tokens or chat identifier needed to reach
              those services on your behalf. These are held server-side and are
              never sent to the browser.
            </>,
          ]}
        />
        <p>
          HostFlow does not use advertising cookies, does not track you across
          other websites, and does not sell or rent personal data to anyone.
        </p>
      </Section>

      <Section heading="How Google user data is used">
        <p>
          This section describes HostFlow&rsquo;s use of Google APIs specifically.
          Connecting Google Calendar is entirely optional and the rest of the
          product works without it.
        </p>
        <Bullets
          items={[
            <>
              <strong>What is requested.</strong> A single scope,{" "}
              <code className="rounded bg-gray-200 px-1 py-0.5 text-[13px] dark:bg-slate-700">
                calendar.events
              </code>
              , which permits viewing and editing calendar events. HostFlow does
              not request access to your contacts, your email, your files, or any
              other Google service.
            </>,
            <>
              <strong>What it is used for.</strong> One thing only: when a task
              with a date is assigned to you, HostFlow creates or updates a single
              all-day event for that task on your primary calendar, so your
              schedule reflects your work.
            </>,
            <>
              <strong>What is read.</strong> HostFlow looks up only events it
              created itself, identified by a private marker it attaches to them.
              It does not read, index, or store the contents of your existing
              calendar events.
            </>,
            <>
              <strong>What is stored.</strong> The access and refresh tokens
              Google issues, held server-side so the sync can run when you are not
              at your screen. The event identifier is derived from the task, so no
              copy of your calendar is kept.
            </>,
            <>
              <strong>What is never done.</strong> Google user data is not
              transferred to anyone else, is not used for advertising, is not used
              to build profiles, and is not used to train any artificial
              intelligence or machine learning model.
            </>,
            <>
              <strong>How to revoke it.</strong> Disconnect Google Calendar in
              Profile Settings, which deletes the stored tokens immediately. You
              can also revoke access at{" "}
              <a
                className="text-blue-600 dark:text-blue-400 hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer noopener"
              >
                myaccount.google.com/permissions
              </a>
              . Events already written to your calendar remain yours and are not
              deleted; you can remove them from Google Calendar directly.
            </>,
          ]}
        />
        <p>
          HostFlow&rsquo;s use of information received from Google APIs adheres to
          the{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section heading="Who processes the data">
        <p>
          HostFlow runs on a small number of service providers, each handling data
          only to operate the product:
        </p>
        <Bullets
          items={[
            <>
              <strong>Supabase</strong> — database, authentication and file
              storage, hosted in the European Union (eu-west-1).
            </>,
            <>
              <strong>Vercel</strong> — application hosting and delivery.
            </>,
            <>
              <strong>Resend</strong> — sending notification and digest emails.
            </>,
            <>
              <strong>Google</strong> — calendar synchronisation, only if you
              connect it.
            </>,
            <>
              <strong>Telegram</strong> — instant notifications, only if you
              connect it.
            </>,
          ]}
        />
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your account and the work in it are kept for as long as the account
          exists. Deleted tasks are retained in the trash so they can be restored,
          and are removed permanently when the trash is emptied. Integration
          tokens are deleted as soon as you disconnect the integration, and are
          also cleared automatically when the provider stops accepting them.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can view and correct most of your data directly in the app. You may
          request a copy of your data, or its deletion, by writing to{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          . Deletion requests are honoured within 30 days, other than anything we
          are required to keep by law.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Access to data is enforced in the database itself, per row and per
          column, so an account can only reach the workspaces and boards it has
          been granted. Integration tokens are not readable by the browser at all.
          No system is perfectly secure, and this policy is not a warranty against
          every possible failure.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes in a way that affects how your data is used, the
          effective date above will change and material changes will be announced
          in the app.
        </p>
      </Section>
    </LegalPage>
  );
}
