/**
 * Creates a throwaway board to exercise the Gantt against.
 *
 * Purely additive: a new board, a new group, new items, new links. Nothing that
 * already existed is read for anything but the workspace id, and nothing is
 * updated or deleted. The tests then drag, resize, link and baseline only the
 * tasks created here, so no existing task can be reached even through a
 * dependency chain.
 */
const { writeFileSync, readFileSync } = require("fs");

const env = Object.fromEntries(
  readFileSync(require("path").join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TIMELINE_COL = "gantt-e2e-timeline";
const STATUS_COL = "gantt-e2e-status";
const DEP_COL = "gantt-e2e-dep";

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  if (!auth.ok) throw new Error("login failed: " + auth.status);
  const { access_token } = await auth.json();
  const H = {
    apikey: key,
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const post = async (table, body) => {
    const r = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  const workspaces = await (
    await fetch(`${url}/rest/v1/workspaces?select=id,name`, { headers: H })
  ).json();
  const testWorkspace = workspaces.find((w) => w.name === "Test");
  if (!testWorkspace) throw new Error("no 'Test' workspace");

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const [board] = await post("boards", {
    name: `ZZ Gantt E2E ${stamp}`,
    description: "Scratch board created by an automated Gantt test. Safe to delete.",
    workspace_id: testWorkspace.id,
    columns: [
      { id: TIMELINE_COL, title: "Works", type: "timeline" },
      { id: STATUS_COL, title: "Status", type: "status" },
      { id: DEP_COL, title: "Depends on", type: "dependency" },
    ],
  });

  const [group] = await post("groups", {
    title: "Phase 1",
    color: "#00c875",
    position: 0,
    board_id: board.id,
  });

  // Six back-to-back tasks starting a fortnight out, plus a one-day milestone.
  const base = new Date();
  base.setDate(base.getDate() + 14);
  const specs = [
    { name: "E2E Permis", offset: 0, days: 5 },
    { name: "E2E Devis", offset: 6, days: 5 },
    { name: "E2E Travaux", offset: 12, days: 8 },
    { name: "E2E Finitions", offset: 21, days: 4 },
    { name: "E2E Livraison", offset: 26, days: 1 },
    { name: "E2E Independant", offset: 3, days: 3 },
  ];

  const items = [];
  for (const [i, spec] of specs.entries()) {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + spec.offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + spec.days - 1);
    const [item] = await post("items", {
      name: spec.name,
      group_id: group.id,
      board_id: board.id,
      position: i,
      column_values: {
        [TIMELINE_COL]: { start: iso(start), end: iso(end) },
        [STATUS_COL]: ["Working on it", "Done", "Stuck"][i % 3],
      },
    });
    items.push(item);
  }

  // A chain, so rescheduling and the critical path have something to work on.
  const links = [];
  for (const [a, b, depType, lag] of [
    [0, 1, "FS", 0],
    [1, 2, "FS", 0],
    [2, 3, "FS", 0],
    [3, 4, "FS", 0],
  ]) {
    const [link] = await post("item_links", {
      source_item_id: items[a].id,
      target_item_id: items[b].id,
      link_type: "dependency",
      dep_type: depType,
      lag_days: lag,
    });
    links.push(link);
  }

  const fixture = {
    workspaceId: testWorkspace.id,
    workspaceName: testWorkspace.name,
    boardId: board.id,
    boardName: board.name,
    groupId: group.id,
    columns: { timeline: TIMELINE_COL, status: STATUS_COL, dependency: DEP_COL },
    items: items.map((i) => ({ id: i.id, name: i.name, values: i.column_values })),
    links: links.map((l) => l.id),
  };

  writeFileSync(process.argv[2], JSON.stringify(fixture, null, 1));
  console.log(`seeded board "${board.name}" with ${items.length} items and ${links.length} links`);
  console.log(`board id: ${board.id}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
