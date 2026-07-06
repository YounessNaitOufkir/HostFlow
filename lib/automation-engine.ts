// ============================================================
// Automation Engine for HostFlow
// Event-driven automation system for workflow automation
// ============================================================

import { supabase } from "./supabase";
import { Automation, Item, Column, AutomationTriggerType, AutomationActionType } from "@/types";

// ============================================================
// Event Types
// ============================================================

export interface AutomationEvent {
  type: AutomationTriggerType;
  item: Item;
  boardId: string;
  columnId?: string;
  oldValue?: any;
  newValue?: any;
  timestamp: Date;
}

// ============================================================
// Event Handlers
// ============================================================

export type AutomationHandler = (event: AutomationEvent) => Promise<void>;

/**
 * Process an automation event
 * Evaluates conditions and executes actions
 */
export async function processAutomation(
  automation: Automation,
  event: AutomationEvent,
  handlers?: Record<AutomationActionType, AutomationHandler>
): Promise<{ executed: boolean; error?: Error }> {
  try {
    // Check if automation is enabled
    if (!automation.enabled) {
      return { executed: false };
    }

    // Check if this automation matches the event type
    if (automation.trigger.type !== event.type) {
      return { executed: false };
    }

    // Check if the trigger column matches
    if (automation.trigger.column_id !== event.columnId) {
      return { executed: false };
    }

    // For status_changed trigger, check the value
    if (event.type === "status_changed" && automation.trigger.value) {
      if (event.newValue !== automation.trigger.value) {
        return { executed: false };
      }
    }

    // Execute all actions
    for (const action of automation.actions) {
      await executeAction(action, event, handlers);
    }

    return { executed: true };
  } catch (error) {
    return { executed: false, error: error as Error };
  }
}

/**
 * Execute a single automation action
 */
async function executeAction(
  action: Automation["actions"][0],
  event: AutomationEvent,
  handlers?: Record<AutomationActionType, AutomationHandler>
): Promise<void> {
  switch (action.type) {
    case "move_to_group":
      await handleMoveToGroup(event.item.id, action.target_id!);
      break;
    
    case "change_status":
      await handleChangeStatus(event.item, action.target_id!, action.value!);
      break;
    
    case "send_notification":
      await handleSendNotification(event.item, action.value!);
      break;
    
    case "assign_user":
      await handleAssignUser(event.item, action.target_id!);
      break;
    
    case "set_date":
      await handleSetDate(event.item, action.target_id!, action.value!);
      break;
    
    case "send_email":
      // Email sending would require external service integration
      console.log("[Automation] Email action would be sent:", action.value);
      break;
    
    default:
      console.warn(`[Automation] Unknown action type: ${action.type}`);
  }
}

// ============================================================
// Built-in Action Handlers
// ============================================================

async function handleMoveToGroup(itemId: string, targetGroupId: string): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update({ group_id: targetGroupId })
    .eq("id", itemId);

  if (error) {
    console.error("[Automation] Failed to move item to group:", error);
    throw error;
  }

  // Log the action
  await logAutomationAction(itemId, "Moved to new group");
}

async function handleChangeStatus(item: Item, columnId: string, statusValue: string): Promise<void> {
  const updatedColumnValues = {
    ...item.column_values,
    [columnId]: statusValue,
  };

  const { error } = await supabase
    .from("items")
    .update({ column_values: updatedColumnValues })
    .eq("id", item.id);

  if (error) {
    console.error("[Automation] Failed to change status:", error);
    throw error;
  }

  await logAutomationAction(item.id, `Status changed to ${statusValue}`);
}

async function handleSendNotification(item: Item, message: string): Promise<void> {
  // Get the item creator or board owner
  const { data: itemData } = await supabase
    .from("items")
    .select("created_by, board_id")
    .eq("id", item.id)
    .single();

  if (!itemData?.created_by) return;

  const { error } = await supabase
    .from("notifications")
    .insert({
      user_id: itemData.created_by,
      title: "Automation Triggered",
      message: message.replace("{item_name}", item.name),
      type: "info",
      link: `/board/${itemData.board_id}?item=${item.id}`,
    });

  if (error) {
    console.error("[Automation] Failed to send notification:", error);
  }
}

async function handleAssignUser(item: Item, userId: string): Promise<void> {
  // Find the people column
  const { data: boardData } = await supabase
    .from("boards")
    .select("columns")
    .eq("id", item.board_id)
    .single();

  const peopleColumn = boardData?.columns?.find((c: Column) => c.type === "people");
  if (!peopleColumn) return;

  const currentAssignees: string[] = Array.isArray(item.column_values[peopleColumn.id])
    ? item.column_values[peopleColumn.id]
    : [];

  if (!currentAssignees.includes(userId)) {
    const updatedColumnValues = {
      ...item.column_values,
      [peopleColumn.id]: [...currentAssignees, userId],
    };

    const { error } = await supabase
      .from("items")
      .update({ column_values: updatedColumnValues })
      .eq("id", item.id);

    if (error) {
      console.error("[Automation] Failed to assign user:", error);
      throw error;
    }

    await logAutomationAction(item.id, "Assigned to team member");
  }
}

