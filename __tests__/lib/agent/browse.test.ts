import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Board, Column, Item } from "@/types";
import { listTasks } from "@/lib/agent/browse";
import type { AgentContext } from "@/lib/agent/service";

const columns: Column[] = [
  {
    id: "st",
    title: "Statut",
    type: "status",
    settings: { statusLabels: [{ label: "En cours", color: "" }, { label: "Fait", color: "" }] },
  } as Column,
];
const board: Board = { id: "b1", name: "Lancement", workspace_id: "w1", description: "", columns };

function item(n: number, status: string): Item {
  return { id: `i${n}`, name: `Task ${n}`, group_id: "g1", board_id: "b1", position: n, column_values: { st: status } } as Item;
}

/** Answers every query on a table with its rows, whatever the filters; enough for listTasks. */
function fakeSupabase(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const query: Record<string, unknown> = {
        // range() pages: the first page holds everything, the next is empty.
        range: (from: number) => Promise.resolve({ data: from === 0 ? rows : [], error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
      };
      for (const m of ["select", "eq", "is", "in", "order"]) query[m] = () => query;
      return query;
    },
  } as unknown as SupabaseClient;
}

function ctxWith(items: Item[]): AgentContext {
  return {
    supabase: fakeSupabase({
      groups: [{ id: "g1", board_id: "b1", title: "Todo", position: 0 }],
      items,
      user_directory: [],
    }),
    userId: "me",
    fullName: "Me",
    today: "2026-10-16",
    workspaces: [{ id: "w1", name: "App C", created_at: "" }],
    boards: [board],
    writable: new Set(),
    appUrl: "https://example.test",
  };
}

describe("listTasks", () => {
  it("returns every task, done ones included, by default", async () => {
    const ctx = ctxWith([item(1, "Fait"), item(2, "En cours"), item(3, "Fait")]);
    const result = await listTasks(ctx, { board_id: "b1" });
    expect(result.tasks).toHaveLength(3);
    expect(result.include_completed).toBe(true);
    expect(result.completed_hidden).toBe(0);
  });

  it("leaves done tasks out on request, and says how many", async () => {
    const ctx = ctxWith([item(1, "Fait"), item(2, "En cours"), item(3, "Fait")]);
    const result = await listTasks(ctx, { board_id: "b1", include_completed: false });
    expect(result.tasks.map((t) => t.name)).toEqual(["Task 2"]);
    expect(result.completed_hidden).toBe(2);
  });

  it("walks a board page by page without losing a task", async () => {
    const ctx = ctxWith(Array.from({ length: 7 }, (_, i) => item(i + 1, "En cours")));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof listTasks>> = await listTasks(ctx, { board_id: "b1", limit: 3, cursor });
      seen.push(...page.tasks.map((t) => t.id));
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen).toEqual(["i1", "i2", "i3", "i4", "i5", "i6", "i7"]);
  });
});
