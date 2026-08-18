import { Board, Item, Profile, Automation } from "@/types";
import { sendEmail } from "@/lib/email";
import { toast } from "sonner";

export interface EventAutomationResult {
  targetGroupId?: string;
  shiftDays?: number;
  matchedRuleId?: string;
}

export interface TimeAutomationResult {
  triggeredCount: number;
  messages: string[];
  updatedItemIds: string[];
  /** Items whose column_values were changed (e.g. status set to Overdue) — callers should dispatch to local store */
  updatedItems: { id: string; column_values: Record<string, any> }[];
}

/**
 * Evaluates event-driven automation rules when a cell value changes.
 */
export function evaluateEventAutomations(
  board: Board,
  item: Item,
  columnId: string,
  oldValue: any,
  newValue: any,
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

  // 2. Check if this is a Date or Timeline column postponement for Timeline/Date Shifting
  const columnDef = board.columns.find((c) => c.id === columnId);
  if (columnDef && (columnDef.type === "date" || columnDef.type === "timeline")) {
    const oldTime = getStartDateMs(oldValue);
    const newTime = getStartDateMs(newValue);
    if (oldTime && newTime && newTime > oldTime) {
      const diffDays = Math.round((newTime - oldTime) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        result.shiftDays = diffDays;
      }
    }
  }

  return result;
}

function getStartDateMs(val: any): number | null {
  if (!val) return null;
  if (typeof val === "string" && val.includes("-")) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof val === "object") {
    const dateStr = val.start || val.date;
    if (dateStr) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
  }
  return null;
}

function parseIsoDateString(val: any): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    // Match standard YYYY-MM-DD anywhere in the string
    const match = val.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    // Otherwise try parsing string date (e.g. "Apr 4, 2026")
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  if (typeof val === "object") {
    if (val.end) return parseIsoDateString(val.end);
    if (val.date) return parseIsoDateString(val.date);
    if (val.start) return parseIsoDateString(val.start);
  }
  return null;
}

/**
 * Evaluates time-based automations:
 * - SLA Warnings: Due Date == Today AND status not "Working on it" or "Done" -> alert assignee
 * - Overdue Tagging: Due Date passed AND status != "Done" -> set status to Overdue & email & notify
 */
