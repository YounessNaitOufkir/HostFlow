"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { reportMutationError } from "@/lib/errorReporting";
import { useT } from "@/components/LanguageProvider";
import { latestRequestByUser, type AccessRequest, type AccessRequestPerson } from "@/lib/accessRequests";
import type { Profile } from "@/types";

export type DecideResult = "ok" | "already" | "error";

async function fetchAccessRequests(withPeople: boolean) {
  // RLS does the scoping: an admin gets every request, anyone else their own.
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const requests = (data ?? []) as AccessRequest[];
  if (!withPeople) return { requests, people: [] as AccessRequestPerson[] };

  // Names come from user_directory: profiles itself is readable only by its owner.
  const ids = [...new Set(requests.flatMap((r) => [r.user_id, r.decided_by]).filter((id): id is string => !!id))];
  if (ids.length === 0) return { requests, people: [] as AccessRequestPerson[] };
  const { data: people } = await supabase
    .from("user_directory")
    .select("id, full_name, avatar_initials, avatar_url, color")
    .in("id", ids);
  return { requests, people: (people ?? []) as AccessRequestPerson[] };
}

/**
 * Access requests, and the admin's answer to one.
 *
 * `withPeople` also loads the names of who asked and who decided, which only
 * admins need (and only admins can read).
 */
export function useAccessRequests(userId: string | null | undefined, { withPeople = false } = {}) {
  const t = useT();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.accessRequests(userId ?? "", withPeople),
    enabled: !!userId,
    queryFn: () => fetchAccessRequests(withPeople),
  });

  // Another admin's decision, or the answer to your own request, arrives
  // through useLiveSync.

  const requests = useMemo(() => data?.requests ?? [], [data]);
  const people = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const byId = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);
  const latestByUser = useMemo(() => latestRequestByUser(requests), [requests]);
  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending").reverse(),
    [requests]
  );

  const decide = useCallback(
    async (request: AccessRequest, approve: boolean, reason: string | null = null): Promise<DecideResult> => {
      const { error } = await supabase.rpc("decide_access_request", {
        request_id: request.id,
        approve,
        reason,
      });
      queryClient.invalidateQueries({ queryKey: ["accessRequests"] });
      if (!error) {
        // Approving changes the person's Team badge on every admin screen. Set
        // at once, as Data Access opens next and would otherwise show them as
        // External until the refetch lands.
        if (approve) {
          queryClient.setQueryData<{ profiles: Profile[] }>(queryKeys.adminData(), (old) =>
            old
              ? { ...old, profiles: old.profiles.map((p) => (p.id === request.user_id ? { ...p, is_staff: true } : p)) }
              : old
          );
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.adminData() });
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles() });
        return "ok";
      }
      if (error.message?.includes("Already decided")) return "already";
      reportMutationError(error, t("access.decideFailed"), { table: "access_requests", operation: "rpc" });
      return "error";
    },
    [queryClient, t]
  );

  return { loaded: data !== undefined, requests, people, byId, latestByUser, pending, decide };
}
