import { NextResponse } from "next/server";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
    const body = await request.json();
    const { userIds, message } = body;

    if (!userIds || !Array.isArray(userIds) || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Await the notification to ensure it finishes before the route responds
    await notifyUsersViaTelegram(userIds, message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Telegram Notify API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
