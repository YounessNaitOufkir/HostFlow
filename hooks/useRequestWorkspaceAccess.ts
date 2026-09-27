import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { useAuth } from "@/components/AuthProvider";

export type RequestAccessResult = "sent" | "already" | "declined" | "team" | "error";

/**
 * The "request access to Host'lik" action, shared by every place it can be
 * triggered from (the no-workspace screen, and the sidebar once the account
 * has a private workspace but still no shared one).
 *
 * request_workspace_access() is the authoritative gate - one waiting request
 * per person, none after a decline, none once on the team - see
 * 20260927000000_access_request_decisions.sql. Whatever it answers, the
 * request data is refetched, so the prompt shows the state it is really in.
 */
export function useRequestWorkspaceAccess() {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const [requesting, setRequesting] = useState(false);

  const request = async (note?: string): Promise<RequestAccessResult> => {
    setRequesting(true);
    try {
      const { error } = await supabase.rpc("request_workspace_access", { note: note?.trim() || null });
      if (!error) return "sent";
      if (error.message?.includes("Access already requested")) return "already";
      if (error.message?.includes("Access request declined")) return "declined";
      if (error.message?.includes("Already a team member")) {
        // Added to the team since this screen loaded.
        void refreshProfile();
        return "team";
      }
      reportMutationError(error, "Failed to send access request", { table: "access_requests", operation: "rpc" });
      return "error";
    } catch (err) {
      reportMutationError(err, "Failed to send access request", { table: "access_requests", operation: "rpc" });
      return "error";
    } finally {
      // Awaited, so the prompt goes from the spinner straight to its new state
      // instead of flashing the old one in between.
      await queryClient.invalidateQueries({ queryKey: ["accessRequests"] });
      setRequesting(false);
    }
  };

  return { requesting, request };
}
