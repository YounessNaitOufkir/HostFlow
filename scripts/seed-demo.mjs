/**
 * Seeds a self-contained demo tenant, and removes it again.
 *
 * Everything the README shows is captured against this data, never against a
 * real workspace. The demo lives behind its own account, which is a member of
 * nothing else, so a screenshot cannot accidentally contain somebody's work.
 *
 *   node scripts/seed-demo.mjs           # create
 *   node scripts/seed-demo.mjs --clean   # remove every row it created
 *
 * Purely additive. It reads no existing row and writes over none: the only
 * things it touches are the ones it made, all of which are identifiable by the
 * `demo.hostflow.test` email domain or by belonging to a workspace it created.
 * Removal relies on `on delete cascade`, so deleting the two workspaces and the
 * four profiles takes the boards, groups, items, links and memberships with it.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. That key bypasses row-level
 * security, which is the point — the demo people are profiles without login
 * accounts, and nothing but the service role may write those.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(join(here, "..", ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

export const DEMO_EMAIL = "salma@demo.hostflow.test";
export const DEMO_PASSWORD = "hostflow-demo-2f8c41";
const DEMO_DOMAIN = "@demo.hostflow.test";

const H = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...init.headers } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, rows) =>
  rest(table, { method: "POST", body: JSON.stringify(rows) });

async function auth(path, init = {}) {
  const r = await fetch(`${URL_}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`auth ${path} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── dates ───────────────────────────────────────────────────────────────────
// The plan is anchored four weeks back so that a capture always shows work
// behind, in progress and ahead of today — a chart of nothing but future bars
// says nothing about the tool.
const BASE = new Date();
BASE.setHours(12, 0, 0, 0);
BASE.setDate(BASE.getDate() - 28);

const day = (offset) => {
  const d = new Date(BASE);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const span = (offset, days) => ({ start: day(offset), end: day(offset + days - 1) });

// ── the cast ────────────────────────────────────────────────────────────────
// Salma has the login; the other three exist as profiles only. They never sign
// in, they are just names and colours on a board, which is all a demo needs.
const PEOPLE = [
  { key: "salma",  name: "Salma Benali",     initials: "SB", color: "#3d6fa8" },
  { key: "youssef", name: "Youssef Amrani",  initials: "YA", color: "#5b8c5a" },
  { key: "nadia",  name: "Nadia Cherkaoui",  initials: "NC", color: "#a0693f" },
  { key: "karim",  name: "Karim Tazi",       initials: "KT", color: "#7a6ba8" },
];

// ── board vocabulary ────────────────────────────────────────────────────────
// Deliberately not the built-in labels: a fit-out crew says "On site", not
// "Working on it". Each one declares what it MEANS, so the dashboard and the
// automations never have to guess from the words.
const STATUS_LABELS = [
  { label: "Done",              color: "bg-[#00c875]", semantic: "done" },
  { label: "On site",           color: "bg-[#fdab3d]", semantic: "working" },
  { label: "Blocked",           color: "bg-[#e2445c]", semantic: "stuck" },
  { label: "Awaiting sign-off", color: "bg-[#a25ddc]", semantic: "working" },
  { label: "Not started",       color: "bg-[#c4c4c4]", semantic: "idle" },
];

const fitOutColumns = () => [
  { id: "status", title: "Status", type: "status", width: 158, settings: { statusLabels: STATUS_LABELS } },
  { id: "owner", title: "Owner", type: "people", width: 104 },
  { id: "timeline", title: "Timeline", type: "timeline", width: 208 },
  { id: "priority", title: "Priority", type: "priority", width: 116 },
  { id: "deps", title: "Depends on", type: "dependency", width: 210 },
  { id: "budget", title: "Budget (MAD)", type: "numbers", width: 152, settings: { numberFormat: "currency", currencySymbol: "MAD" } },
  { id: "trade", title: "Trade", type: "tags", width: 132 },
];

const GROUPS = [
  { title: "Survey & design", color: "#579bfc" },
  { title: "Permits & procurement", color: "#a25ddc" },
  { title: "On site", color: "#fdab3d" },
  { title: "Handover", color: "#00c875" },
];

/** Résidence Anfa: the full plan, and the one every capture is framed on. */
const ANFA = [
  { g: 0, key: "survey",   name: "Measured survey",           status: "Done",              owner: "salma",   at: span(0, 4),   prio: "Medium",   budget: 13000,  trade: ["Survey"] },
  { g: 0, key: "concept",  name: "Concept pack",              status: "Done",              owner: "youssef",  at: span(5, 7),   prio: "High",     budget: 52000,  trade: ["Design"] },
  { g: 0, key: "signoff",  name: "Client sign-off — concept", status: "Done",              owner: "salma",   at: span(13, 1),  prio: "Critical", budget: null,  trade: ["Approval"] },
  { g: 1, key: "notice",   name: "Building notice",           status: "Done",              owner: "nadia", at: span(15, 10), prio: "High",     budget: 6900,   trade: ["Permits"] },
  { g: 1, key: "joinery",  name: "Joinery order",             status: "On site",           owner: "youssef",  at: span(16, 24), prio: "Critical", budget: 199000, trade: ["Joinery", "Long lead"] },
  { g: 1, key: "tile",     name: "Tile & stone order",        status: "Done",              owner: "nadia", at: span(20, 14), prio: "Medium",   budget: 73000,  trade: ["Finishes"] },
  { g: 2, key: "strip",    name: "Strip out",                 status: "Done",              owner: "karim",   at: span(26, 5),  prio: "Medium",   budget: 37000,  trade: ["Demolition"] },
  { g: 2, key: "elec1",    name: "First fix electrics",       status: "On site",           owner: "karim",   at: span(31, 6),  prio: "High",     budget: 85000,  trade: ["Electrical"] },
  { g: 2, key: "plumb1",   name: "First fix plumbing",        status: "On site",           owner: "nadia", at: span(31, 5),  prio: "High",     budget: 56000,  trade: ["Plumbing"] },
  { g: 2, key: "plaster",  name: "Plaster & skim",            status: "Not started",       owner: "karim",   at: span(38, 6),  prio: "Medium",   budget: 44000,  trade: ["Plaster"] },
  { g: 2, key: "install",  name: "Joinery install",           status: "Blocked",           owner: "youssef",  at: span(45, 8),  prio: "Critical", budget: 199000, trade: ["Joinery"] },
  { g: 2, key: "tiling",   name: "Tiling & stone",            status: "Not started",       owner: "nadia", at: span(45, 7),  prio: "Medium",   budget: 73000,  trade: ["Finishes"] },
  { g: 2, key: "second",   name: "Second fix & snag list",    status: "Not started",       owner: "karim",   at: span(54, 5),  prio: "High",     budget: 30000,  trade: ["Electrical", "Plumbing"] },
  { g: 3, key: "walk",     name: "Client walkthrough",        status: "Not started",       owner: "salma",   at: span(60, 1),  prio: "Critical", budget: null,  trade: ["Approval"] },
  { g: 3, key: "pack",     name: "Handover pack",             status: "Awaiting sign-off", owner: "salma",   at: span(61, 3),  prio: "Medium",   budget: 9800,   trade: ["Docs"] },
];

