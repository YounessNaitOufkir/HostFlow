import { describe, it, expect } from "vitest";
import { googleEventIdFor } from "@/lib/google-calendar";

/**
 * The derived id is what makes calendar sync idempotent: two runs racing each
 * other compute the same value, so Google's uniqueness rule decides the winner
 * instead of both inserting. That only holds if the id is one Google accepts.
 */
describe("googleEventIdFor", () => {
  const uuid = "3bb6574d-c6b3-4528-a491-848d6c83391b";

  it("is stable for the same task", () => {
    expect(googleEventIdFor(uuid)).toBe(googleEventIdFor(uuid));
  });

  it("differs between tasks", () => {
    expect(googleEventIdFor(uuid)).not.toBe(
      googleEventIdFor("b826e359-9fbc-4835-aed0-678f6aac95df")
    );
  });

  it("uses only characters Google allows in an event id", () => {
    // base32hex: 0-9 and a-v. A stray 'w'-'z' or a dash is rejected outright,
    // and the insert would fail for every task rather than racing.
    expect(googleEventIdFor(uuid)).toMatch(/^[0-9a-v]+$/);
  });

  it("respects the length Google requires", () => {
    const id = googleEventIdFor(uuid);
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(1024);
  });

  it("normalises case, so an upper-case id maps to the same event", () => {
    expect(googleEventIdFor(uuid.toUpperCase())).toBe(googleEventIdFor(uuid));
  });
});
