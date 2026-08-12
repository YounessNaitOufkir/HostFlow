import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: items } = await supabase.from("items").select("*");
  const { data: boards } = await supabase.from("boards").select("*");
  
  return NextResponse.json({ items, boards, env: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
}