/**
 * Finish-to-start unless stated. Two of these are the reason the chart needs
 * link types at all: the two first-fix trades start together rather than one
 * after the other, and the joinery cannot be installed until a fortnight after
 * it was ordered, however early the plastering finishes.
 */
const ANFA_LINKS = [
  ["survey", "concept"], ["concept", "signoff"],
  ["signoff", "notice"], ["signoff", "joinery"], ["signoff", "tile"],
  ["notice", "strip"], ["strip", "elec1"],
  ["elec1", "plumb1", "SS", 0],
  ["elec1", "plaster"], ["plumb1", "plaster"],
  ["plaster", "install"], ["joinery", "install", "FS", 2], ["plaster", "tiling"],
  ["install", "second"], ["tiling", "second"],
  ["second", "walk"], ["walk", "pack"],
];

/** Villa Souissi runs the same process a few weeks behind — the product's thesis. */
const SOUISSI = [
  { g: 0, key: "survey",  name: "Measured survey",           status: "Done",        owner: "salma",   at: span(34, 3),  prio: "Medium",   budget: 13000, trade: ["Survey"] },
  { g: 0, key: "concept", name: "Concept pack",              status: "On site",     owner: "youssef",  at: span(38, 8),  prio: "High",     budget: 56000, trade: ["Design"] },
  { g: 0, key: "signoff", name: "Client sign-off — concept", status: "Not started", owner: "salma",   at: span(47, 1),  prio: "Critical", budget: null, trade: ["Approval"] },
  { g: 1, key: "notice",  name: "Building notice",           status: "Not started", owner: "nadia", at: span(48, 10), prio: "High",     budget: 6900,  trade: ["Permits"] },
  { g: 1, key: "joinery", name: "Joinery order",             status: "Not started", owner: "youssef",  at: span(49, 21), prio: "Critical", budget: 233000, trade: ["Joinery", "Long lead"] },
  { g: 2, key: "strip",   name: "Strip out",                 status: "Not started", owner: "karim",   at: span(59, 4),  prio: "Medium",   budget: 42000, trade: ["Demolition"] },
];

