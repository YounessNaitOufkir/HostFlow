import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { evaluateTimeAutomations } from "@/lib/automations/engine";

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

    let totalTriggered = 0;

    // 6. Evaluate time automations for each board
    for (const board of boards) {
      const boardItems = items.filter(item => item.board_id === board.id);
      const boardAutomations = automations.filter(a => a.board_id === board.id);

      // Nothing configured for this board — skip it rather than evaluating blind
      if (boardAutomations.length === 0) continue;

      const activeBoard = {
        ...board,
        items: boardItems,
        automations: boardAutomations
      };

      const result = await evaluateTimeAutomations(activeBoard, profiles, supabase);
      totalTriggered += result.triggeredCount;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Time-based automations executed successfully. Total triggered alerts: ${totalTriggered}.` 
    });

  } catch (error) {
    console.error("[Automations Cron] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
