import { describe, it, expect } from "vitest";
import { fingerprint, stableStringify } from "@/lib/agent/requests";
import { htmlToText } from "@/lib/agent/browse";

describe("request fingerprints", () => {
  it("do not depend on key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
  });

  it("treat an approved retry as the same request", () => {
    const first = { name: "Call the plumber", fields: { owner: ["Salma"] }, request_id: "r1" };
    expect(fingerprint("create_task", { ...first, confirm_notify: true })).toBe(fingerprint("create_task", first));
  });

  it("tell a different request apart, even under the same id", () => {
    expect(fingerprint("create_task", { name: "A", request_id: "r1" })).not.toBe(fingerprint("create_task", { name: "B", request_id: "r1" }));
    expect(fingerprint("create_task", { name: "A" })).not.toBe(fingerprint("create_subtask", { name: "A" }));
  });
});

describe("htmlToText", () => {
  it("reads a comment as plain text", () => {
    expect(htmlToText("<p>Plumber booked</p><p>Friday &amp; Saturday</p>")).toBe("Plumber booked\nFriday & Saturday");
  });
});
