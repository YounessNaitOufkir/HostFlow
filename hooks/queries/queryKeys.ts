export const queryKeys = {
  globalSettings: () => ["globalSettings"] as const,
  workspaces: () => ["workspaces"] as const,
  globalSearch: (query: string, boardScope = "") =>
    ["globalSearch", query, boardScope] as const,
  profiles: () => ["profiles"] as const,
  boards: (workspaceId?: string) => ["boards", { workspaceId }] as const,
  boardData: (boardId: string) => ["boardData", boardId] as const,
  boardAccess: (boardId: string) => ["boardAccess", boardId] as const,
  myWorkItems: (profileId: string, boardScope = "") =>
    ["myWorkItems", profileId, boardScope] as const,
  itemUpdates: (itemId: string) => ["updates", itemId] as const,
  itemActivityLogs: (itemId: string) => ["activityLogs", itemId] as const,
  auditLogs: (boardId: string) => ["auditLogs", boardId] as const,
  workspaceGantt: (boardIds: string[]) => ["workspaceGantt", boardIds] as const,
  portfolio: (boardIds: string[]) => ["portfolio", boardIds] as const,
  trashUpdates: (itemIds: string[]) => ["trashUpdates", itemIds] as const,
  adminData: () => ["adminData"] as const,
  automations: (boardId: string) => ["automations", boardId] as const,
  workspaceAutomations: (workspaceId: string) => ["workspaceAutomations", workspaceId] as const,
  dependencySearch: (query: string) => ["dependencySearch", query] as const,
  itemsByIds: (ids: string[]) => ["itemsByIds", [...ids].sort()] as const,
};

/**
 * A stable token for "which boards were in scope when this ran".
 *
 * Queries that filter their results against the caller's board list have the
 * board list as an input, not just as a fetch detail. Leaving it out of the key
 * meant a result computed before the boards resolved - an empty one - was cached
 * and reused after they arrived. Sorted so the token does not change when the
 * boards merely come back in a different order.
 */
export function boardScopeKey(boards: { id: string }[]): string {
  return boards
    .map((b) => b.id)
    .sort()
    .join(",");
}
