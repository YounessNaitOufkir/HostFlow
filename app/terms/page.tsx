import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · HostFlow",
  description: "The terms under which HostFlow may be used.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effective="6 September 2026">
      <p>
        These terms govern your use of HostFlow, a work management tool operated by
        Youness Nait Oufkir. By creating an account or using the service you agree
        to them.
      </p>

      <Section heading="Accounts">
        <p>
          Access is by invitation to a workspace. You are responsible for keeping
          your login credentials to yourself and for the activity that happens
          under your account. Tell us promptly if you believe it has been used
          without your permission.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            "use the service unlawfully, or to store unlawful content;",
            "attempt to reach workspaces, boards or accounts you have not been granted access to;",
            "probe, disrupt or overload the service, or circumvent its access controls;",
            "upload malware, or content you have no right to share.",
          ]}
        />
      </Section>

      <Section heading="Your content">
        <p>
          The work you put into HostFlow — your boards, tasks, comments and files —
          remains yours. You grant only the permission needed to run the service:
          to store that content, display it to the people you have shared it with,
          and process it to provide features you have switched on, such as
          notifications and calendar synchronisation. We do not claim ownership of
          it and we do not use it to train models.
        </p>
      </Section>

      <Section heading="Integrations">
        <p>
          Google Calendar and Telegram are optional. Connecting one authorises
          HostFlow to act on your behalf with that service, as described in the{" "}
          <a className="text-blue-600 dark:text-blue-400 hover:underline" href="/privacy">
            Privacy Policy
          </a>
          . Those services are run by third parties under their own terms, and
          their availability is outside our control. You can disconnect either one
          at any time in Profile Settings.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          The service is provided as it is, without a guaranteed level of
          availability. Features may change, and maintenance or a provider outage
          may interrupt access. Keep your own copies of anything you cannot afford
          to lose.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          To the extent the law allows, HostFlow is provided without warranties of
          any kind, and the operator is not liable for indirect or consequential
          loss, lost profits, or lost data arising from your use of the service.
          Nothing here limits liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section heading="Ending your use">
        <p>
          You may stop using the service and request deletion of your account at
          any time by writing to{" "}
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline"
            href="mailto:contact@hostflow-app.com"
          >
            contact@hostflow-app.com
          </a>
          . We may suspend or end access to an account that breaches these terms or
          puts the service or other users at risk.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          These terms may be updated. The effective date above will change, and
          continuing to use the service after a material change means you accept
          the revised terms.
        </p>
      </Section>
    </LegalPage>
  );
}
