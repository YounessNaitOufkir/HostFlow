import { describe, it, expect } from "vitest";
import { evaluateFormula } from "@/lib/formulaEngine";
import type { Item, Column } from "@/types";

const columns = [
  { id: "a", title: "A", type: "numbers" },
  { id: "b", title: "B", type: "numbers" },
  { id: "name", title: "Name", type: "text" },
] as unknown as Column[];

function ctx(values: Record<string, unknown> = {}) {
  return {
    item: {
      id: "i1",
      board_id: "b1",
      group_id: "g1",
      name: "Task",
      position: 0,
      column_values: values,
    } as unknown as Item,
    columns,
  };
}

/** Shorthand: evaluate against an item whose columns hold `values`. */
const ev = (expr: string, values: Record<string, unknown> = {}) =>
  evaluateFormula(expr, ctx(values));

describe("arithmetic", () => {
  it("adds, subtracts, multiplies and divides", () => {
    expect(ev("1 + 2")).toBe(3);
    expect(ev("5 - 2")).toBe(3);
    expect(ev("3 * 4")).toBe(12);
    expect(ev("10 / 4")).toBe(2.5);
  });

  it("gives multiplication precedence over addition", () => {
    expect(ev("2 + 3 * 4")).toBe(14);
    expect(ev("3 * 4 + 2")).toBe(14);
    expect(ev("(2 + 3) * 4")).toBe(20);
  });

  it("returns null rather than Infinity when dividing by zero", () => {
    expect(ev("1 / 0")).toBe(null);
  });

  it("reads column references", () => {
    expect(ev("{a} + {b}", { a: 4, b: 6 })).toBe(10);
    expect(ev("{a} * 2", { a: 7 })).toBe(14);
  });

  it("concatenates when either side of + is a string", () => {
    expect(ev('"a" + "b"')).toBe("ab");
  });
});

describe("comparison precedence", () => {
  // The regression: the grammar ran expression -> term -> comparison -> unary,
  // which made comparison bind TIGHTER than * and +. "2 * 3 = 6" parsed as
  // "2 * (3 = 6)" and quietly returned 0 instead of true, so any formula that
  // compared an arithmetic result was wrong with no error.
  it("compares the result of a multiplication, not one operand", () => {
    expect(ev("2 * 3 = 6")).toBe(true);
    expect(ev("2 * 3 = 7")).toBe(false);
  });

  it("compares the result of an addition, not one operand", () => {
    expect(ev("1 + 2 = 3")).toBe(true);
    expect(ev("{a} + {b} = 10", { a: 4, b: 6 })).toBe(true);
    expect(ev("{a} + {b} = 11", { a: 4, b: 6 })).toBe(false);
  });

  it("compares arithmetic on both sides", () => {
    expect(ev("2 + 2 = 1 + 3")).toBe(true);
    expect(ev("2 * 5 > 3 + 4")).toBe(true);
    expect(ev("2 * 5 < 3 + 4")).toBe(false);
  });

  it("still supports every comparison operator", () => {
    expect(ev("1 = 1")).toBe(true);
    expect(ev("1 != 2")).toBe(true);
    expect(ev("1 < 2")).toBe(true);
    expect(ev("2 > 1")).toBe(true);
    expect(ev("2 <= 2")).toBe(true);
    expect(ev("2 >= 3")).toBe(false);
  });

  it("compares a column against an arithmetic result", () => {
    expect(ev("{a} = {b} * 2", { a: 10, b: 5 })).toBe(true);
    expect(ev("{a} = {b} * 2", { a: 10, b: 4 })).toBe(false);
  });

  it("compares strings by value", () => {
    expect(ev('{name} = "Task A"', { name: "Task A" })).toBe(true);
    expect(ev('{name} = "Other"', { name: "Task A" })).toBe(false);
  });
});

describe("comparison inside other constructs", () => {
  it("works as an IF condition over an arithmetic expression", () => {
    expect(ev('IF({a} + {b} = 10, "yes", "no")', { a: 4, b: 6 })).toBe("yes");
    expect(ev('IF({a} + {b} = 10, "yes", "no")', { a: 4, b: 5 })).toBe("no");
    expect(ev('IF({a} * 2 > 10, "big", "small")', { a: 6 })).toBe("big");
  });

  it("works inside parentheses", () => {
    expect(ev('IF((1 + 1 = 2), "yes", "no")')).toBe("yes");
  });
});

describe("functions", () => {
  it("evaluates the arithmetic ones", () => {
    expect(ev("SUM(1, 2, 3)")).toBe(6);
    expect(ev("AVG(2, 4)")).toBe(3);
    expect(ev("MIN(3, 1, 2)")).toBe(1);
    expect(ev("MAX(3, 1, 2)")).toBe(3);
    expect(ev("ABS(0 - 5)")).toBe(5);
    expect(ev("ROUND(2.567, 1)")).toBe(2.6);
  });

  it("evaluates the string ones", () => {
    expect(ev('CONCAT("a", "b")')).toBe("ab");
    expect(ev('LEN("abcd")')).toBe(4);
    expect(ev('UPPER("ab")')).toBe("AB");
    expect(ev('LOWER("AB")')).toBe("ab");
  });

  it("accepts arithmetic as an argument", () => {
    expect(ev("SUM(1 + 1, 2 * 2)")).toBe(6);
  });
});

describe("failure handling", () => {
  it("returns null for an empty expression", () => {
    expect(ev("")).toBe(null);
    expect(ev("   ")).toBe(null);
  });

  it("reports a parse failure rather than throwing", () => {
    const result = ev("1 +");
    expect(typeof result).toBe("string");
    expect(String(result)).toContain("#ERR");
  });

  it("reports trailing input rather than silently ignoring it", () => {
    expect(String(ev("1 2"))).toContain("#ERR");
  });
});
