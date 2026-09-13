import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/TermsContent";

export const metadata: Metadata = {
  title: "Terms of Service · HostFlow",
  description: "The terms under which HostFlow may be used.",
};

export default function TermsPage() {
  return <TermsContent />;
}
