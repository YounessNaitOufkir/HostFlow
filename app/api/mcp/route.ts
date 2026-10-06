import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AgentError,
  addComment,
  createTask,
  find,
  getDelays,
  getMyTasks,
  loadContext,
  setStatus,
} from "@/lib/agent/service";

/**
 * The Claude connector: HostFlow's tools for an AI assistant, over MCP.
 *
 * Every call carries the person's own Supabase token, issued by Supabase's
 * OAuth server when they clicked Allow on /oauth/consent. The tools run with a
 * client built from THAT token - never the service role - so row-level
 * security decides every read and write exactly as in the app, and the
 * database's AI gate (public.agent_request_gate) applies on top of it: AI
 * access switched off, deletes, and writes outside the v1 allow-list are all
 * refused by Postgres itself, whatever this file does.
 *
 * See docs/plans/claude-connector-v1.md.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function claimsOf(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Accept only a token Supabase's OAuth server issued to a client.
 *
 * The client_id claim is what the database gate keys on. A normal app session
 * token has none, so accepting one here would run the tools with no AI gate at
 * all - the one thing this route must never do.
 */
async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  // Asked of the Auth server, not decoded locally, so a revoked session or a
  // signed-out person is refused here rather than at the first query.
  const { data, error } = await userClient(bearerToken).auth.getUser(bearerToken);
  if (error || !data.user) return undefined;

  const claims = claimsOf(bearerToken);
  const clientId = typeof claims?.client_id === "string" ? claims.client_id : null;
  if (!clientId) return undefined;

  return {
    token: bearerToken,
    clientId,
    scopes: typeof claims?.scope === "string" ? claims.scope.split(" ") : [],
    expiresAt: typeof claims?.exp === "number" ? claims.exp : undefined,
    extra: { userId: data.user.id },
  };
}

/** A tool's answer: JSON for Claude to read, or a sentence when it went wrong. */
function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] };
}

function replyError(error: unknown) {
  if (error instanceof AgentError) {
    const text = error.options.length
      ? `${error.message}\n${error.options.map((o) => `- ${o}`).join("\n")}`
      : error.message;
    return { isError: true, content: [{ type: "text" as const, text }] };
  }
  console.error("[mcp] tool failed:", error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: "Something went wrong in HostFlow. Nothing was changed." }],
  };
}

/**
 * Run a tool as the person behind the token. AI access is checked here too, so
 * the refusal is a clear sentence - the database gate refuses regardless.
 */
async function asPerson<T>(
  authInfo: AuthInfo | undefined,
  run: (ctx: Awaited<ReturnType<typeof loadContext>>) => Promise<T>
) {
  try {
    const userId = authInfo?.extra?.userId;
    if (!authInfo || typeof userId !== "string") throw new AgentError("Sign in to HostFlow again.");
    const supabase = userClient(authInfo.token);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("ai_access")
      .eq("id", userId)
      .maybeSingle();
    // Before the migration that adds the column and the gate, nothing here may
    // run: without the gate, the token's writes would be unchecked.
    if (error?.code === "42703") throw new AgentError("The HostFlow connector is not set up yet.");
    if (error && error.code !== "42501") throw error;
    if (error || !profile?.ai_access) {
      throw new AgentError("AI access is off for your HostFlow account. Ask an admin to turn it on.");
    }

    const ctx = await loadContext(supabase, userId);
    return reply(await run(ctx));
  } catch (error) {
    return replyError(error);
  }
}

