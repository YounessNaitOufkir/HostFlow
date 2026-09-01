import { Board, Item, Profile, Automation } from "@/types";
import { sendEmail } from "@/lib/email";
import { renderEmail, itemUrl, formatEmailDate } from "@/lib/emailTemplate";
import {
  translate,
  isLocale,
  DEFAULT_LOCALE,
  type Locale,
  type TranslateVars,
  type TranslationKey,
} from "@/lib/i18n";
import { todayInTimezone } from "@/lib/orgTime";

export { DONE_STATUS_PATTERN } from "@/lib/statusSemantics";
import { DONE_STATUS_PATTERN } from "@/lib/statusSemantics";
import { toast } from "sonner";

export interface EventAutomationResult {
  targetGroupId?: string;
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

  // Date postponement used to be measured here for the "Timeline & Date
  // Shifting" rule. Dependencies now reschedule successors on every edit,
  // through one engine, so there is nothing left for a rule to opt into - and
  // the figure this computed had no consumer even before that.

  return result;
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
  forceNotify?: boolean,
  /**
   * The company's timezone, from organization_settings.default_timezone. Decides
   * what counts as "today" for overdue and SLA rules. Defaults to UTC so existing
   * callers keep their old behaviour rather than silently shifting a day.
   */
  timeZone?: string | null
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

  // Was new Date().toISOString() — the UTC date, which is the wrong day for the
  // first hour of every local day. See lib/orgTime.ts.
  const todayStr = todayInTimezone(timeZone);
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

    // Only real mail, and only to the actual assignee. Two guards, both of which
    // were harmless while sendEmail was simulating and become real the moment a
    // RESEND_API_KEY exists:
    //   1. The targetProfile fallback above resolves to profiles[0] when an item has
    //      no assignee. That is fine for picking a display name, but emailing an
    //      arbitrary colleague about a task that is not theirs is not.
    //   2. email_notifications_enabled is a user-facing toggle in
    //      ProfileSettingsModal that nothing was reading.
    const shouldEmailAssignee =
      !!assigneeProfile?.email && assigneeProfile.email_notifications_enabled !== false;

    // Write to the reader in their own language. The choice is made in the
    // browser and kept in localStorage, which this cron cannot see, so it is
    // mirrored onto the profile by useLocaleSync and read back here. Anyone who
    // has never chosen falls back to English.
    const assigneeLanguage = assigneeProfile?.language;
    const locale: Locale = isLocale(assigneeLanguage) ? assigneeLanguage : DEFAULT_LOCALE;
    const tr = (key: TranslationKey, vars?: TranslateVars) => translate(locale, key, vars);

    const isDoneStatus = currentStatus && DONE_STATUS_PATTERN.test(currentStatus);
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
        if (shouldEmailAssignee) {
          const due = formatEmailDate(itemDateStr, locale);
          const mail = renderEmail({
            preheader: tr("email.overdue.preheader", { task: item.name, date: due }),
            heading: tr("email.overdue.heading"),
            greeting: tr("email.greeting", { name: recipientName }),
            paragraphs: [tr("email.overdue.body")],
            details: [
              { label: tr("email.label.task"), value: item.name },
              { label: tr("email.label.board"), value: board.name },
              { label: tr("email.label.wasDue"), value: due },
            ],
            accent: "red",
            cta: { label: tr("email.cta.openTask"), href: itemUrl(board.id, item.id) },
            footerNote: tr("email.footer.assigned"),
          });
          await sendEmail({
            to: recipientEmail,
            subject: tr("email.overdue.subject", { task: item.name }),
            html: mail.html,
            text: mail.text,
          });
        }
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

        if (shouldEmailAssignee) {
          const due = formatEmailDate(todayStr, locale);
          const mail = renderEmail({
            preheader: tr("email.sla.preheader", { task: item.name }),
            heading: tr("email.sla.heading"),
            greeting: tr("email.greeting", { name: recipientName }),
            paragraphs: [tr("email.sla.body")],
            details: [
              { label: tr("email.label.task"), value: item.name },
              { label: tr("email.label.board"), value: board.name },
              { label: tr("email.label.due"), value: due },
              { label: tr("email.label.status"), value: currentStatus || tr("email.status.notStarted") },
            ],
            accent: "amber",
            cta: { label: tr("email.cta.openTask"), href: itemUrl(board.id, item.id) },
            footerNote: tr("email.footer.assigned"),
          });
          await sendEmail({
            to: recipientEmail,
            subject: tr("email.sla.subject", { task: item.name }),
            html: mail.html,
            text: mail.text,
          });
        }

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
