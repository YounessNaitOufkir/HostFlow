/**
 * Does the access model actually hold?
 *
 * Roughly twenty SECURITY DEFINER functions and fifteen migrations' worth of
 * policies carry the whole product promise: externals see only what they are
 * given, private workspaces stay private even from administrators, a board
 * grant on one side does not leak the other. Nothing tested any of it.
 *
 * The reason that matters more than the usual missing-coverage argument is the
 * failure mode. A broken policy does not throw. It returns rows. Every other
 * bug here announces itself; this class arrives silently and is discovered by
 * the wrong person.
 *
 * So this signs in as three real users over the anon key - the same path the
 * browser takes, policies and all - and asserts what each of them can see.
 * Reading with the service role would prove nothing: it bypasses RLS.
 *
 *   node scripts/rls-audit.mjs          seed if needed, then check
 *   node scripts/rls-audit.mjs --clean  remove the fixtures and exit
 *
 * Fixtures are namespaced "ZZ RLS" and idempotent, so a second run reuses the
 * first run's rows. Nothing here reads or writes anything outside them.
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

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const TAG = "ZZ RLS";
const PASSWORD = "rls-audit-" + "fixture-9f3b";
const USERS = {
  admin:    { email: "rls-admin@hostflow.test",    name: "ZZ RLS Admin",    role: "admin",  staff: true  },
  member:   { email: "rls-member@hostflow.test",   name: "ZZ RLS Member",   role: "member", staff: true  },
  external: { email: "rls-external@hostflow.test", name: "ZZ RLS External", role: "member", staff: false },
};

// ---------------------------------------------------------------- helpers

async function findUser(email) {
  // listUsers is paged; these fixtures sit among few enough accounts to scan.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(key) {
  const spec = USERS[key];
  let user = await findUser(spec.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: spec.name },
    });
    if (error) throw new Error(`create ${spec.email}: ${error.message}`);
    user = data.user;
    // handle_new_user builds the profile and a private workspace; give the
    // trigger a moment before we read either back.
    await new Promise((r) => setTimeout(r, 900));
  } else {
    // Keep the password known across runs, in case it was ever changed.
    await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
  }

  // is_staff and the name are ours to set. `role` is not: a BEFORE UPDATE
  // trigger lets only a global admin change it, and the service role carries
  // no auth.uid(), so it is refused here exactly as it would be in the app.
  // That guard is the thing being tested, so it is not worked around - the
  // admin fixture's role is granted once, out of band, and run() reports it
  // rather than pretending.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ is_staff: spec.staff, full_name: spec.name })
    .eq("id", user.id);
  if (pErr) throw new Error(`profile ${spec.email}: ${pErr.message}`);
  return user;
}

async function ensureRow(table, match, insert) {
  const { data: found } = await admin.from(table).select("id").match(match).limit(1);
  if (found?.length) return found[0].id;
  const { data, error } = await admin.from(table).insert(insert).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}

/** A client authenticated as one fixture user, going through RLS like a browser. */
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

// ---------------------------------------------------------------- teardown

