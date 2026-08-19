import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { evaluateTimeAutomations } from "@/lib/automations/engine";

/**
 * Run a board's time-based rules on demand.
 *
 * Overdue tagging and SLA alerts are evaluated by a daily cron, so activating
 * one used to mean waiting until 09:00 UTC to learn whether it did anything —
 * which is indistinguishable from the automation being broken. This runs the
 * same evaluation for one board, now.
 *
 * It needs the service role, because the engine writes notifications addressed
 * to other people, which RLS rightly refuses from a normal session. So the
 * caller is authenticated and authorised FIRST, and the elevated client is then
 * confined to the single board they were authorised for.
 */
export async function POST(request: Request) {
  try {
    const { boardId } = await request.json().catch(() => ({ boardId: null }));
    if (!boardId || typeof boardId !== "string") {
      return NextResponse.json({ error: "A boardId is required" }, { status: 400 });
    }

    // 1. Who is asking?
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // 2. May they manage this board? Asked as the user, so RLS and the access
    //    model decide — not this route.
    const { data: allowed, error: permError } = await userClient.rpc("can_manage_board", {
      b_id: boardId,
    });
    if (permError) {
      return NextResponse.json({ error: "Could not check permissions" }, { status: 500 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "You cannot run automations on this board" },
        { status: 403 }
      );
    }

    // 3. Elevated, but scoped to that one board.
    const admin = createAdminClient();

    const { data: board, error: boardError } = await admin
      .from("boards")
      .select("*")
      .eq("id", boardId)
      .single();
    if (boardError || !board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const [{ data: items }, { data: profiles }, { data: automations }] = await Promise.all([
      admin.from("items").select("*").eq("board_id", boardId).is("deleted_at", null),
      admin.from("profiles").select("*"),
      admin
        .from("automations")
        .select("*")
        .or(`board_id.eq.${boardId},workspace_id.eq.${board.workspace_id}`),
    ]);

    const timeRules = (automations || []).filter(
      (a) =>
        (a.action_type === "overdue_tagging" || a.action_type === "sla_alert") &&
        a.enabled !== false
    );

    if (timeRules.length === 0) {
      return NextResponse.json({
        triggeredCount: 0,
        message: "This board has no scheduled rules switched on.",
      });
    }

    const result = await evaluateTimeAutomations(
      { ...board, items: items || [], automations: automations || [] } as never,
      (profiles || []) as never,
      admin
    );

    return NextResponse.json({
      triggeredCount: result.triggeredCount,
      updatedItemIds: result.updatedItemIds,
      message:
        result.triggeredCount === 0
          ? "Nothing matched right now — no item is overdue or due today."
          : `Updated ${result.triggeredCount} item${result.triggeredCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("[Automations Run] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
