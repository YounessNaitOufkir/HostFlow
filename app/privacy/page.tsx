import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy · HostFlow",
  description:
    "What HostFlow stores, why, who processes it, and how to have it deleted.",
  // Without this it would inherit the root layout's canonical of "/", telling
  // Google this page's real home is elsewhere — the opposite of the fix.
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
