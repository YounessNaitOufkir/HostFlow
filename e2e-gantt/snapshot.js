/**
 * A read-only fingerprint of everything that already exists.
 *
 * Taken before and after the end-to-end run and diffed, so "I changed nothing
 * that was already there" is a demonstrated fact rather than an assurance.
 */
const { writeFileSync, readFileSync } = require("fs");

// Parsed by hand: this script lives outside the project, so it cannot resolve
// dotenv from node_modules.
const env = Object.fromEntries(
  readFileSync(require("path").join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function page(headers, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function main() {
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  if (!auth.ok) throw new Error("login failed: " + auth.status);
  const { access_token } = await auth.json();
  const headers = { apikey: key, Authorization: `Bearer ${access_token}` };

  const items = await page(
    headers,
    "items?select=id,name,board_id,group_id,position,column_values,baseline,deleted_at&order=id"
  );
  const links = await page(
    headers,
    "item_links?select=id,source_item_id,target_item_id,link_type,dep_type,lag_days&order=id"
  );
  const groups = await page(headers, "groups?select=id,title,board_id,position&order=id");
  const boards = await page(headers, "boards?select=id,name,workspace_id,gantt_config&order=id");

  const fingerprint = {
    items: Object.fromEntries(items.map((i) => [i.id, JSON.stringify(i)])),
    links: Object.fromEntries(links.map((l) => [l.id, JSON.stringify(l)])),
    groups: Object.fromEntries(groups.map((g) => [g.id, JSON.stringify(g)])),
    boards: Object.fromEntries(boards.map((b) => [b.id, JSON.stringify(b)])),
  };

  writeFileSync(process.argv[2], JSON.stringify(fingerprint));
  console.log(
    `snapshot: ${items.length} items, ${links.length} links, ${groups.length} groups, ${boards.length} boards -> ${process.argv[2]}`
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
