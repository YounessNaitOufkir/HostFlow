import { describe, it, expect } from "vitest";
import { parseDeepLink } from "@/lib/deepLink";

const BOARD = "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607";
const ITEM = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe("parseDeepLink", () => {
  it("reads a board and an item out of the query string", () => {
    expect(parseDeepLink(`?board=${BOARD}&item=${ITEM}`)).toEqual({
      boardId: BOARD,
      itemId: ITEM,
    });
  });

  it("accepts a board on its own", () => {
    expect(parseDeepLink(`?board=${BOARD}`)).toEqual({ boardId: BOARD, itemId: null });
  });

  it("ignores a link with no board, since there is nowhere to go", () => {
    expect(parseDeepLink(`?item=${ITEM}`)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
  });

  it("refuses ids that are not uuids", () => {
    // A hand-edited URL, not a link we wrote.
    expect(parseDeepLink("?board=../../etc/passwd")).toBeNull();
    expect(parseDeepLink(`?board=${BOARD}&item=not-a-uuid`)).toEqual({
      boardId: BOARD,
      itemId: null,
    });
  });

  it("survives other query parameters alongside it", () => {
    expect(parseDeepLink(`?utm_source=email&board=${BOARD}&item=${ITEM}`)).toEqual({
      boardId: BOARD,
      itemId: ITEM,
    });
  });
});
