/**
 * Declare what the status labels already on your boards mean.
 *
 * StatusOption.semantic exists now, but boards written before it carry none,
 * so every "is this finished?" on those columns still falls back to matching
 * the words. This writes the meaning down once, for labels whose meaning is
 * not in doubt.
 *
 * Deliberately a fixed table rather than the pattern fallback. A backfill runs
 * once and is then believed forever, so it should only record what is certain:
 * anything not listed here is left undeclared and keeps falling back, which is
 * no worse than today. Priority columns are untouched - a priority has no
 * notion of finished.
 *
 *   node scripts/backfill-status-semantics.mjs          report only
 *   node scripts/backfill-status-semantics.mjs --apply  write it
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Only labels whose meaning is unambiguous. Compared case-insensitively. */
const MEANING = {
  "done": "done",
  "fait": "done",
  "terminé": "done",
  "termine": "done",
  "working on it": "working",
  "en cours": "working",
  "stuck": "stuck",
  "bloqué": "stuck",
  "bloque": "stuck",
  "overdue": "stuck",
  "en retard": "stuck",
  "not started": "idle",
  "non commencé": "idle",
  "non commence": "idle",
};

const apply = process.argv.includes("--apply");

// Paged. A bare select stops at Supabase's db.max_rows, which defaults to 1000,
// and this script writes with --apply: a silent cap would leave every board past
// the first thousand un-backfilled, with the run still reporting success.
const boards = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("boards")
    .select("id, name, columns")
    .order("id")
    .range(from, from + 999);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  boards.push(...data);
  if (data.length < 1000) break;
}

let touchedBoards = 0;
let touchedLabels = 0;
const undeclared = new Map();

for (const board of boards) {
  let changed = false;
  const columns = (board.columns ?? []).map((col) => {
    const labels = col?.settings?.statusLabels;
    if (col?.type !== "status" || !Array.isArray(labels)) return col;

    const next = labels.map((opt) => {
      if (!opt || typeof opt.label !== "string" || opt.semantic) return opt;
      const semantic = MEANING[opt.label.trim().toLowerCase()];
      if (!semantic) {
        undeclared.set(opt.label, (undeclared.get(opt.label) ?? 0) + 1);
        return opt;
      }
      changed = true;
      touchedLabels++;
      return { ...opt, semantic };
    });

    return changed ? { ...col, settings: { ...col.settings, statusLabels: next } } : col;
  });

  if (!changed) continue;
  touchedBoards++;
  console.log(`  ${board.name}`);
  if (apply) {
    const { error: upErr } = await db.from("boards").update({ columns }).eq("id", board.id);
    if (upErr) {
      console.error(`    write failed: ${upErr.message}`);
      process.exit(1);
    }
  }
}

console.log(
  `\n${apply ? "Wrote" : "Would write"} ${touchedLabels} label(s) across ${touchedBoards} board(s).`
);
if (undeclared.size) {
  console.log("\nLeft undeclared (not in the certain-meaning table, still falls back):");
  for (const [label, n] of [...undeclared].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${JSON.stringify(label)}`);
  }
}
if (!apply) console.log("\nNothing written. Re-run with --apply.");
