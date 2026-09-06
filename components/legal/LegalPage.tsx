import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shell for /privacy and /terms.
 *
 * Deliberately self-contained and free of data fetching. Google's OAuth consent
 * screen links to both pages, and its reviewers — and anyone deciding whether to
 * grant calendar access — read them before they have an account. A page that
 * needs a session, or a database round trip that could fail, is a page that can
 * answer something other than the document at exactly the wrong moment. So the
 * company name is the fixed product name here rather than the configurable one
 * from organization_settings: a database outage must not take the privacy policy
 * down with it.
 */
export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#181c2e] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8">
          <Link
            href="/login"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            HostFlow
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Effective {effective}
          </p>
        </div>

        <div className="space-y-6 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
          {children}
        </div>

        <footer className="mt-12 border-t border-gray-200 dark:border-slate-700 pt-6 text-sm text-gray-500 dark:text-gray-400">
          <p>
            Questions about this document:{" "}
            <a
              className="text-blue-600 dark:text-blue-400 hover:underline"
              href="mailto:contact@hostflow-app.com"
            >
              contact@hostflow-app.com
            </a>
          </p>
          <p className="mt-2 flex gap-4">
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

/** A titled block. Keeps the two documents structurally identical. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
