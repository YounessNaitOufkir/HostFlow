import { describe, it, expect } from "vitest";
import { fetchAllRows, chunkIds } from "@/lib/supabasePaging";

interface Row {
  id: number;
}

/**
 * A fake PostgREST endpoint holding `total` rows and refusing to return more
 * than `serverCap` of them at a time - which is exactly what `db.max_rows`
 * does, silently.
 */
function fakeTable(total: number, serverCap = 1000) {
  const calls: [number, number][] = [];
  const all: Row[] = Array.from({ length: total }, (_, i) => ({ id: i }));

  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const requested = to - from + 1;
    const slice = all.slice(from, from + Math.min(requested, serverCap));
    return { data: slice, error: null };
  };

  return { page, calls };
}

describe("fetchAllRows", () => {
  it("returns everything past the first page", () => {
    // The bug: a workspace with 2,500 items came back as 1,000 and the chart
    // drew a partial plan that looked complete.
    return fetchAllRows<Row>(fakeTable(2500).page).then((rows) => {
      expect(rows).toHaveLength(2500);
      expect(rows[0].id).toBe(0);
      expect(rows[2499].id).toBe(2499);
    });
  });

  it("makes a single extra request to confirm it reached the end", async () => {
    const table = fakeTable(2500);
    await fetchAllRows<Row>(table.page);
    expect(table.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2500, 3499],
    ]);
  });

  it("advances by rows received, so a server cap below the page size still works", async () => {
    // Asking for 1000 but being handed 500 must not be read as "that was the last page".
    const table = fakeTable(1200, 500);
    const rows = await fetchAllRows<Row>(table.page);
    expect(rows).toHaveLength(1200);
    expect(table.calls[0]).toEqual([0, 999]);
    expect(table.calls[1]).toEqual([500, 1499]);
  });

  it("stops after one request when everything fits", async () => {
    const table = fakeTable(0);
    expect(await fetchAllRows<Row>(table.page)).toEqual([]);
    expect(table.calls).toHaveLength(1);
  });

  it("returns an exact multiple of the page size correctly", async () => {
    expect(await fetchAllRows<Row>(fakeTable(1000).page)).toHaveLength(1000);
  });

  it("honours a custom page size", async () => {
    const table = fakeTable(250);
    await fetchAllRows<Row>(table.page, { pageSize: 100 });
    expect(table.calls).toEqual([
      [0, 99],
      [100, 199],
      [200, 299],
      [250, 349],
    ]);
  });

  it("throws rather than returning a partial result", async () => {
    await expect(
      fetchAllRows<Row>(async () => ({ data: null, error: { message: "boom" } }))
    ).rejects.toEqual({ message: "boom" });
  });

  it("gives up rather than looping forever on a server that never runs out", async () => {
    const endless = async () => ({ data: [{ id: 1 }], error: null });
    const rows = await fetchAllRows<Row>(endless, { maxRows: 10 });
    expect(rows).toHaveLength(10);
  });
});

describe("chunkIds", () => {
  it("splits ids into batches small enough for a query string", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(ids, 50);
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("keeps a list shorter than one chunk in a single batch", () => {
    expect(chunkIds(["a", "b"], 50)).toEqual([["a", "b"]]);
  });
});
