import { createMcpHandler, getPublicOrigin, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AgentError, find, getDelays, getMyTasks, loadContext, type AgentContext } from "@/lib/agent/service";
import {
  ConfirmationNeeded,
  addComment,
  createSubtask,
  createTask,
  moveTask,
  setStatus,
  updateTask,
} from "@/lib/agent/edits";
import { getBoard, getTask, listBoards, listMembers, listTasks, listWorkspaces } from "@/lib/agent/browse";
import { once } from "@/lib/agent/requests";

/**
 * The Claude connector: HostFlow's tools for an AI assistant, over MCP.
 *
 * Every call carries the person's own Supabase token, issued by Supabase's
 * OAuth server when they clicked Allow on /oauth/consent. The tools run with a
 * client built from THAT token - never the service role - so row-level
 * security decides every read and write exactly as in the app, and the
 * database applies the person's AI scope on top of it: only the workspaces
 * they ticked in Profile settings › AI assistant are visible, only those with
 * Write ticked can change, and AI access switched off, deletes, and writes
 * outside the gate's allow-list are refused by Postgres itself, whatever this
 * file does.
 *
 * See docs/plans/claude-connector-v1.md and claude-connector-v2.md.
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
async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
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
    // Links in answers open on the address the assistant connected to.
    extra: { userId: data.user.id, origin: getPublicOrigin(req) },
  };
}

/** A tool's answer: JSON for Claude to read, or a sentence when it went wrong. */
function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] };
}

function replyError(error: unknown) {
  // Not a failure: the write is waiting for the person's approval.
  if (error instanceof ConfirmationNeeded) {
    return reply({
      needs_confirmation: true,
      would_notify: error.wouldNotify,
      message:
        `${error.message} Nothing was written. Ask the person whether to go ahead; ` +
        "if they agree, call the same tool again with the same arguments plus confirm_notify: true.",
    });
  }
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
 * the refusal is a clear sentence - the database refuses regardless.
 */
async function asPerson<T>(authInfo: AuthInfo | undefined, run: (ctx: AgentContext) => Promise<T>) {
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

    const origin = typeof authInfo.extra?.origin === "string" ? authInfo.extra.origin : "https://www.hostflow-app.com";
    const ctx = await loadContext(supabase, userId, origin);
    if (ctx.workspaces.length === 0) {
      throw new AgentError(
        "No workspaces are shared with your assistant yet. Choose them in HostFlow › Profile settings › AI assistant."
      );
    }
    return reply(await run(ctx));
  } catch (error) {
    return replyError(error);
  }
}

const ID = z.string().uuid();
const requestId = z
  .string()
  .min(1)
  .max(200)
  .optional()
  .describe(
    "Your own unique id for this write (e.g. a UUID). Retrying with the same request_id returns the first result instead of writing twice."
  );
const confirmNotify = z
  .boolean()
  .optional()
  .describe("Set to true only after the person approved notifying the colleagues named in a needs_confirmation answer.");
const fields = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Field values by column_id (or exact column title), in the format get_board gives for each column. null clears a field."
  );

