import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { startCronRun, finishCronRun } from "@/lib/cronHeartbeat";
import type { Column } from "@/types";

const RETENTION_DAYS = 30;
const ATTACHMENTS_BUCKET = "attachments";

/**
 * Pulls the storage object key back out of a public URL.
 *
 * FilesCell stores the full `getPublicUrl()` string in column_values, not the
 * bare key `.storage.remove()` needs — `.../object/public/attachments/<key>`.
 * `updates` (comments) attachments live under the same bucket with a
 * `updates/` prefix but are not reachable from an item's column_values at
 * all; this route only ever sees file-column keys, which carry no prefix.
 */
function storageKeyFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${ATTACHMENTS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  let runId: string | null = null;
  try {
    // This route runs service-role and permanently deletes rows and files, so a
    // missing secret must not mean "let everyone in". Fail closed, same as the
    // other cron routes.
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured; refusing to run the trash purge.");
      return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    runId = await startCronRun("purge-trash");

    const supabase = createAdminClient();

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: expired, error: fetchError } = await supabase
      .from("items")
      .select("id, board_id, column_values")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);

    // Thrown, not returned: a return here would leave the cron_runs row open
    // with no `ok`, which the watchdog reads as a run still in flight.
    if (fetchError) throw fetchError;

    const items = expired ?? [];
    if (items.length === 0) {
      await finishCronRun(runId, true, { purged: 0, filesDeleted: 0 });
      return NextResponse.json({ success: true, purged: 0, filesDeleted: 0 });
    }

    // Which columns are files-type varies per board, so resolve it once for
    // every board these items belong to rather than per item.
    const boardIds = [...new Set(items.map((item) => item.board_id))];
    const { data: boards, error: boardsError } = await supabase
      .from("boards")
      .select("id, columns")
      .in("id", boardIds);
    if (boardsError) throw boardsError;

    const filesColumnsByBoard = new Map<string, string[]>();
    for (const board of boards ?? []) {
      const cols = ((board.columns ?? []) as Column[])
        .filter((c) => c.type === "files")
        .map((c) => c.id);
      filesColumnsByBoard.set(board.id, cols);
    }

    const storageKeys: string[] = [];
    for (const item of items) {
      const fileColumnIds = filesColumnsByBoard.get(item.board_id) ?? [];
      for (const colId of fileColumnIds) {
        const value = item.column_values?.[colId];
        if (!Array.isArray(value)) continue;
        for (const url of value) {
          if (typeof url !== "string") continue;
          const key = storageKeyFromPublicUrl(url);
          if (key) storageKeys.push(key);
        }
      }
    }

    let filesDeleted = 0;
    if (storageKeys.length > 0) {
      // Storage before rows: a purge that dies here just leaves files behind
      // for the next run to catch (items stay in the fetch until their row is
      // gone). Deleting the row first and then failing to remove the file
      // would orphan storage with no row left to retry it from.
      const { data: removed, error: removeError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove(storageKeys);
      if (removeError) {
        // Non-fatal: proceed to purge the rows anyway. Trash that never empties
        // because of one bad storage key is worse than a handful of orphaned
        // files, and this is reported in the heartbeat detail either way.
        console.error("[purge-trash] storage removal failed:", removeError.message);
      } else {
        filesDeleted = removed?.length ?? 0;
      }
    }

    const itemIds = items.map((item) => item.id);
    const { error: deleteError } = await supabase.from("items").delete().in("id", itemIds);
    if (deleteError) throw deleteError;

    await finishCronRun(runId, true, { purged: itemIds.length, filesDeleted });
    return NextResponse.json({ success: true, purged: itemIds.length, filesDeleted });
  } catch (error) {
    console.error("[Purge Trash Cron] Error:", error);
    await finishCronRun(runId, false, {}, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