const SOUISSI_LINKS = [
  ["survey", "concept"], ["concept", "signoff"],
  ["signoff", "notice"], ["signoff", "joinery"], ["notice", "strip"],
];

/** A second shape of board, so the demo is not four copies of one layout. */
const OPS_COLUMNS = [
  { id: "status", title: "Status", type: "status", width: 158, settings: { statusLabels: STATUS_LABELS } },
  { id: "owner", title: "Owner", type: "people", width: 104 },
  { id: "due", title: "Due", type: "date", width: 130 },
  { id: "billable", title: "Billable", type: "checkbox", width: 96 },
  { id: "hours", title: "Hours", type: "numbers", width: 100 },
  { id: "notes", title: "Notes", type: "text", width: 240 },
];

const OPS = [
  { g: 0, name: "Insurance renewal",        status: "Awaiting sign-off", owner: "salma",   due: day(36), billable: false, hours: 2,  notes: "Quote received, waiting on the broker" },
  { g: 0, name: "Q3 invoicing",             status: "Done",              owner: "salma",   due: day(30), billable: false, hours: 6,  notes: "" },
  { g: 1, name: "Trade day rates 2027",     status: "On site",           owner: "youssef",  due: day(45), billable: false, hours: 4,  notes: "Two of four trades have replied" },
  { g: 1, name: "Site photography",         status: "Not started",       owner: "nadia", due: day(58), billable: true,  hours: 8,  notes: "Book once the joinery is in" },
];

const OPS_GROUPS = [
  { title: "Admin", color: "#579bfc" },
  { title: "Business development", color: "#00c875" },
];

// ── seeding ─────────────────────────────────────────────────────────────────

/**
 * Signing up hands every new account a starter workspace, written by a trigger
 * with no `created_by`, so it cannot be found by its creator. Membership is the
 * only handle on it — and a freshly made demo account is a member of nothing
 * else, so anything it belongs to at this point is its own starter.
 */
async function dropStarterWorkspaces(personIds) {
  const rows = await rest(
    `workspace_members?select=workspace_id&user_id=in.(${personIds.join(",")})`
  );
  const seen = new Set(rows.map((r) => r.workspace_id));
  for (const id of seen) {
    await rest(`workspaces?id=eq.${id}`, { method: "DELETE" });
  }
  return seen.size;
}

/**
 * Earlier runs deleted the account before its starter workspace, leaving a shell
 * with no creator, no members and no boards. A real user's starter workspace
 * always has that user as a member, so it can never match this.
 */
async function dropAbandonedStarters() {
  const shells = await rest(
    "workspaces?select=id,name,workspace_members(user_id),boards(id)&created_by=is.null"
  );
  let removed = 0;
  for (const w of shells) {
    if (w.workspace_members.length || w.boards.length) continue;
    await rest(`workspaces?id=eq.${w.id}`, { method: "DELETE" });
    removed += 1;
  }
  return removed;
}

async function findDemoUser() {
  const page = await auth("admin/users?per_page=200");
  return (page.users || []).find((u) => u.email === DEMO_EMAIL) || null;
}

