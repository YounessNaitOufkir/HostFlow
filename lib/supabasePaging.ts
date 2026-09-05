/**
 * Read every row of a query, not just the first page.
 *
 * PostgREST caps a response at `db.max_rows` (1000 by default) and says nothing
 * about it — no error, no flag, just a short array. A view that fetches a whole
 * workspace and renders what it gets will quietly draw a partial plan, which is
 * worse than failing: the chart looks complete.
 *
 * The loop advances by however many rows actually came back rather than by the
 * page size it asked for, so it stays correct even when the server's cap is
 * smaller than the page requested.
 */

export interface FetchAllOptions {
  pageSize?: number;
  /** Stop rather than loop forever if a server keeps returning rows. */
  maxRows?: number;
}

export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { pageSize = 1000, maxRows = 100_000 }: FetchAllOptions = {}
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (from < maxRows) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    from += data.length;
  }

  return rows;
}

/**
 * Split ids into chunks small enough to survive a URL.
 *
 * PostgREST takes `in.(...)` filters in the query string, so a few thousand
 * UUIDs is a 414 rather than a result set.
 */
export function chunkIds(ids: string[], size = 50): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
