import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy · HostFlow",
  description:
    "What HostFlow stores, why, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