async function seed() {
  let user = await findDemoUser();
  if (user) {
    console.log("· demo account already exists, reusing it");
  } else {
    user = await auth("admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Salma Benali" },
      }),
    });
    console.log("· created the demo account");
  }
  const ownerId = user.id;

  // The signup trigger writes a bare profile; give it a name and a colour.
  await rest(`profiles?id=eq.${ownerId}`, {
    method: "PATCH",
    body: JSON.stringify({
      full_name: "Salma Benali",
      avatar_initials: "SB",
      color: "#3d6fa8",
      role: "member",
      is_staff: false,
      is_onboarded: true,
      language: "en",
      daily_digest_enabled: false,
      email_notifications_enabled: false,
      telegram_notifications_enabled: false,
    }),
  });

  // `profiles.id` is a foreign key onto auth.users, so a person on a board is
  // necessarily an account. The other three get one with an unusable password —
  // they exist to be assigned work and to have a colour, never to sign in.
  const ids = { salma: ownerId };
  const existingUsers = (await auth("admin/users?per_page=200")).users || [];
  for (const p of PEOPLE.slice(1)) {
    const email = `${p.key}${DEMO_DOMAIN}`;
    const found = existingUsers.find((u) => u.email === email);
    const account =
      found ||
      (await auth("admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password: randomUUID() + randomUUID(),
          email_confirm: true,
          user_metadata: { full_name: p.name },
        }),
      }));
    await rest(`profiles?id=eq.${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        full_name: p.name,
        avatar_initials: p.initials,
        color: p.color,
        role: "member",
        is_staff: false,
        is_onboarded: true,
        language: "en",
        // No demo person may ever be mailed or messaged: these addresses are
        // not real, and a scheduled rule must not try to deliver to them.
        email_notifications_enabled: false,
        telegram_notifications_enabled: false,
        daily_digest_enabled: false,
      }),
    });
    ids[p.key] = account.id;
  }
  console.log(`· ${PEOPLE.length} people`);

  await dropStarterWorkspaces(Object.values(ids));

  const [studio] = await insert("workspaces", {
    name: "Atelier Zellige",
    is_private: true,
    created_by: ownerId,
  });
  const [personal] = await insert("workspaces", {
    name: "Personal",
    is_private: true,
    created_by: ownerId,
  });

  // Creating a workspace already enrols its creator, so this ignores the clash
  // rather than trying to work out which rows a trigger got to first.
  await rest("workspace_members?on_conflict=user_id,workspace_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(
      [studio, personal].flatMap((w) =>
        PEOPLE.map((p) => ({ user_id: ids[p.key], workspace_id: w.id, role: "member" }))
      )
    ),
  });
  console.log("· 2 workspaces");

  const makeBoard = async (spec) => {
    const [board] = await insert("boards", {
      name: spec.name,
      description: spec.description,
      workspace_id: spec.workspace,
      columns: spec.columns,
      position: spec.position,
      created_by: ownerId,
      item_name_column: spec.itemName || "Task",
      gantt_config: spec.gantt || null,
    });
    const groups = await insert(
      "groups",
      spec.groups.map((g, i) => ({ ...g, position: i, board_id: board.id }))
    );
    const rows = spec.items.map((it, i) => ({
      name: it.name,
      group_id: groups[it.g].id,
      board_id: board.id,
      position: i,
      column_values: spec.values(it, ids),
    }));
    const items = await insert("items", rows);
    const byKey = {};
    spec.items.forEach((it, i) => {
      if (it.key) byKey[it.key] = items[i].id;
    });
    return { board, groups, items, byKey };
  };

  const fitOutValues = (it, who) => ({
    status: it.status,
    owner: [who[it.owner]],
    timeline: it.at,
    priority: it.prio,
    budget: it.budget,
    trade: it.trade,
  });

  const anfa = await makeBoard({
    name: "Résidence Anfa · Fit-out",
    description: "Three-bed refurbishment, Boulevard d'Anfa, Casablanca. Client: R. Bennani.",
    workspace: studio.id,
    position: 0,
    columns: fitOutColumns(),
    groups: GROUPS,
    items: ANFA,
    values: fitOutValues,
    itemName: "Task",
    gantt: { timelineColumnId: "timeline", statusColumnId: "status", defaultZoom: "week", showCriticalPath: true },
  });

  const souissi = await makeBoard({
    name: "Villa Souissi · Fit-out",
    description: "Villa refit, Souissi, Rabat. Same process, five weeks behind.",
    workspace: studio.id,
    position: 1,
    columns: fitOutColumns(),
    groups: GROUPS,
    items: SOUISSI,
    values: fitOutValues,
    itemName: "Task",
    gantt: { timelineColumnId: "timeline", statusColumnId: "status", defaultZoom: "week", showCriticalPath: true },
  });

  await makeBoard({
    name: "Studio Operations",
    description: "Everything that is not a site.",
    workspace: studio.id,
    position: 2,
    columns: OPS_COLUMNS,
    groups: OPS_GROUPS,
    items: OPS,
    values: (it, who) => ({
      status: it.status,
      owner: [who[it.owner]],
      due: it.due,
      billable: it.billable,
      hours: it.hours,
      notes: it.notes,
    }),
  });

  await makeBoard({
    name: "Reading list",
    description: "Private to Salma — nobody else in the studio can open this.",
    workspace: personal.id,
    position: 0,
    columns: [
      { id: "status", title: "Status", type: "status", width: 158, settings: { statusLabels: STATUS_LABELS } },
      { id: "link", title: "Link", type: "link", width: 200 },
      { id: "rating", title: "Rating", type: "rating", width: 130, settings: { ratingMax: 5 } },
    ],
    groups: [{ title: "Detailing", color: "#a25ddc" }],
    items: [
      { g: 0, name: "Timber junctions that survive a wet trade", status: "Done", rating: 4 },
      { g: 0, name: "Reveal depths for flush skirting", status: "Not started", rating: 0 },
    ],
    values: (it) => ({ status: it.status, rating: it.rating }),
  });
  console.log("· 4 boards");

  // `source_item_id` is the predecessor and `target_item_id` the successor —
  // the same direction the dependency cell means when it lists the ids an item
  // waits on. Seeding these the other way round makes every pair a two-step
  // cycle, because the chart reads both the cell and the link.
  const linkRows = (links, boardKeyed) =>
    links.map(([from, to, type = "FS", lag = 0]) => ({
      source_item_id: boardKeyed[from],
      target_item_id: boardKeyed[to],
      link_type: "dependency",
      dep_type: type,
      lag_days: lag,
    }));

  await insert("item_links", [
    ...linkRows(ANFA_LINKS, anfa.byKey),
    ...linkRows(SOUISSI_LINKS, souissi.byKey),
  ]);

  // The dependency column has to show the same thing the chart draws, so write
  // each successor's predecessors into its own cell too.
  const writeDeps = async (byKey, links, items) => {
    const preds = {};
    for (const [from, to] of links) (preds[to] ||= []).push(byKey[from]);
    for (const [key, list] of Object.entries(preds)) {
      const id = byKey[key];
      const current = items.find((i) => i.id === id);
      await rest(`items?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ column_values: { ...current.column_values, deps: list } }),
      });
    }
  };
  await writeDeps(anfa.byKey, ANFA_LINKS, anfa.items);
  await writeDeps(souissi.byKey, SOUISSI_LINKS, souissi.items);
  console.log(`· ${ANFA_LINKS.length + SOUISSI_LINKS.length} dependencies`);

  // Two rules that only ever read the board. Nothing here moves an item into
  // another group, because a capture depends on the board staying as arranged.
  await insert("automations", [
    {
      board_id: anfa.board.id,
      trigger_column_id: "timeline",
      trigger_value: "due_date_arrives",
      action_type: "sla_alert",
      action_target_id: "assignee_email",
      enabled: true,
    },
    {
      board_id: anfa.board.id,
      trigger_column_id: "timeline",
      trigger_value: "due_date_passed",
      action_type: "overdue_tagging",
      action_target_id: "assignee_email",
      enabled: false,
    },
  ]);
  console.log("· 2 automations");

  console.log(`\nDemo ready. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("Remove it again with: node scripts/seed-demo.mjs --clean");
}

async function clean() {
  // Matched on the demo email domain, which nothing real uses.
  const accounts = ((await auth("admin/users?per_page=200")).users || []).filter((u) =>
    (u.email || "").endsWith(DEMO_DOMAIN)
  );

  // Workspaces first, while the memberships that identify them still exist.
  // A demo account is a member of demo workspaces and nothing else.
  if (accounts.length) {
    const n = await dropStarterWorkspaces(accounts.map((a) => a.id));
    console.log(`· removed ${n} workspaces`);
  }

  for (const a of accounts) {
    await rest(`profiles?id=eq.${a.id}`, { method: "DELETE" });
    await auth(`admin/users/${a.id}`, { method: "DELETE" });
  }
  console.log(`· removed ${accounts.length} demo accounts`);

  const shells = await dropAbandonedStarters();
  if (shells) console.log(`· removed ${shells} abandoned starter workspaces`);
  console.log("\nDemo removed.");
}

const mode = process.argv.includes("--clean") ? clean : seed;
mode().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
