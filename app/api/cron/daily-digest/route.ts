import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";

// Helper to check if a date string is today or overdue
function isDueTodayOrOverdue(dateString: string) {
  if (!dateString) return false;
  const itemDate = new Date(dateString);
  const today = new Date();
  
  // Set both to midnight for comparison
  itemDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  return itemDate.getTime() <= today.getTime();
}

export async function GET(request: Request) {
  try {
    // 1. Verify CRON_SECRET for security
    const authHeader = request.headers.get("authorization");
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    // In local development, we might not have a CRON_SECRET, so we can bypass if it's missing, 
    // but in production we MUST check it.
    if (process.env.CRON_SECRET && authHeader !== expectedAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 2. Fetch profiles with Telegram enabled
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled")
      .eq("telegram_notifications_enabled", true)
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
    const userTasks: Record<string, typeof items> = {};
    activeUserIds.forEach(id => { userTasks[id] = []; });

    items.forEach(item => {
      const board = boards.find(b => b.id === item.board_id);
      if (!board) return;

      // Find people columns and date columns for this board
      const peopleCols = (board.columns || []).filter((c: any) => c.type === "people").map((c: any) => c.id);
      const dateCols = (board.columns || []).filter((c: any) => c.type === "date").map((c: any) => c.id);

      if (peopleCols.length === 0 || dateCols.length === 0) return;

      // Check if item has a due date that is today or overdue
      let hasDueToday = false;
      for (const colId of dateCols) {
        const val = item.column_values?.[colId];
        if (typeof val === 'string' && isDueTodayOrOverdue(val)) {
          hasDueToday = true;
          break;
        }
      }

      if (!hasDueToday) return;

      // Check who is assigned
      for (const colId of peopleCols) {
        const assignees = item.column_values?.[colId];
        if (Array.isArray(assignees)) {
          assignees.forEach(userId => {
            if (userTasks[userId]) {
              // Avoid duplicates if a user is in multiple people columns
              if (!userTasks[userId].find(t => t.id === item.id)) {
                userTasks[userId].push(item);
              }
            }
          });
        }
      }
    });

    // 6. Send the digests!
    let sentCount = 0;
    for (const userId of Object.keys(userTasks)) {
      const tasks = userTasks[userId];
      if (tasks.length > 0) {
        const taskList = tasks.map(t => `- *${t.name}*`).join("\n");
        const message = `📋 *Your Daily HostFlow Digest*\nYou have ${tasks.length} task(s) due today or overdue:\n\n${taskList}`;
        
        // Since we already filtered for activeUserIds above, notifyUsersViaTelegram will work.
        // We use notifyUsersViaTelegram to actually send the message.
        notifyUsersViaTelegram([userId], message);
        sentCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Daily digest dispatched to ${sentCount} users.` 
    });

  } catch (error) {
    console.error("[Daily Digest Cron] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
