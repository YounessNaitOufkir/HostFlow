import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import type { Profile } from "@/types";

export type RequestAccessResult = "sent" | "already" | "error";

/**
 * The "request access to Host'lik" action, shared by every place it can be
 * triggered from (the no-workspace screen, and the sidebar once the account
 * has a private workspace but still no shared one). One button behavior, one
 * dedupe story, instead of copies drifting apart.
 *
 * request_workspace_access() is the authoritative gate — see
 * 20260924000000_access_request_dedupe.sql — but alreadyRequested is checked
 * here first to skip the round trip for the common case: clicking a button
 * that's already been clicked once this visit.
 */
export function useRequestWorkspaceAccess(profile: Profile | null) {
  const [requesting, setRequesting] = useState(false);
  // profile.access_requested_at survives a reload; alreadySentLocally covers
  // the instant after a successful call, before the profile refetches.
  const [alreadySentLocally, setAlreadySentLocally] = useState(false);
  const alreadyRequested = !!profile?.access_requested_at || alreadySentLocally;

  const request = async (): Promise<RequestAccessResult> => {
    if (alreadyRequested) return "already";
    setRequesting(true);
    try {
      const { error } = await supabase.rpc("request_workspace_access");
      if (!error) {
        setAlreadySentLocally(true);
        return "sent";
      }
      if (error.message?.includes("Access already requested")) {
        setAlreadySentLocally(true);
        return "already";
      }
      reportMutationError(error, "Failed to send access request", { table: "notifications", operation: "insert" });
      return "error";
    } catch (err) {
      reportMutationError(err, "Failed to send access request", { table: "notifications", operation: "insert" });
      return "error";
    } finally {
      setRequesting(false);
    }
  };

  return { requesting, alreadyRequested, request };
}
