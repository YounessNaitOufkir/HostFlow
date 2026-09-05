/**
 * Browser-local display preferences, and the migration off their old names.
 *
 * These keys were written as `monday_clone_*` while the project still went by
 * that working title. Renaming a localStorage key is not free: the value is
 * already sitting in the browser of everyone who has ever used the app, so a
 * bare rename silently resets their sidebar and their hidden columns and looks
 * like a bug. `migrateLegacyStorageKeys` copies each old value across once and
 * then removes it, so an existing user notices nothing at all.
 *
 * Deliberately absent are `monday_clone_main_view`, `_active_board_id` and
 * `_active_workspace_id`. Those are dead: lib/navState.ts replaced them with a
 * single per-user record, and names them only in order to delete them. Renaming
 * those strings would stop that cleanup finding anything.
 *
 * Everything here is a per-browser display preference, never a location and
 * never anything about who is signed in — that lives in lib/navState.ts,
 * keyed by user.
 */

export const STORAGE_KEYS = {
  /** Whether the workspace sidebar is showing. */
  sidebar: "hostflow_sidebar",
  /** Hidden columns, keyed by board id. */
  hiddenColumns: "hostflow_hidden_columns",
  /** Collapsed groups. Read on mount for anyone who still has one; nothing writes it. */
  collapsedGroups: "hostflow_collapsed_groups",
} as const;

/** Old name → current name, for every key that has been renamed. */
const RENAMED: ReadonlyArray<readonly [string, string]> = [
  ["monday_clone_sidebar", STORAGE_KEYS.sidebar],
  ["monday_clone_hidden_columns", STORAGE_KEYS.hiddenColumns],
  ["monday_clone_collapsed_groups", STORAGE_KEYS.collapsedGroups],
];

/**
 * Moves any value still stored under an old key across to its current name.
 *
 * Safe to call on every mount: once a key has moved, the old name is gone and
 * the loop finds nothing. A value already present under the current name always
 * wins, so this can never overwrite a newer preference with a stale one.
 */
export function migrateLegacyStorageKeys(storage?: Storage): void {
  const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!store) return;

  for (const [legacy, current] of RENAMED) {
    try {
      const value = store.getItem(legacy);
      if (value === null) continue;
      if (store.getItem(current) === null) store.setItem(current, value);
      store.removeItem(legacy);
    } catch {
      // Private browsing, or a full quota. Losing a display preference is not
      // worth interrupting anything for.
    }
  }
}