async function handleSetDate(item: Item, columnId: string, dateValue: string): Promise<void> {
  let dateToSet = dateValue;

  // Handle relative dates
  if (dateValue === "today") {
    dateToSet = new Date().toISOString().split("T")[0];
  } else if (dateValue === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateToSet = tomorrow.toISOString().split("T")[0];
  } else if (dateValue === "next_week") {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    dateToSet = nextWeek.toISOString().split("T")[0];
  }

  const updatedColumnValues = {
    ...item.column_values,
    [columnId]: dateToSet,
  };

  const { error } = await supabase
    .from("items")
    .update({ column_values: updatedColumnValues })
    .eq("id", item.id);

  if (error) {
    console.error("[Automation] Failed to set date:", error);
    throw error;
  }

  await logAutomationAction(item.id, `Due date set to ${dateToSet}`);
}

async function logAutomationAction(itemId: string, action: string): Promise<void> {
  // Get current user from localStorage (in a real app, this would come from auth)
  const userId = localStorage.getItem("current_user_id");
  if (!userId) return;

  const { data: itemData } = await supabase
    .from("items")
    .select("board_id")
    .eq("id", itemId)
    .single();

  if (!itemData) return;

  await supabase.from("activity_logs").insert({
    item_id: itemId,
    board_id: itemData.board_id,
    user_id: userId,
    action: `[Automation] ${action}`,
  });
}

// ============================================================
// Automation Engine Class
// Manages automation subscriptions and event processing
// ============================================================

export class AutomationEngine {
  private handlers: Record<AutomationActionType, AutomationHandler>;
  private automationsCache: Map<string, Automation[]> = new Map();

  constructor() {
    this.handlers = {};
  }

  /**
   * Register a custom action handler
   */
  registerHandler(type: AutomationActionType, handler: AutomationHandler): void {
    this.handlers[type] = handler;
  }

  /**
   * Load automations for a board
   */
  async loadAutomations(boardId: string): Promise<Automation[]> {
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("board_id", boardId)
      .eq("enabled", true);

    if (error) {
      console.error("Failed to load automations:", error);
      return [];
    }

    this.automationsCache.set(boardId, data || []);
    return data || [];
  }

  /**
   * Process an item change event
   */
  async processItemChange(
    item: Item,
    boardId: string,
    columnId: string,
    oldValue: any,
    newValue: any
  ): Promise<void> {
    const automations = this.automationsCache.get(boardId) || [];
    const eventType = this.detectEventType(columnId, oldValue, newValue);

    if (!eventType) return;

    const event: AutomationEvent = {
      type: eventType,
      item,
      boardId,
      columnId,
      oldValue,
      newValue,
      timestamp: new Date(),
    };

    for (const automation of automations) {
      await processAutomation(automation, event, this.handlers);
    }
  }

  /**
   * Detect the event type based on column change
   */
  private detectEventType(
    columnId: string,
    oldValue: any,
    newValue: any
  ): AutomationTriggerType | null {
    // Status changed
    if (oldValue !== newValue && (oldValue === undefined || newValue !== undefined)) {
      return "status_changed";
    }

    // Could add more event type detection here
    return null;
  }

  /**
   * Clear the automations cache for a board
   */
  invalidateCache(boardId: string): void {
    this.automationsCache.delete(boardId);
  }

  /**
   * Clear all cached automations
   */
  clearCache(): void {
    this.automationsCache.clear();
  }
}

// ============================================================
// Singleton instance for use throughout the app
// ============================================================

let automationEngineInstance: AutomationEngine | null = null;

export function getAutomationEngine(): AutomationEngine {
  if (!automationEngineInstance) {
    automationEngineInstance = new AutomationEngine();
  }
  return automationEngineInstance;
}

// ============================================================
// Automation Builder Helper
// ============================================================

export interface AutomationBuilder {
  when(columnId: string, value: string): AutomationBuilder;
  then(action: AutomationActionType, params: { target_id?: string; value?: string }): AutomationBuilder;
  build(): Omit<Automation, "id" | "created_at">;
}

export function createAutomationBuilder(
  boardId: string,
  triggerType: AutomationTriggerType
): AutomationBuilder {
  let triggerColumnId = "";
  let triggerValue = "";
  const actions: Automation["actions"] = [];

  return {
    when(columnId: string, value: string): AutomationBuilder {
      triggerColumnId = columnId;
      triggerValue = value;
      return this;
    },
    then(action: AutomationActionType, params: { target_id?: string; value?: string }): AutomationBuilder {
      actions.push({
        type: action,
        target_id: params.target_id,
        value: params.value,
      });
      return this;
    },
    build(): Omit<Automation, "id" | "created_at"> {
      return {
        board_id: boardId,
        enabled: true,
        trigger: {
          type: triggerType,
          column_id: triggerColumnId,
          value: triggerValue,
        },
        actions,
      };
    },
  };
}

// ============================================================
// Predefined Automation Templates
// ============================================================

export const AUTOMATION_TEMPLATES = {
  // Status-based automations
  whenDoneMoveToGroup: (boardId: string, groupId: string) =>
    createAutomationBuilder(boardId, "status_changed")
      .when("", "Done")
      .then("move_to_group", { target_id: groupId })
      .build(),

  whenStuckNotify: (boardId: string, message: string) =>
    createAutomationBuilder(boardId, "status_changed")
      .when("", "Stuck")
      .then("send_notification", { value: message })
      .build(),

  // Date-based automations
  whenDueTomorrowSetReminder: (boardId: string, message: string) =>
    createAutomationBuilder(boardId, "date_reached")
      .when("", "tomorrow")
      .then("send_notification", { value: message })
      .build(),

  // Assignment automations
  whenCreatedAssignTo: (boardId: string, userId: string) =>
    createAutomationBuilder(boardId, "item_created")
      .when("", "")
      .then("assign_user", { target_id: userId })
      .build(),
} as const;
