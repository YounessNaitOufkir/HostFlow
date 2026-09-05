/**
 * Issues a key for the public API at /api/v1/tasks.
 *
 *   node scripts/issue-api-key.mjs <email> [label]
 *   node scripts/issue-api-key.mjs --list
 *   node scripts/issue-api-key.mjs --revoke <id>
 *
 * There was no way to do this before, which is part of why that endpoint had
 * never worked: the route looked up a column that does not exist, and nothing
 * anywhere created a key to look up. The rows that do exist hold 21-character
 * values in a column called `key_hash` - tokens, not digests - so they cannot
 * authenticate anything now that the route hashes what it is given. Revoke them.
 *
 * The key is printed once. Only its SHA-256 is stored, so a database read or a
 * backup no longer hands over working credentials, and a lost key is reissued
 * rather than recovered.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

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

// Kept identical to lib/apiKeys.ts on purpose; a script that cannot import the
// app's TypeScript must not be allowed to drift from how the route hashes.
const PREFIX = "hf_";
const generate = () => `${PREFIX}${randomBytes(32).toString("base64url")}`;
const hash = (key) => createHash("sha256").update(key, "utf8").digest("hex");

async function list() {
  const rows = await rest("api_keys?select=id,name,user_id,key_hash,created_at&order=created_at");
  if (rows.length === 0) return console.log("No API keys.");
  console.log("id                                    created              name");
  for (const r of rows) {
    // 64 hex characters is a SHA-256. Anything else predates the hashing and
    // cannot authenticate, because the route hashes before it looks up.
    const usable = typeof r.key_hash === "string" && /^[0-9a-f]{64}$/.test(r.key_hash);
    console.log(
      `${r.id}  ${String(r.created_at).slice(0, 19)}  ${r.name || "(unnamed)"}` +
        (usable ? "" : "   [LEGACY - cannot authenticate, revoke it]")
    );
  }
}

async function revoke(id) {
  await rest(`api_keys?id=eq.${id}`, { method: "DELETE" });
  console.log(`Revoked ${id}.`);
}

async function issue(email, label) {
  const profiles = await rest(`profiles?select=id,email&email=eq.${encodeURIComponent(email)}`);
  if (profiles.length === 0) throw new Error(`No account with the address ${email}`);

  const key = generate();
  const [row] = await rest("api_keys", {
    method: "POST",
    body: JSON.stringify({
      user_id: profiles[0].id,
      name: label || "API key",
      key_hash: hash(key),
    }),
  });

  console.log(`\nIssued for ${email}`);
  console.log(`  id     ${row.id}`);
  console.log(`  key    ${key}`);
  console.log("\nThis is the only time the key is shown - only its hash is stored.");
  console.log("Use it as:  Authorization: Bearer <key>\n");
}

const [arg, value] = process.argv.slice(2);
try {
  if (arg === "--list") await list();
  else if (arg === "--revoke" && value) await revoke(value);
  else if (arg && !arg.startsWith("--")) await issue(arg, process.argv[3]);
  else {
    console.log("Usage:");
    console.log("  node scripts/issue-api-key.mjs <email> [label]");
    console.log("  node scripts/issue-api-key.mjs --list");
    console.log("  node scripts/issue-api-key.mjs --revoke <id>");
    process.exit(1);
  }
} catch (e) {
  console.error("\n" + e.message);
  process.exit(1);
}
