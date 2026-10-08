import { createHash } from "node:crypto";
import { AgentError, fail, type AgentContext } from "@/lib/agent/service";

/**
 * At most once per request_id.
 *
 * An assistant retries when a reply is slow or lost, and a retried "create
 * task" must not create a second task. A write tool given a request_id claims
 * it in public.agent_requests first; a retry with the same id gets the first
 * result back and writes nothing. The same id with a different request is
 * refused rather than guessed at.
 *
 * confirm_notify is left out of the fingerprint on purpose: approving the
 * notification is the same request asked again, not a different one.
 */

/** Key order must not change the fingerprint. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function fingerprint(tool: string, payload: Record<string, unknown>): string {
  const rest = { ...payload };
  delete rest.request_id;
  delete rest.confirm_notify;
  return createHash("sha256").update(`${tool}:${stableStringify(rest)}`).digest("hex");
}

export async function once<T>(
  ctx: AgentContext,
  tool: string,
  payload: Record<string, unknown>,
  run: () => Promise<T>
): Promise<T | (T & { replayed: true })> {
  const requestId = typeof payload.request_id === "string" ? payload.request_id.trim() : "";
  if (!requestId) return run();

  const { data, error } = await ctx.supabase.rpc("agent_claim_request", {
    p_key: requestId,
    p_tool: tool,
    p_hash: fingerprint(tool, payload),
  });
  if (error) fail(error, "check whether this request was already made");
  const claim = (data ?? {}) as { claimed?: boolean; replay?: T; running?: boolean; conflict?: boolean };

  if (claim.replay !== undefined) {
    return { ...(claim.replay as T), replayed: true };
  }
  if (claim.conflict) {
    throw new AgentError(`request_id "${requestId}" was already used for a different request. Use a new request_id.`);
  }
  if (claim.running) {
    throw new AgentError(
      `Request "${requestId}" is still being processed. Wait a moment, then retry with the same request_id to get its result.`
    );
  }

  try {
    const result = await run();
    await ctx.supabase.rpc("agent_finish_request", { p_key: requestId, p_status: "done", p_result: result });
    return result;
  } catch (error) {
    // Failed (or stopped for confirmation): the same id may be claimed again.
    await ctx.supabase.rpc("agent_finish_request", { p_key: requestId, p_status: "failed", p_result: null });
    throw error;
  }
}
