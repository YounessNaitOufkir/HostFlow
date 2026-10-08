import type { Automation, Board, Item } from "@/types";

/**
 * Event-driven automation rules, matched when a cell value changes.
 *
 * Its own leaf module for the same reason as lib/statusSemantics: the engine
 * imports sonner and the email client, and the Claude connector (a server
 * route) has to run the very same rule when it changes a status.
 */

export interface EventAutomationResult {
  targetGroupId?: string;
  matchedRuleId?: string;
}

/**
 * Evaluates event-driven automation rules when a cell value changes.
 */
export function evaluateEventAutomations(
  board: Board,
  item: Item,
  columnId: string,
  oldValue: unknown,
  newValue: unknown,
  automations: Automation[]
): EventAutomationResult {
  const result: EventAutomationResult = {};

  // 1. Check for move_group automations (e.g. "Done" -> Completed, "Cancelled" -> Closed/Rejected)
  const matchedMoveRule = automations.find(
    (a) =>
      a.trigger_column_id === columnId &&
      String(newValue) === String(a.trigger_value) &&
      a.action_type === "move_group" &&
      a.enabled !== false
  );

  if (matchedMoveRule) {
    result.targetGroupId = matchedMoveRule.action_target_id;
    result.matchedRuleId = matchedMoveRule.id;
  }

  // Date postponement used to be measured here for the "Timeline & Date
  // Shifting" rule. Dependencies now reschedule successors on every edit,
  // through one engine, so there is nothing left for a rule to opt into - and
  // the figure this computed had no consumer even before that.

  return result;
}
