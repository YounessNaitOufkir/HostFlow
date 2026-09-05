import { NextResponse } from "next/server";
import { startCronRun, finishCronRun } from "@/lib/cronHeartbeat";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";
import { buildDigestMessage } from "@/lib/digestMessage";
import { itemIsDone } from "@/lib/statusSemantics";

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
  let runId: string | null = null;
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

    // Opened only after the secret checks out: an unauthorised probe must not
    // be able to leave a trace that makes the job look alive.
    runId = await startCronRun("daily-digest");

    const supabase = createAdminClient();

    // 2. Fetch profiles with Telegram enabled AND Daily Digest enabled
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, telegram_notifications_enabled, daily_digest_enabled, language")
      .eq("telegram_notifications_enabled", true)
      .eq("daily_digest_enabled", true)
      .not("telegram_chat_id", "is", null);

    if (profilesError || !profiles || profiles.length === 0) {
      await finishCronRun(runId, true, { eligibleProfiles: 0 });
      return NextResponse.json({ message: "No eligible profiles found" });
    }

    const activeUserIds = profiles.map(p => p.id);
    // Each digest is written to one reader, in the language they chose.
    const languageOf = new Map(profiles.map((p) => [p.id, p.language]));

    // 3. Fetch boards to map column IDs to types (we need to find 'people' and 'date' columns)
    const { data: boards, error: boardsError } = await supabase
      .from("boards")
      .select("id, columns, workspace_id");

    if (boardsError || !boards) {
      return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
    }

    // Workspace names disambiguate the digest. A workspace is one property and its
    // boards are that property's lifecycle phases, so the same task name appears on
    // every apartment — without the property, several lines read identically.
    // Not fatal if this fails: tasks simply list without it.
    const { data: workspaces } = await supabase.from("workspaces").select("id, name");
    const workspaceNameById = new Map<string, string>(
      (workspaces || []).map((w: { id: string; name: string }) => [w.id, w.name])
    );
    const workspaceNameForBoard = (boardId: string): string | null => {
      const board = boards.find((b) => b.id === boardId);
      if (!board?.workspace_id) return null;
      return workspaceNameById.get(board.workspace_id) ?? null;
    };

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

      // Finished work is not overdue. The digest never looked at the status column,
      // so every completed task with a date in the past was still counted and
      // listed: one real inbox showed 200 "overdue" items of which the great
      // majority were done. The overdue automation has always applied this test
      // (!isDoneStatus); the digest simply never did.
      //
      // itemIsDone mirrors the engine's choice of column, so the two agree about
      // an item, and it reads the board's own declared labels before falling back
      // to matching words — so a board whose done label is "Fait", or one that
      // simply declares "Signed off" as finished, both answer correctly.
      if (itemIsDone(board.columns || [], item.column_values)) return;

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
        // Capped, escaped and HTML-formatted. Built inline before, in Markdown and
        // uncapped: a user with 201 due/overdue tasks produced roughly 6,300
        // characters and Telegram rejected the whole message as too long.
        const message = buildDigestMessage(
          tasks
            .filter((t) => t.state === "today")
            .map((t) => ({
              name: t.item.name,
              workspace: workspaceNameForBoard(t.item.board_id),
            })),
          tasks
            .filter((t) => t.state === "overdue")
            .map((t) => ({
              name: t.item.name,
              workspace: workspaceNameForBoard(t.item.board_id),
            })),
          isLocale(languageOf.get(userId)) ? (languageOf.get(userId) as Locale) : DEFAULT_LOCALE
        );

        // Already filtered for activeUserIds above, so each of these is eligible.
        sends.push(notifyUsersViaTelegram([userId], message));
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

    await finishCronRun(runId, true, {
      eligibleProfiles: profiles.length,
      withTasks: sentCount,
      failed,
    });

    return NextResponse.json({
      success: true,
      eligibleProfiles: profiles.length,
      withTasks: sentCount,
      failed,
      message: `Daily digest sent to ${sentCount - failed} of ${sentCount} users with due work.`,
    });

  } catch (error) {
    console.error("[Daily Digest Cron] Error:", error);
    await finishCronRun(runId, false, {}, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
