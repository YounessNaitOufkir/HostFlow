import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTelegramAlert } from "@/lib/telegramAlerts";

// The kinds, the escaping and the recipient check live in lib/telegramAlerts,
// shared with the Claude connector. Re-exported for the existing tests.
export { KINDS } from "@/lib/telegramAlerts";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userIds, kind, vars } = body;

    if (!userIds || !Array.isArray(userIds) || typeof kind !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await sendTelegramAlert(supabase, userIds, kind, vars);
    if (!result.ok) {
      if (result.reason === "unknownKind") {
        return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
      }
      if (result.reason === "badRecipients") {
        return NextResponse.json({ error: "Invalid recipient list" }, { status: 400 });
      }
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, notified: result.notified });
  } catch (error) {
    console.error("[Telegram Notify API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
