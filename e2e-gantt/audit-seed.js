/**
 * Builds a purpose-made network for auditing the Gantt, with an answer worked
 * out in advance so the chart can be checked against arithmetic rather than
 * impressions.
 *
 * Purely additive, and deliberately so: a new workspace, three new boards, new
 * groups, new items, new links. Nothing existing is read except to find the
 * "Test" workspace, and nothing existing is updated or deleted. Every task the
 * audit drags, links or reschedules was created here, so no Host'lik work can
 * be reached even along a dependency chain.
 *
 * The network, in day offsets from a fixed base:
 *
 *   A Permis      0-4    (5d)  ─FS→ B Devis   5-8   (4d)
 *   B                          ─FS→ C Travaux 9-18 (10d)
 *   C                          ─FS→ D Finit. 19-23  (5d)
 *   D                          ─FS→ E Livr.  24     (1d, milestone)
 *
 *   A ─FS+3 lag→ I Commande      8-9    (2d)
 *   C ─SS→       G Suivi         9-10   (2d)
 *   D ─FF→       F Nettoyage    21-23   (3d)
 *   C ─FS→       J Retard       10-12   (3d)   ← breaks: starts before C ends
 *                H Independant   2-4    (3d)   ← no links at all
 *
 * So the longest path is A→B→C→D→E at 25 days, and the critical set is exactly
 * those five. Everything else carries float. There is exactly one broken link.
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

const TL = "audit-timeline";
const ST = "audit-status";
const DEP = "audit-dep";
const PEOPLE = "audit-people";

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Everything starts a fortnight out, so nothing lands in the past mid-run. */
const BASE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
})();

const at = (offset, days) => {
  const start = new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
  return { start: iso(start), end: iso(end) };
};

const COLUMNS = [
  { id: TL, title: "Works", type: "timeline" },
  { id: ST, title: "Status", type: "status" },
  { id: PEOPLE, title: "Owner", type: "people" },
  { id: DEP, title: "Depends on", type: "dependency" },
];

async function main() {
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  if (!auth.ok) throw new Error("login failed: " + auth.status);
  const { access_token, user } = await auth.json();
  const HEADERS = {
    apikey: key,
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const post = async (table, body) => {
    const r = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  const workspaces = await (
    await fetch(`${url}/rest/v1/workspaces?select=id,name`, { headers: HEADERS })
  ).json();
  const testWs = workspaces.find((w) => w.name === "Test");
  if (!testWs) throw new Error("no 'Test' workspace");

  const stamp = new Date().toISOString().slice(11, 16).replace(":", "");

  // A second workspace, so the cross-property path has two properties to cross.
  const [otherWs] = await post("workspaces", {
    name: `ZZ Audit WS ${stamp}`,
    is_private: false,
    created_by: user.id,
  });

  const makeBoard = (name, workspaceId) =>
    post("boards", {
      name,
      description: "Scratch board from the Gantt audit. Safe to delete.",
      workspace_id: workspaceId,
      columns: COLUMNS,
    }).then(([b]) => b);

  const boardA = await makeBoard(`ZZ Audit A ${stamp}`, testWs.id);
  const boardB = await makeBoard(`ZZ Audit B ${stamp}`, testWs.id);
  const boardC = await makeBoard(`ZZ Audit C ${stamp}`, otherWs.id);

  const makeGroup = (title, color, boardId, position) =>
    post("groups", { title, color, position, board_id: boardId }).then(([g]) => g);

  const chantier = await makeGroup("Chantier", "#579bfc", boardA.id, 0);
  const annexe = await makeGroup("Annexe", "#fdab3d", boardA.id, 1);
  const groupB = await makeGroup("Livraisons", "#00c875", boardB.id, 0);
  const groupC = await makeGroup("Autre propriété", "#a25ddc", boardC.id, 0);

  let position = 0;
  const make = async (name, group, board, offset, days, status) => {
    const [row] = await post("items", {
      name,
      group_id: group.id,
      board_id: board.id,
      position: position++,
      column_values: {
        [TL]: at(offset, days),
        [ST]: status,
        [PEOPLE]: [user.id],
      },
    });
    return row;
  };

  // The critical chain, then everything that should carry float.
  const A = await make("A Permis", chantier, boardA, 0, 5, "Done");
  const B = await make("B Devis", chantier, boardA, 5, 4, "Done");
  const C = await make("C Travaux", chantier, boardA, 9, 10, "Working on it");
  const D = await make("D Finitions", chantier, boardA, 19, 5, "Not Started");
  const E = await make("E Livraison", chantier, boardA, 24, 1, "Not Started");

  const F = await make("F Nettoyage", annexe, boardA, 21, 3, "Not Started");
  const G = await make("G Suivi", annexe, boardA, 9, 2, "Working on it");
  const H = await make("H Independant", annexe, boardA, 2, 3, "Stuck");
  const I = await make("I Commande", annexe, boardA, 8, 2, "Not Started");
  const J = await make("J Retard", annexe, boardA, 10, 3, "Stuck");

  const K = await make("K Autre board", groupB, boardB, 12, 4, "Not Started");
  const L = await make("L Autre propriete", groupC, boardC, 14, 4, "Not Started");

  const link = (source, target, depType, lag) =>
    post("item_links", {
      source_item_id: source.id,
      target_item_id: target.id,
      link_type: "dependency",
      dep_type: depType,
      lag_days: lag,
    }).then(([l]) => l);

  const links = {
    ab: await link(A, B, "FS", 0),
    bc: await link(B, C, "FS", 0),
    cd: await link(C, D, "FS", 0),
    de: await link(D, E, "FS", 0),
    ai: await link(A, I, "FS", 3), // positive lag
    cg: await link(C, G, "SS", 0), // start together
    df: await link(D, F, "FF", 0), // finish together
    cj: await link(C, J, "FS", 0), // deliberately broken: J starts before C ends
    ck: await link(C, K, "FS", 0), // across boards, same property
    cl: await link(C, L, "FS", 0), // across properties
  };

  const fixture = {
    baseDate: iso(BASE),
    userId: user.id,
    workspaces: { test: testWs, other: otherWs },
    boards: { a: boardA, b: boardB, c: boardC },
    groups: { chantier, annexe, groupB, groupC },
    columns: { timeline: TL, status: ST, dependency: DEP, people: PEOPLE },
    items: Object.fromEntries(
      [A, B, C, D, E, F, G, H, I, J, K, L].map((i) => [i.name, { id: i.id, values: i.column_values }])
    ),
    links: Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v.id])),
    /** Worked out from the network above, for the audit to check against. */
    expected: {
      criticalNames: ["A Permis", "B Devis", "C Travaux", "D Finitions", "E Livraison"],
      brokenLinkCount: 1,
      brokenLinkTarget: "J Retard",
      milestone: "E Livraison",
      floatingNames: ["F Nettoyage", "G Suivi", "H Independant", "I Commande"],
    },
  };

  writeFileSync(process.argv[2], JSON.stringify(fixture, null, 1));
  console.log(`seeded workspace "${otherWs.name}" and boards:`);
  console.log(`  A ${boardA.name}  (10 tasks, 8 links)`);
  console.log(`  B ${boardB.name}  (1 task, cross-board link)`);
  console.log(`  C ${boardC.name}  (1 task, cross-property link)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