export async function evaluateTimeAutomations(
  board: Board,
  profiles: Profile[],
  supabase: any,
  forceNotify?: boolean
): Promise<TimeAutomationResult> {
  const result: TimeAutomationResult = {
    triggeredCount: 0,
    messages: [],
    updatedItemIds: [],
    updatedItems: [],
  };

  const automations = (board as any).automations || [];
  // Time rules are opt-in: a board only gets SLA/overdue behaviour if it has an
  // enabled automation of that type. Callers MUST pass board.automations —
  // omitting it means no rules fire, never "all rules fire".
  const slaAlertRule = automations.some(
    (a: Automation) => a.action_type === "sla_alert" && a.enabled !== false
  );
  const overdueRule = automations.some(
    (a: Automation) => a.action_type === "overdue_tagging" && a.enabled !== false
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const dateCols = board.columns.filter((c) => c.type === "date" || c.type === "timeline");
  const statusCols = board.columns.filter((c) => c.type === "status");
  const personCols = board.columns.filter((c) => c.type === "people");

  for (const item of board.items || []) {
    const values = item.column_values || {};

    // Find date for item across all date/timeline columns or any date-like string in column_values
    let itemDateStr: string | null = null;
    const allDateLikeCols = [
      ...dateCols,
      ...board.columns.filter((c) => /date|timeline|échéance|délai|due/i.test(c.title))
    ];
    for (const dCol of allDateLikeCols) {
      itemDateStr = parseIsoDateString(values[dCol.id]);
      if (itemDateStr) break;
    }
    if (!itemDateStr) {
      for (const key of Object.keys(values)) {
        itemDateStr = parseIsoDateString(values[key]);
        if (itemDateStr) break;
      }
    }

    if (!itemDateStr) continue;

    // Find status for item
    let currentStatus: string | null = null;
    for (const sCol of statusCols) {
      if (values[sCol.id]) {
        currentStatus = values[sCol.id];
        break;
      }
    }

    // Find assignee for item
    let assigneeId: string | null = null;
    for (const pCol of personCols) {
      if (values[pCol.id]) {
        assigneeId = typeof values[pCol.id] === "string" ? values[pCol.id] : values[pCol.id]?.id || values[pCol.id]?.[0];
        if (assigneeId) break;
      }
    }

    const assigneeProfile = profiles.find((p) => p.id === assigneeId || p.email === assigneeId);
    const targetProfile = assigneeProfile || profiles[0] || null;
    const recipientEmail = targetProfile?.email || "younessnaitoufkir@gmail.com";
    const recipientName = targetProfile?.full_name || "Team Member";
    const recipientUserId = targetProfile?.id;

    const isDoneStatus = currentStatus && /done|terminé|termine|achevée|achevee|completed|fait/i.test(currentStatus);
    // 1. Overdue Tagging Rule: Due Date has passed (< todayStr) AND Status != Done
    if (overdueRule && itemDateStr < todayStr && !isDoneStatus) {
      const isAlreadyOverdue = currentStatus === "Overdue";
      if (!isAlreadyOverdue || forceNotify) {
        result.triggeredCount++;
        result.updatedItemIds.push(item.id);
        const msg = `⚠️ Overdue Alert: '${item.name}' missed its due date (${itemDateStr}). Status automatically set to Overdue.`;
        result.messages.push(msg);

        // Update in DB if not already Overdue
        const statusColId = statusCols[0]?.id || "status";
        const newColumnValues = { ...values, [statusColId]: "Overdue" };
        if (!isAlreadyOverdue) {
          // Checked deliberately: if this write fails we must not go on to tell
          // somebody their task was marked Overdue when it was not. This runs
          // both in the browser and in the cron, so it reports through console
          // rather than a toast.
          const { error: statusErr } = await supabase
            .from("items")
            .update({ column_values: newColumnValues })
            .eq("id", item.id);
          if (statusErr) {
            console.error(
              `[automations] failed to mark "${item.name}" (${item.id}) as Overdue:`,
              statusErr.message ?? statusErr
            );
            continue;
          }
          if (typeof window !== "undefined") {
            try {
              const originalValues = values;
              toast.success(`⚡ Automation: Marked "${item.name}" as Overdue`, {
                duration: 10000,
                action: {
                  label: "Revert",
                  onClick: async () => {
                    await supabase.from("items").update({ column_values: originalValues }).eq("id", item.id);
                    toast.info(`↩️ Reverted Overdue status on "${item.name}".`);
                  },
                },
              });
            } catch (e) {}
          }
        }

        // Track for UI dispatch
        result.updatedItems.push({ id: item.id, column_values: newColumnValues });

        // Notify
        if (recipientUserId) {
          await supabase.from("notifications").insert({
            user_id: recipientUserId,
            message: msg,
            read: false,
            board_id: board.id,
            item_id: item.id,
          });
        }

        // Send Gmail / Resend email alert
        await sendEmail({
          to: recipientEmail,
          subject: `⚠️ [HostFlow Overdue] Task '${item.name}' is overdue`,
          html: `<p>Hi ${recipientName},</p>
                 <p>The task <b>${item.name}</b> on board <b>${board.name}</b> missed its due date (<b>${itemDateStr}</b>).</p>
                 <p>Its status has been automatically changed to <span style="color:red;font-weight:bold;">Overdue</span>.</p>`,
        });
      } else {
        // Item is already marked Overdue, include in report messages
        result.messages.push(`⚠️ '${item.name}' is overdue (${itemDateStr}).`);
      }
    }

    // 2. SLA Warning Rule: Due Date is today AND Status != Working on it and != Done
    else if (slaAlertRule && itemDateStr === todayStr && currentStatus !== "Working on it" && !isDoneStatus) {
      const slaSentKey = `_sla_sent_${todayStr}`;
      if (!values[slaSentKey]) {
        result.triggeredCount++;
        const msg = `⏰ Due Date SLA Alert: '${item.name}' is due today and is not marked 'Working on it'.`;
        result.messages.push(msg);

        if (recipientUserId) {
          await supabase.from("notifications").insert({
            user_id: recipientUserId,
            message: msg,
            read: false,
            board_id: board.id,
            item_id: item.id,
          });
        }

        await sendEmail({
          to: recipientEmail,
          subject: `⏰ [HostFlow SLA Alert] Task '${item.name}' is due today!`,
          html: `<p>Hi ${recipientName},</p>
                 <p>The task <b>${item.name}</b> on board <b>${board.name}</b> is due <b>today (${todayStr})</b>.</p>
                 <p>Current Status: <b>${currentStatus || "Not Started"}</b>.</p>`,
        });

        const newColumnValues = { ...values, [slaSentKey]: true };
        await supabase.from("items").update({ column_values: newColumnValues }).eq("id", item.id);
        
        // Check if Telegram notification is requested via webhook (Optional, internal logic)
        const telegramCol = board.columns.find(
          (c) => c.type === "checkbox" && c.title.toLowerCase().includes("telegram")
        );
        
        if (telegramCol && values[telegramCol.id] === true) {
          // If we want to support this in the future, we would invoke the internal webhook logic here
          // directly without relying on an authenticated client-side fetch.
          console.log(`Telegram alert would trigger for: ${item.name}`);
        }

        
        result.updatedItems.push({ id: item.id, column_values: newColumnValues });
      }
    }
  }

  return result;
}
