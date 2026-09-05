import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  digestsMatch,
} from "@/lib/apiKeys";

describe("API keys", () => {
  it("issues distinct, prefixed, high-entropy keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("hf_")).toBe(true);
    // 32 random bytes in base64url is 43 characters.
    expect(a.length).toBeGreaterThanOrEqual(3 + 43);
  });

  it("stores a digest, never the key", () => {
    const key = generateApiKey();
    const digest = hashApiKey(key);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(key);
    expect(hashApiKey(key)).toBe(digest); // stable, so lookup is one indexed query
    expect(hashApiKey(generateApiKey())).not.toBe(digest);
  });

  it("rejects tokens that are not shaped like ours before any lookup", () => {
    expect(looksLikeApiKey(generateApiKey())).toBe(true);
    expect(looksLikeApiKey("hf_short")).toBe(false);
    expect(looksLikeApiKey("nothf_" + "x".repeat(40))).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
    expect(looksLikeApiKey(12345)).toBe(false);
  });

  it("compares digests without throwing on a mismatched length", () => {
    // The three legacy rows hold 21-character values, not digests. A raw
    // timingSafeEqual would throw RangeError on those instead of refusing.
    const digest = hashApiKey(generateApiKey());
    expect(digestsMatch(digest, digest)).toBe(true);
    expect(() => digestsMatch("dGhpcyBpcyAyMWNoYXJz", digest)).not.toThrow();
    expect(digestsMatch("dGhpcyBpcyAyMWNoYXJz", digest)).toBe(false);
    expect(digestsMatch("", digest)).toBe(false);
  });

  it("hashes exactly the way scripts/issue-api-key.mjs does", () => {
    // The script cannot import this module, so it repeats the algorithm. If the
    // two ever diverge, every issued key stops authenticating - silently, and
    // only for whoever already holds one.
    const key = generateApiKey();
    const asTheScriptDoes = createHash("sha256").update(key, "utf8").digest("hex");
    expect(hashApiKey(key)).toBe(asTheScriptDoes);
  });

  it("a legacy 21-character value can never authenticate", () => {
    const legacy = randomBytes(15).toString("base64").slice(0, 21);
    expect(digestsMatch(legacy, hashApiKey(legacy))).toBe(false);
  });
});