const handler = createMcpHandler(
  (server) => {
    // ─── Reads by name (v1) ─────────────────────────────────────
    server.registerTool(
      "my_tasks",
      {
        title: "My tasks",
        description:
          "The signed-in person's open tasks (done tasks are never included), within their assistant's workspaces. " +
          "range: today = running today plus anything overdue; week = the next 7 days plus overdue; " +
          "overdue = past their end date; all = every open task. Dates are the company's local dates.",
        inputSchema: z.object({ range: z.enum(["today", "week", "overdue", "all"]).default("today") }),
        annotations: { readOnlyHint: true },
      },
      async ({ range }, ctx) =>
        asPerson(ctx.http?.authInfo, async (agent) => ({ today: agent.today, tasks: await getMyTasks(agent, range) }))
    );

    server.registerTool(
      "delays",
      {
        title: "Delays",
        description:
          "Open tasks that are overdue, stuck, or behind their agreed baseline, with how late they are, who is " +
          "assigned, and the delay reasons people recorded. Leave both fields empty for everything in scope.",
        inputSchema: z.object({
          workspace: z.string().optional().describe("Only this workspace, by name."),
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
        description: "Search workspaces, boards and tasks by name. Returns task ids for the other tools.",
        inputSchema: z.object({ query: z.string().min(1) }),
        annotations: { readOnlyHint: true },
      },
      async ({ query }, ctx) => asPerson(ctx.http?.authInfo, (agent) => find(agent, query))
    );

    // ─── Reads by id (v2) ───────────────────────────────────────
    server.registerTool(
      "list_workspaces",
      {
        title: "List workspaces",
        description:
          "The workspaces this assistant may use, with their ids and whether it may change them (read only, or read and " +
          "write). Start here. A workspace is one property or area; its boards are its projects or phases.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async (_input, ctx) => asPerson(ctx.http?.authInfo, async (agent) => ({ workspaces: listWorkspaces(agent) }))
    );

    server.registerTool(
      "list_boards",
      {
        title: "List boards",
        description: "The boards in one workspace, with their ids and links.",
        inputSchema: z.object({ workspace_id: ID }),
        annotations: { readOnlyHint: true },
      },
      async ({ workspace_id }, ctx) => asPerson(ctx.http?.authInfo, async (agent) => listBoards(agent, workspace_id))
    );

    server.registerTool(
      "get_board",
      {
        title: "Get board",
        description:
          "A board's groups and columns with their stable ids: each column's type, whether it can be written, its " +
          "status or priority options, and the value format update_task expects.",
        inputSchema: z.object({ board_id: ID }),
        annotations: { readOnlyHint: true },
      },
      async ({ board_id }, ctx) => asPerson(ctx.http?.authInfo, (agent) => getBoard(agent, board_id))
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description:
          "Tasks on a board in board order, a page at a time. Completed tasks are left out unless include_completed is " +
          "true. Pass next_cursor back as cursor for the next page; null means there are no more.",
        inputSchema: z.object({
          board_id: ID,
          group_id: ID.optional().describe("Only this group."),
          include_completed: z.boolean().optional(),
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional().describe("Page size, default 50."),
        }),
        annotations: { readOnlyHint: true },
      },
      async (input, ctx) => asPerson(ctx.http?.authInfo, (agent) => listTasks(agent, input))
    );

    server.registerTool(
      "get_task",
      {
        title: "Get task",
        description:
          "Everything about one task: every field (by column id and title), comments with replies, its subtasks or " +
          "parent, and the tasks it depends on or blocks.",
        inputSchema: z.object({ task_id: ID }),
        annotations: { readOnlyHint: true },
      },
      async ({ task_id }, ctx) => asPerson(ctx.http?.authInfo, (agent) => getTask(agent, task_id))
    );

    server.registerTool(
      "list_members",
      {
        title: "List members",
        description:
          "Who belongs to a workspace or board, with their role and how they got access. Give workspace_id or board_id.",
        inputSchema: z.object({ workspace_id: ID.optional(), board_id: ID.optional() }),
        annotations: { readOnlyHint: true },
      },
      async (input, ctx) => asPerson(ctx.http?.authInfo, (agent) => listMembers(agent, input))
    );

    // ─── Writes ─────────────────────────────────────────────────
    server.registerTool(
      "create_task",
      {
        title: "Create task",
        description:
          "Create a task. Prefer board_id and group_id (from list_boards / get_board); names also work, and when a name " +
          "is ambiguous the answer lists the options - ask, never guess. If it would assign someone else, the answer is " +
          "needs_confirmation and nothing is written until the person approves. Returns the task id, link and side effects.",
        inputSchema: z.object({
          board_id: ID.optional(),
          group_id: ID.optional(),
          board: z.string().optional().describe('Board by name, as "Workspace › Board", when no board_id.'),
          workspace: z.string().optional().describe("Workspace by name, to tell same-named boards apart."),
          group: z.string().optional().describe("Group by name. Defaults to the board's first group."),
          name: z.string().min(1).describe("The task's name."),
          fields,
          start: z.string().optional().describe("Shortcut: start date, YYYY-MM-DD."),
          end: z.string().optional().describe("Shortcut: end date or deadline, YYYY-MM-DD."),
          assignee: z.string().optional().describe('Shortcut: who it is for - a name, a person id, or "me".'),
          status: z.string().optional().describe("Shortcut: initial status, in the board's words or by meaning."),
          confirm_notify: confirmNotify,
          request_id: requestId,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) => once(agent, "create_task", input, () => createTask(agent, input)))
    );

    server.registerTool(
      "create_subtask",
      {
        title: "Create subtask",
        description:
          "Create a subtask under a task, on the same board (in the parent's group unless group_id is given). One level: " +
          "a subtask cannot have subtasks. Same fields and confirmation rules as create_task.",
        inputSchema: z.object({
          parent_task_id: ID,
          name: z.string().min(1),
          group_id: ID.optional(),
          fields,
          confirm_notify: confirmNotify,
          request_id: requestId,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) => once(agent, "create_subtask", input, () => createSubtask(agent, input)))
    );

    server.registerTool(
      "update_task",
      {
        title: "Update task",
        description:
          "Change a task's name and/or fields (dates, assignees, status, any writable custom field) by column id. Board " +
          "rules run as in the app: the Done checkbox follows the status, a done task may move to Completed, dependent " +
          "tasks are rescheduled when dates move, Google Calendar is updated. Assigning someone else needs confirmation " +
          "(see create_task). Returns the side effects.",
        inputSchema: z.object({
          task_id: ID,
          name: z.string().optional(),
          fields,
          confirm_notify: confirmNotify,
          request_id: requestId,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) => once(agent, "update_task", input, () => updateTask(agent, input)))
    );

    server.registerTool(
      "move_task",
      {
        title: "Move task",
        description: "Move a task to another group of the same board (it goes to the bottom of that group).",
        inputSchema: z.object({ task_id: ID, group_id: ID, request_id: requestId }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) =>
          once(agent, "move_task", input, () => moveTask(agent, input.task_id, input.group_id))
        )
    );

    server.registerTool(
      "set_status",
      {
        title: "Set status",
        description:
          "Change a task's status. The status can be the board's own label or a meaning (done, working, stuck); unclear " +
          "values return the board's labels. Board rules run as in the app.",
        inputSchema: z.object({ task_id: ID.describe("The task's id."), status: z.string().min(1), request_id: requestId }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) =>
          once(agent, "set_status", input, () => setStatus(agent, input.task_id, input.status))
        )
    );

    server.registerTool(
      "add_comment",
      {
        title: "Add comment",
        description: "Post a comment (an update) on a task, as the signed-in person. Plain text. It notifies nobody.",
        inputSchema: z.object({
          task_id: ID.describe("The task's id."),
          text: z.string().min(1).max(5000),
          request_id: requestId,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async (input, ctx) =>
        asPerson(ctx.http?.authInfo, (agent) =>
          once(agent, "add_comment", input, () => addComment(agent, input.task_id, input.text))
        )
    );
  },
  {
    serverInfo: { name: "HostFlow", version: "2.0.0" },
    instructions:
      "HostFlow is Host'lik's project management app. A workspace is one property or area and its boards are its " +
      'projects or phases, so board names repeat: name boards as "Workspace › Board", or better, use ids from ' +
      "list_workspaces / list_boards / get_board. You only see the workspaces the person shared with you. When a tool " +
      "answers with a list of options, ask the person instead of picking. When it answers needs_confirmation, ask " +
      "before calling again with confirm_notify. Give every write a fresh request_id and reuse it on retries. Report " +
      "what a tool actually returned, including its side_effects; never claim a change it did not confirm.",
  }
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  // The path-suffixed form, so the 401 names this connector's own metadata.
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
