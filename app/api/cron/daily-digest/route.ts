import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";

// Helper to get due state of a date string
function getDueState(dateString: string): "today" | "overdue" | "future" | "none" {
  if (!dateString) return "none";
  const itemDate = new Date(dateString);
  const today = new Date();
  
  // Set both to midnight for comparison
  itemDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diff = itemDate.getTime() - today.getTime();
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "future";
}

export async function GET(request: Request) {
  try {
    // 1. Verify CRON_SECRET for security
    //
    // Fail closed. This route runs service-role over every profile and item, so an
    // unset secret is a deployment fault rather than a reason to skip the check.
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured; refusing to run the daily digest.");
      return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 2. Fetch profiles with Telegram enabled AND Daily Digest enabled
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled, daily_digest_enabled")
      .eq("telegram_notifications_enabled", true)
      .eq("daily_digest_enabled", true)
      .not("telegram_chat_id", "is", null);

    if (profilesError || !profiles || profiles.length === 0) {
      return NextResponse.json({ message: "No eligible profiles found" });
    }

    const activeUserIds = profiles.map(p => p.id);

    // 3. Fetch boards to map column IDs to types (we need to find 'people' and 'date' columns)
    const { data: boards, error: boardsError } = await supabase
      .from("boards")
      .select("id, columns");

    if (boardsError || !boards) {
      return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
    }

    // 4. Fetch all active items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("id, name, board_id, column_values")
      .is("deleted_at", null);

    if (itemsError || !items) {
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
    }

    // 5. Build a mapping of user -> Due Tasks
    type TaskEntry = { item: any; state: "today" | "overdue" };
    const userTasks: Record<string, TaskEntry[]> = {};
    activeUserIds.forEach(id => { userTasks[id] = []; });

    items.forEach(item => {
      const board = boards.find(b => b.id === item.board_id);
      if (!board) return;

      // Find people columns and date columns for this board
      const peopleCols = (board.columns || []).filter((c: any) => c.type === "people").map((c: any) => c.id);
      const dateCols = (board.columns || []).filter((c: any) => c.type === "date").map((c: any) => c.id);
      const timelineCols = (board.columns || []).filter((c: any) => c.type === "timeline").map((c: any) => c.id);

      if (peopleCols.length === 0 || (dateCols.length === 0 && timelineCols.length === 0)) return;

      let taskState: "today" | "overdue" | "future" | "none" = "none";

      for (const colId of dateCols) {
        const val = item.column_values?.[colId];
        if (typeof val === 'string') {
          const state = getDueState(val);
          if (state === "overdue") taskState = "overdue";
          else if (state === "today" && taskState !== "overdue") taskState = "today";
        }
      }

      for (const colId of timelineCols) {
        const val = item.column_values?.[colId];
        if (val && typeof val === 'object' && typeof val.end === 'string') {
          const state = getDueState(val.end);
          if (state === "overdue") taskState = "overdue";
          else if (state === "today" && taskState !== "overdue") taskState = "today";
        }
      }

      if (taskState !== "today" && taskState !== "overdue") return;

      // Check who is assigned
      for (const colId of peopleCols) {
        const assignees = item.column_values?.[colId];
        if (Array.isArray(assignees)) {
          assignees.forEach(userId => {
            if (userTasks[userId]) {
              // Avoid duplicates if a user is in multiple people columns
              if (!userTasks[userId].find(t => t.item.id === item.id)) {
                userTasks[userId].push({ item, state: taskState });
              }
            }
          });
        }
      }
    });

    // 6. Send the digests!
    //
    // Every send is collected and awaited before this route responds. It used to
    // call notifyUsersViaTelegram without awaiting it: the route returned
    // "dispatched to N users" while the request to Telegram was still in flight,
    // and a serverless instance is free to be frozen or reclaimed the moment it
    // responds — so the message frequently never left. app/api/telegram/notify
    // already awaits for exactly this reason, which is why task-assignment alerts
    // arrive and the digest did not.
    const sends: Promise<unknown>[] = [];
    let sentCount = 0;
    for (const userId of Object.keys(userTasks)) {
      const tasks = userTasks[userId];
      if (tasks.length > 0) {
        const todayTasks = tasks.filter(t => t.state === "today");
        const overdueTasks = tasks.filter(t => t.state === "overdue");
        
        let message = `📋 *Your Daily HostFlow Digest*\nYou have ${tasks.length} task(s) needing attention:\n\n`;
        
        if (todayTasks.length > 0) {
          message += `🚨 *Due Today (${todayTasks.length}):*\n`;
          message += todayTasks.map(t => `- ${t.item.name}`).join("\n");
          message += `\n\n`;
        }
        
        if (overdueTasks.length > 0) {
          message += `⚠️ *Overdue (${overdueTasks.length}):*\n`;
          message += overdueTasks.map(t => `- ${t.item.name}`).join("\n");
        }

        // Already filtered for activeUserIds above, so each of these is eligible.
        sends.push(notifyUsersViaTelegram([userId], message.trim()));
        sentCount++;
      }
    }

    // allSettled so one user's failure cannot stop the rest, but still awaited so
    // the instance stays alive until every send has actually resolved.
    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      console.error(`[Daily Digest Cron] ${failed} of ${sends.length} sends failed.`);
    }

    return NextResponse.json({
      success: true,
      eligibleProfiles: profiles.length,
      withTasks: sentCount,
      failed,
      message: `Daily digest sent to ${sentCount - failed} of ${sentCount} users with due work.`,
    });

  } catch (error) {
    console.error("[Daily Digest Cron] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
