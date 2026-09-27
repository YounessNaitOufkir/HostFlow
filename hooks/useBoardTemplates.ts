"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { fetchBoardTemplates } from "@/lib/companyTemplates";

/**
 * The company's board templates. Kept current by useLiveSync, so a template
 * an admin saves, renames or deletes shows in every open picker.
 *
 * `enabled` is false where templates cannot apply - a private workspace, or
 * someone outside the team, who would only get an empty list back from RLS.
 */
export function useBoardTemplates(enabled: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.boardTemplates(),
    queryFn: fetchBoardTemplates,
    enabled,
  });
  return { templates: data ?? [], loading: enabled && isLoading };
}