const boardFields = {
  board: z
    .string()
    .describe('The board, as "Workspace › Board" (e.g. "App C › Lancement") or just its name.'),
  workspace: z
    .string()
    .optional()
    .describe("The workspace (property) the board is in. Board names repeat across workspaces."),
};

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "my_tasks",
      {
        title: "My tasks",
        description:
          "The signed-in person's open tasks (done tasks are never included). " +
          "range: today = running today plus anything overdue; week = the next 7 days plus overdue; " +
          "overdue = past their end date; all = every open task. Dates are the company's local dates.",
        inputSchema: z.object({
          range: z.enum(["today", "week", "overdue", "all"]).default("today"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ range }, ctx) =>
        asPerson(ctx.http?.authInfo, async (agent) => ({
          today: agent.today,
          tasks: await getMyTasks(agent, range),
        }))
    );

    server.registerTool(
      "delays",
      {
        title: "Delays",
        description:
          "Open tasks that are overdue, stuck, or behind their agreed baseline, with how late they are, " +
          "who is assigned, and the delay reasons people recorded. Leave both fields empty for everything " +
          "the person can see, or narrow to one workspace or one board.",
        inputSchema: z.object({
          workspace: z.string().optional().describe("Only this workspace (property)."),
          board: z.string().optional().describe('Only this board, as "Workspace › Board" or its name.'),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ workspace, board }, ctx) =>
        asPerson(ctx.http?.authInfo, async (agent) => ({
          today: agent.today,
          delays: await getDelays(agent, { workspace, board }),
        }))
    );

    server.registerTool(
      "find",
      {
        title: "Find",
        description:
          "Search workspaces, boards and tasks by name. Use it to get a task's id before changing its " +
          "status or commenting on it, and to see the exact board names.",
        inputSchema: z.object({ query: z.string().min(1) }),
        annotations: { readOnlyHint: true },
      },
      async ({ query }, ctx) => asPerson(ctx.http?.authInfo, (agent) => find(agent, query))
    );

    server.registerTool(
      "create_task",
      {
        title: "Create task",
        description:
          "Create a task on a board. If the board, group, status or person is ambiguous or not found, " +
          "the answer lists the options: ask the person which one, never guess. Dates are YYYY-MM-DD; " +
          "a single deadline goes in `end`.",
        inputSchema: z.object({
          ...boardFields,
          name: z.string().min(1).describe("The task's name."),
          group: z.string().optional().describe("The group to add it to. Defaults to the board's first group."),
          start: z.string().optional().describe("Start date, YYYY-MM-DD."),
          end: z.string().optional().describe("End date or deadline, YYYY-MM-DD."),
          assignee: z.string().optional().describe('Who it is for: a colleague\'s name, or "me".'),
          status: z.string().optional().describe("Initial status, in the board's words or by meaning (e.g. done, stuck)."),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async (input, ctx) => asPerson(ctx.http?.authInfo, (agent) => createTask(agent, input))
    );

    server.registerTool(
      "set_status",
      {
        title: "Set status",
        description:
          "Change a task's status. The status can be the board's own label or a meaning (done, working, " +
          "stuck); unclear values return the board's labels to choose from. Board rules run as in the app " +
          "(a done task may move to the Completed group).",
        inputSchema: z.object({
          task_id: z.string().uuid().describe("The task's id, from my_tasks, delays or find."),
          status: z.string().min(1),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ task_id, status }, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) => setStatus(agent, task_id, status))
    );

    server.registerTool(
      "add_comment",
      {
        title: "Add comment",
        description: "Post a comment (an update) on a task, as the signed-in person. Plain text.",
        inputSchema: z.object({
          task_id: z.string().uuid().describe("The task's id, from my_tasks, delays or find."),
          text: z.string().min(1).max(5000),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ task_id, text }, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) => addComment(agent, task_id, text))
    );
  },
  {
    serverInfo: { name: "HostFlow", version: "1.0.0" },
    instructions:
      "HostFlow is Host'lik's project management app. A workspace is one property (apartment) and its " +
      "boards are that property's phases, so board names repeat: always name boards as " +
      '"Workspace › Board". When a tool answers with a list of options, ask the person which one they ' +
      "mean instead of picking. Report what a tool actually returned; never claim a change it did not confirm.",
  }
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  // The path-suffixed form, so the 401 names this connector's own metadata.
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
