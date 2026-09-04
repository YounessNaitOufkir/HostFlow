import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { evaluateTimeAutomations } from "@/lib/automations/engine";
import { startCronRun, finishCronRun } from "@/lib/cronHeartbeat";

export async function GET(request: Request) {
  let runId: string | null = null;
  try {
    // 1. Verify CRON_SECRET for security
    //
    // This route runs service-role and reads every profile, board and item, so a
    // missing secret must not mean "let everyone in". Fail closed: no secret
    // configured is a deployment fault, not an invitation.
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured; refusing to run automations.");
      return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Opened only after the secret checks out: an unauthorised probe must not
    // be able to leave a trace that makes the job look alive.
    runId = await startCronRun("automations");

    const supabase = createAdminClient();

    // 2. Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*");

    if (profilesError || !profiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // 3. Fetch boards
    const { data: boards, error: boardsError } = await supabase
      .from("boards")
      .select("*");

    if (boardsError || !boards) {
      return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
    }

    // 4. Fetch all active items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("*")
      .is("deleted_at", null);

    if (itemsError || !items) {
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
    }

    // 5. Fetch the configured automations. Without these, evaluateTimeAutomations
    // sees an empty rule list and every time-based rule is a no-op.
    const { data: automations, error: automationsError } = await supabase
      .from("automations")
      .select("*");

    if (automationsError || !automations) {
      return NextResponse.json({ error: "Failed to fetch automations" }, { status: 500 });
    }

    // 6. The company timezone decides what "today" means for overdue and SLA rules.
    // Not fatal if it is missing: evaluateTimeAutomations falls back to UTC, which
    // is the behaviour this route had before the setting was wired up at all.
    const { data: orgSettings } = await supabase
      .from("organization_settings")
      .select("default_timezone")
      .limit(1)
      .maybeSingle();
    const orgTimeZone = orgSettings?.default_timezone ?? null;

    let totalTriggered = 0;

    // 6. Evaluate time automations for each board
    for (const board of boards) {
      const boardItems = items.filter(item => item.board_id === board.id);
      // A board inherits its workspace's rules as well as its own
      const boardAutomations = automations.filter(
        a => a.board_id === board.id || a.workspace_id === board.workspace_id
      );

      // Nothing configured for this board — skip it rather than evaluating blind
      if (boardAutomations.length === 0) continue;

      const activeBoard = {
        ...board,
        items: boardItems,
        automations: boardAutomations
      };

      const result = await evaluateTimeAutomations(activeBoard, profiles, supabase, false, orgTimeZone);
      totalTriggered += result.triggeredCount;
    }

    await finishCronRun(runId, true, { triggered: totalTriggered });

    return NextResponse.json({ 
      success: true, 
      message: `Time-based automations executed successfully. Total triggered alerts: ${totalTriggered}.` 
    });

  } catch (error) {
    console.error("[Automations Cron] Error:", error);
    await finishCronRun(runId, false, {}, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
