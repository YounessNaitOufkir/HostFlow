import { createBrowserClient } from "@supabase/ssr";
import { trackWrites } from "@/lib/pendingWrites";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  // Saves in flight are counted, so a refetch waits for them - see lib/pendingWrites.
  global: { fetch: trackWrites((input, init) => fetch(input, init)) },
  realtime: {
    // The live connection's keep-alive runs in a worker. Browsers slow the
    // timers of a background tab to once a minute, which missed the keep-alive
    // and dropped the connection - and every change made while it was down.
    // Only where workers exist: the client throws without one (tests, and any
    // browser that lacks them keeps the ordinary keep-alive).
    worker: typeof window !== "undefined" && typeof window.Worker === "function",
  },
});
