/**
 * Your own saves in flight, so a refetch never shows a task from before them.
 *
 * An edit shows at once and saves in the background. If a refetch - set off by
 * a colleague's change, or by the echo of your previous edit - reads the task
 * while that save is still on its way, it brings back the old value, and the
 * cell flickers back to it until the next refetch. Refetches of editable data
 * go through `fetchSettled`, which waits for saves to finish and reads again
 * if one started while it was reading.
 *
 * The count comes from the Supabase client's fetch (see lib/supabase.ts), so
 * no save has to remember to report itself.
 */

let inFlight = 0;
/** Bumped each time a save starts, to tell whether one started during a read. */
let started = 0;
let waiters: (() => void)[] = [];

/**
 * The database functions that change tasks. Every other function is treated
 * as a read: counting a read here would make every board refetch - which calls
 * automations_for_board - see its own request and read again.
 */
const WRITE_RPCS = new Set(["merge_item_values", "undo_audit_log"]);

/** Whether a request to the database changes data. */
export function isWriteRequest(url: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return false;
  const path = url.split("?")[0];
  const at = path.indexOf("/rest/v1/");
  if (at === -1) return false;
  const rest = path.slice(at + "/rest/v1/".length);
  if (rest.startsWith("rpc/")) return WRITE_RPCS.has(rest.slice("rpc/".length));
  return true;
}

/** Wraps fetch so database writes are counted while they are in flight. */
export function trackWrites(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    if (!isWriteRequest(url, method)) return baseFetch(input, init);
    inFlight++;
    started++;
    try {
      return await baseFetch(input, init);
    } finally {
      inFlight--;
      if (inFlight === 0) {
        const done = waiters;
        waiters = [];
        done.forEach((resolve) => resolve());
      }
    }
  };
}

/** Resolves once no write is in flight, or after `maxMs` whatever happens. */
export function writesSettled(maxMs = 3000): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, maxMs);
    function finish() {
      clearTimeout(timer);
      waiters = waiters.filter((w) => w !== finish);
      resolve();
    }
    waiters.push(finish);
  });
}

/**
 * Runs a read once your own saves have landed, and again if a save started
 * while it ran - at most three times, so steady typing cannot stall it.
 */
export async function fetchSettled<T>(read: () => Promise<T>): Promise<T> {
  let result!: T;
  for (let attempt = 0; attempt < 3; attempt++) {
    await writesSettled();
    const before = started;
    result = await read();
    if (started === before && inFlight === 0) return result;
  }
  return result;
}

/** For tests. */
export function resetPendingWrites() {
  inFlight = 0;
  started = 0;
  waiters = [];
}