async function clean() {
  const { data: ws } = await admin.from("workspaces").select("id").like("name", `${TAG}%`);
  const wsIds = (ws ?? []).map((w) => w.id);
  const { data: bs } = await admin.from("boards").select("id").like("name", `${TAG}%`);
  const bIds = (bs ?? []).map((b) => b.id);

  if (bIds.length) {
    const { data: its } = await admin.from("items").select("id").in("board_id", bIds);
    const itemIds = (its ?? []).map((i) => i.id);
    if (itemIds.length) await admin.from("updates").delete().in("item_id", itemIds);
    await admin.from("items").delete().in("board_id", bIds);
    await admin.from("groups").delete().in("board_id", bIds);
    await admin.from("boards").delete().in("id", bIds);
  }
  if (wsIds.length) {
    await admin.from("workspace_members").delete().in("workspace_id", wsIds);
    await admin.from("workspaces").delete().in("id", wsIds);
  }
  for (const spec of Object.values(USERS)) {
    const u = await findUser(spec.email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  console.log("Fixtures removed.");
}

// ---------------------------------------------------------------- seed

async function seed() {
  const users = {
    admin: await ensureUser("admin"),
    member: await ensureUser("member"),
    external: await ensureUser("external"),
  };

  // A shared company workspace: is_private false, so staff reach it by role.
  const companyWs = await ensureRow(
    "workspaces",
    { name: `${TAG} Company` },
    { name: `${TAG} Company`, is_private: false, created_by: users.admin.id }
  );

  // The member's own private workspace, made by handle_new_user at signup. This
  // is the real thing rather than one we fabricated, which is the point: it is
  // the row an administrator must not be able to read.
  const { data: privWs } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("created_by", users.member.id)
    .eq("is_private", true)
    .limit(1);
  if (!privWs?.length) throw new Error("member has no private workspace - did handle_new_user run?");
  const privateWs = privWs[0].id;

  const openBoardColumns = [
    { id: "status", title: "Status", type: "status" },
    { id: "people", title: "Assignee", type: "people" },
  ];
  const openBoard = await ensureRow(
    "boards",
    { name: `${TAG} Open` },
    { name: `${TAG} Open`, workspace_id: companyWs, created_by: users.admin.id, columns: openBoardColumns }
  );
  // ensureRow only inserts on first run; a fixture from before the audit
  // trigger existed would otherwise keep columns: [] forever, and the
  // status_changed check below needs a real status column to resolve against.
  await admin.from("boards").update({ columns: openBoardColumns }).eq("id", openBoard);
  const secretBoard = await ensureRow(
    "boards",
    { name: `${TAG} Secret` },
    { name: `${TAG} Secret`, workspace_id: privateWs, created_by: users.member.id, columns: [] }
  );

  for (const [board, owner] of [[openBoard, users.admin.id], [secretBoard, users.member.id]]) {
    const group = await ensureRow(
      "groups",
      { board_id: board },
      { board_id: board, title: `${TAG} Group`, position: 0 }
    );
    await ensureRow(
      "items",
      { board_id: board },
      { board_id: board, group_id: group, name: `${TAG} Item`, position: 0 }
    );
    void owner;
  }

  // A comment on the company board. The first version of this audit checked
  // boards, items, workspaces and profiles and called it done - and missed
  // that `updates` carried a policy of literally `true`, so every comment in
  // the system was readable by anyone who could sign in. Coverage that stops
  // at the tables you happened to think of is how that survives.
  const { data: openItem } = await admin
    .from("items").select("id").eq("board_id", openBoard).limit(1).single();
  if (openItem) {
    await ensureRow("updates", { item_id: openItem.id }, {
      item_id: openItem.id,
      body: "<p>ZZ RLS comment</p>",
      author_id: users.member.id,
      author_name: "ZZ RLS Member",
    });

    // Trips the items_audit_update trigger: a real old->new diff on a column
    // of type "status", which the trigger resolves via boards.columns rather
    // than a fixed schema column. Run every time (not just on first seed) so
    // the audit_logs checks below always have a status_changed row to find.
    await admin.from("items").update({ column_values: { status: "Working on it" } }).eq("id", openItem.id);
    await admin.from("items").update({ column_values: { status: "Done" } }).eq("id", openItem.id);
  }

  // The member is a member of the company workspace; the external is not.
  await ensureRow(
    "workspace_members",
    { user_id: users.member.id, workspace_id: companyWs },
    { user_id: users.member.id, workspace_id: companyWs, role: "member" }
  );

  // Without this the two administrator checks below would pass for the wrong
  // reason: a plain staff account also sees company boards and also cannot see
  // someone else's private one. The role is granted out of band, because only
  // a global admin may change a role - itself one of the guards under test.
  const { data: adminProfile } = await admin
    .from("profiles").select("role").eq("id", users.admin.id).single();
  if (adminProfile?.role !== "admin") {
    throw new Error(
      `${USERS.admin.email} is role=${adminProfile?.role}, so the administrator ` +
      "checks would prove nothing. Grant it once, as a global admin:\n" +
      `  UPDATE profiles SET role = 'admin' WHERE email = '${USERS.admin.email}';`
    );
  }

  return { users, companyWs, privateWs, openBoard, secretBoard, openItem: openItem?.id ?? null };
}

// ---------------------------------------------------------------- checks

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function visibleBoardIds(client) {
  const { data, error } = await client.from("boards").select("id, name");
  if (error) return { ids: [], names: [], error: error.message };
  return { ids: data.map((b) => b.id), names: data.map((b) => b.name), error: null };
}

async function run() {
  console.log("Seeding fixtures…");
  const fx = await seed();
  console.log("Signing in as each fixture user…\n");

  const asAdmin = await signIn(USERS.admin.email);
  const asMember = await signIn(USERS.member.email);
  const asExternal = await signIn(USERS.external.email);

  const adminB = await visibleBoardIds(asAdmin);
  const memberB = await visibleBoardIds(asMember);
  const externalB = await visibleBoardIds(asExternal);

  console.log("Company workspace");
  check(
    "an external account sees no company board",
    !externalB.ids.includes(fx.openBoard),
    `external sees ${externalB.ids.length} board(s) in total`
  );
  check(
    "a staff member sees the company board",
    memberB.ids.includes(fx.openBoard)
  );
  check(
    "an administrator sees the company board",
    adminB.ids.includes(fx.openBoard)
  );

  console.log("\nPrivate workspace");
  check(
    "its owner sees their own private board",
    memberB.ids.includes(fx.secretBoard)
  );
  check(
    "an administrator does NOT see someone else's private board",
    !adminB.ids.includes(fx.secretBoard),
    "admins reach company workspaces by role, never private ones"
  );
  check(
    "an external account does NOT see it either",
    !externalB.ids.includes(fx.secretBoard)
  );

  console.log("\nItems below a board the caller cannot reach");
  const { data: extItems } = await asExternal.from("items").select("id").eq("board_id", fx.openBoard);
  check("an external account reads no item on the company board", (extItems ?? []).length === 0);
  const { data: admItems } = await asAdmin.from("items").select("id").eq("board_id", fx.secretBoard);
  check("an administrator reads no item on a private board", (admItems ?? []).length === 0);

  console.log("\nWriting where you cannot read");
  const { error: insErr } = await asExternal
    .from("items")
    .insert({ board_id: fx.openBoard, group_id: null, name: "should not exist", position: 0 });
  check("an external account cannot insert into the company board", !!insErr,
    insErr ? insErr.code || "rejected" : "INSERT SUCCEEDED");

  const { data: privRows } = await asExternal.from("workspaces").select("id").eq("id", fx.privateWs);
  check("an external account cannot read the private workspace row", (privRows ?? []).length === 0);

  console.log("\nComments");
  const extUpdates = await asExternal.from("updates").select("id", { count: "exact", head: true });
  check(
    "an external account reads no comment at all",
    (extUpdates.count ?? 0) === 0,
    `sees ${extUpdates.count ?? 0} comment row(s)`
  );
  const memUpdates = await asMember.from("updates").select("id");
  check(
    "someone who can reach the board still reads its comments",
    (memUpdates.data ?? []).length > 0,
    "closing a leak must not take the feature with it"
  );
  if (fx.openItem) {
    const { data: me } = await asExternal.auth.getUser();
    const { error: postErr } = await asExternal.from("updates").insert({
      item_id: fx.openItem,
      body: "<p>should not exist</p>",
      author_id: me.user?.id,
      author_name: "probe",
    });
    check(
      "an external account cannot post a comment onto that board",
      !!postErr,
      postErr ? postErr.code || "rejected" : "INSERT SUCCEEDED"
    );
  }

  console.log("\nActivity");
  // An admin used to read the change history of private workspaces: the policy
  // was `user_id = auth.uid() OR is_global_admin()`, which never looked at the
  // board. `action` is a sentence carrying the column name and both values.
  const admActivity = await asAdmin.from("activity_logs").select("id").eq("board_id", fx.secretBoard);
  check(
    "an administrator reads no activity from a private board",
    (admActivity.data ?? []).length === 0
  );
  const extActivity = await asExternal.from("activity_logs").select("id", { count: "exact", head: true });
  check("an external account reads no activity at all", (extActivity.count ?? 0) === 0);

  console.log("\nAudit trail");
  // audit_logs is deliberately stricter than activity_logs above: not "the
  // author or anyone who can reach the board", but administrators only - and
  // never even they for a board they cannot reach. can_access_board_as()
  // already refuses private boards to admins, so reusing it here (rather than
  // restating the rule) carries that guarantee for free.
  const adminAuditOpen = await asAdmin.from("audit_logs").select("id, action_type").eq("board_id", fx.openBoard);
  check(
    "an administrator reads the audit trail for a board they can reach",
    (adminAuditOpen.data ?? []).length > 0,
    `sees ${(adminAuditOpen.data ?? []).length} row(s)`
  );
  check(
    "a jsonb column_values diff resolved to a status_changed row",
    (adminAuditOpen.data ?? []).some((r) => r.action_type === "status_changed"),
    "proves the trigger reads boards.columns rather than a fixed column list"
  );
  const adminAuditSecret = await asAdmin.from("audit_logs").select("id").eq("board_id", fx.secretBoard);
  check(
    "an administrator reads NO audit trail from someone else's private board",
    (adminAuditSecret.data ?? []).length === 0,
    "admins reach company boards by role, never private ones"
  );
  const memberAudit = await asMember.from("audit_logs").select("id").eq("board_id", fx.openBoard);
  check(
    "a non-admin staff member reads NO audit trail, even for a board they fully access",
    (memberAudit.data ?? []).length === 0,
    "audit_logs is admin-only; activity_logs is the one board members read"
  );
  const extAudit = await asExternal.from("audit_logs").select("id", { count: "exact", head: true });
  check("an external account reads no audit trail at all", (extAudit.count ?? 0) === 0);

  const forgeAttempt = await asAdmin.from("audit_logs").insert({
    board_id: fx.openBoard,
    action_type: "item_created",
    new_value: { name: "forged" },
  });
  check(
    "not even an administrator can write an audit_logs row directly",
    forgeAttempt.error !== null,
    forgeAttempt.error ? forgeAttempt.error.code ?? forgeAttempt.error.message : "THE INSERT SUCCEEDED"
  );

  console.log("\nAttachments");
  // storage.objects had a SELECT policy of just `bucket_id = 'attachments'`
  // beside an owner-scoped one. Permissive policies are ORed, so every
  // signed-in account could list and download the private bucket.
  const extFiles = await asExternal.storage.from("attachments").list("updates", { limit: 100 });
  check(
    "an external account cannot list the private attachments bucket",
    (extFiles.data ?? []).length === 0,
    extFiles.error ? "refused" : `sees ${(extFiles.data ?? []).length} object(s)`
  );

  console.log("\nWebhooks");
  // A global webhook (board_id NULL) was readable by anyone signed in, and an
  // endpoint URL routinely carries its own token.
  const extHooks = await asExternal.from("webhooks").select("id", { count: "exact", head: true });
  check("an external account reads no webhook", (extHooks.count ?? 0) === 0);

  console.log("\nProfiles");
  const { data: profs } = await asExternal.from("profiles").select("id");
  check("an external account does not enumerate every profile",
    (profs ?? []).length <= 1,
    `sees ${(profs ?? []).length} profile row(s)`);

  // Privilege escalation. "Profiles: Update own" decides which ROW you may write
  // and never which columns, and there is no trigger on profiles - so the only
  // thing standing between any signed-in account and `role = 'admin'` is the
  // column GRANT. The client only offers that button to the platform owner, but
  // the client is not the boundary. Both flags are set at once because
  // profiles_admin_implies_staff would otherwise reject the row for the wrong
  // reason and hide a grant that is still open.
  const { data: me } = await asExternal.auth.getUser();
  const externalId = me?.user?.id;

  const escalate = await asExternal
    .from("profiles")
    .update({ role: "admin", is_staff: true })
    .eq("id", externalId);
  check("an external account cannot make itself an administrator",
    escalate.error !== null,
    escalate.error ? escalate.error.code ?? escalate.error.message : "THE UPDATE WAS ACCEPTED");

  const ownerGrab = await asExternal
    .from("profiles")
    .update({ is_owner: true })
    .eq("id", externalId);
  check("an external account cannot make itself the platform owner",
    ownerGrab.error !== null,
    ownerGrab.error ? ownerGrab.error.code ?? ownerGrab.error.message : "THE UPDATE WAS ACCEPTED");

  // The escalation must fail because the column is ungranted, not because the
  // row was already what it claimed. Read it back through the service role.
  const { data: after } = await admin
    .from("profiles")
    .select("role, is_staff, is_owner")
    .eq("id", externalId)
    .single();
  check("the external account is still an ordinary member",
    after?.role !== "admin" && after?.is_owner !== true,
    `role=${after?.role} is_staff=${after?.is_staff} is_owner=${after?.is_owner}`);

  // Closing the hole must not take ordinary profile editing with it.
  const rename = await asExternal
    .from("profiles")
    .update({ full_name: "ZZ RLS External" })
    .eq("id", externalId);
  check("an account can still edit its own name",
    rename.error === null,
    rename.error ? rename.error.message : "accepted");

  // The other half of that trade-off, and the one that fails in silence.
  //
  // Every user-editable column has to be named in the grant that replaced the
  // table-wide one. A column left out is not an error: PostgREST accepts the
  // request, updates nothing, and reports success - so the settings screen
  // looks like it saved and the preference simply never persists. Read back
  // rather than trusting the absent error.
  const wanted =
    (await admin.from("profiles").select("digest_channel").eq("id", externalId).single())
      .data?.digest_channel === "telegram" ? "email" : "telegram";
  await asExternal.from("profiles").update({ digest_channel: wanted }).eq("id", externalId);
  const { data: channel } = await admin
    .from("profiles")
    .select("digest_channel")
    .eq("id", externalId)
    .single();
  check("an account can still set its own digest channel",
    channel?.digest_channel === wanted,
    channel?.digest_channel === wanted
      ? `saved as ${wanted}`
      : `WROTE ${wanted} BUT READ BACK ${channel?.digest_channel} - column not granted`);

  console.log("\nOAuth tokens");
  // The connect button used to select google_refresh_token just to test it for
  // null. A refresh token does not expire the way an access token does, so it
  // must never reach the browser - not even the owner's own.
  for (const col of ["google_refresh_token", "google_access_token"]) {
    const probe = await asExternal.from("user_integrations").select(col);
    check(`a client cannot read ${col}`,
      probe.error !== null,
      probe.error ? probe.error.code ?? probe.error.message : "THE COLUMN WAS RETURNED");
  }
  const connected = await asExternal.from("user_integrations").select("google_connected");
  check("the connected flag is still readable",
    connected.error === null,
    connected.error ? connected.error.message : "readable");

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  · ${f.name}`);
    process.exit(1);
  }
}

const mode = process.argv[2];
try {
  if (mode === "--clean") await clean();
  else await run();
} catch (err) {
  console.error("\nAudit could not complete:", err.message);
  process.exit(2);
}
