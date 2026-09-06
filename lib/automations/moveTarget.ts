/**
 * Finding the group a "move when done" rule should file an item into.
 *
 * The rule stores a group id, chosen once when the recipe was created — and the
 * recipe creates the group if the board has none, so at that moment the id is
 * always good. Nothing keeps it good afterwards. Delete that group and the rule
 * survives, still enabled, still pointing at a row that is gone. The next time
 * it fires, the item update sets group_id to a group that does not exist, the
 * foreign key rejects it, and the reader is told "a required related record
 * (like a group or board) could not be found" — about an action they did not
 * knowingly take, naming a record they cannot see.
 *
 * So the target is resolved at the moment it is used rather than trusted. A
 * missing group is re-made under the same name the recipe promises, and the
 * rule is repointed at it, which is what the reader expects: turning the
 * automation on created a Completed group, so a Completed group is what the
 * automation needs.
 */

/** The name the recipe promises on its card, and the only group it will file into. */
export const COMPLETED_GROUP_TITLE = "Completed";

/** The colour a re-made group gets, matching the one the recipe creates. */
const COMPLETED_GROUP_COLOR = "#00c875";

export type MoveTargetResolution =
  | { status: "ok"; groupId: string; healed: boolean }
  /** Nothing safe to move into; the caller must leave the item where it is. */
  | { status: "unavailable" };

interface MinimalClient {
  from(table: string): any;
}

/**
 * The group id this rule may safely write, or "unavailable".
 *
 * Never returns an id it has not just seen in the database. Returning a stale
 * one is precisely the bug: a group_id that fails the foreign key surfaces as an
 * error about the edit the person actually made.
 */
export async function resolveMoveTargetGroup(
  supabase: MinimalClient,
  options: { boardId: string; targetGroupId: string | null; automationId?: string | null }
): Promise<MoveTargetResolution> {
  const { boardId, targetGroupId, automationId } = options;

  // 1. The stored target, if it is still there AND still on this board. The
  //    board check matters: a workspace-wide rule can carry an id belonging to
  //    a different board, and moving an item into another board's group would
  //    make it unreachable rather than merely misfiled.
  if (targetGroupId) {
    const { data } = await supabase
      .from("groups")
      .select("id")
      .eq("id", targetGroupId)
      .eq("board_id", boardId)
      .maybeSingle();
    if (data?.id) return { status: "ok", groupId: data.id, healed: false };
  }

  // 2. A group already called Completed on this board — the recipe's own name,
  //    so re-using it keeps whatever has been filed there already.
  const { data: existing } = await supabase
    .from("groups")
    .select("id")
    .eq("board_id", boardId)
    .ilike("title", COMPLETED_GROUP_TITLE)
    .limit(1);

  const found = Array.isArray(existing) ? existing[0] : existing;
  if (found?.id) {
    await repoint(supabase, automationId, found.id);
    return { status: "ok", groupId: found.id, healed: true };
  }

  // 3. Make it, exactly as switching the automation on would have.
  const { data: created, error } = await supabase
    .from("groups")
    .insert({
      board_id: boardId,
      title: COMPLETED_GROUP_TITLE,
      color: COMPLETED_GROUP_COLOR,
      // Appended. Reading a position off a stale client-side list is how a new
      // group ends up colliding with an existing one.
      position: 9999,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("[automations] could not provide a Completed group:", error);
    return { status: "unavailable" };
  }

  await repoint(supabase, automationId, created.id);
  return { status: "ok", groupId: created.id, healed: true };
}

/**
 * Point the rule at the group that actually exists, so this is paid once rather
 * than on every edit. Best-effort: a failure here costs an extra lookup next
 * time, never the move itself, so it must not throw.
 */
async function repoint(
  supabase: MinimalClient,
  automationId: string | null | undefined,
  groupId: string
): Promise<void> {
  if (!automationId) return;
  try {
    await supabase
      .from("automations")
      .update({ action_target_id: groupId })
      .eq("id", automationId);
  } catch (e) {
    console.error("[automations] could not repoint the rule at its group:", e);
  }
}
