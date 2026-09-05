import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  findSuffixCount,
  checkPasswordBreached,
  validateNewPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordSecurity";

// SHA-1("password123") = CBFDAC6008F9CAB4083784CBD1874F76618D2A97
const PWD = "password123";
const PREFIX = "CBFDA";
const SUFFIX = "C6008F9CAB4083784CBD1874F76618D2A97";

describe("findSuffixCount", () => {
  it("finds a matching suffix and returns its count", () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:1\n${SUFFIX}:2402\nAAAA:3`;
    expect(findSuffixCount(body, SUFFIX)).toBe(2402);
  });

  it("returns 0 when the suffix is absent", () => {
    expect(findSuffixCount("0018A45C4D1DEF81644B54AB7F969B88D65:1", SUFFIX)).toBe(0);
  });

  it("tolerates CRLF line endings and lowercase suffixes", () => {
    const body = `X:1\r\n${SUFFIX.toLowerCase()}:99\r\n`;
    expect(findSuffixCount(body, SUFFIX)).toBe(99);
  });

  it("returns 0 rather than NaN for a malformed count", () => {
    expect(findSuffixCount(`${SUFFIX}:notanumber`, SUFFIX)).toBe(0);
  });
});

describe("checkPasswordBreached", () => {
  const realFetch = global.fetch;

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("only ever sends the first five hash characters", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${SUFFIX}:2402`,
    });
    global.fetch = spy as unknown as typeof fetch;

    await checkPasswordBreached(PWD);

    const url = String(spy.mock.calls[0][0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    // The password and the full hash must never appear in the request
    expect(url).not.toContain(PWD);
    expect(url).not.toContain(SUFFIX);
  });

  it("reports a breached password with its count", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${SUFFIX}:2402`,
    }) as unknown as typeof fetch;

    expect(await checkPasswordBreached(PWD)).toEqual({ breached: true, count: 2402 });
  });

  it("reports a clean password", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1",
    }) as unknown as typeof fetch;

    expect(await checkPasswordBreached(PWD)).toEqual({ breached: false, count: 0 });
  });

  it("returns null when HIBP is unreachable, so signup is never blocked", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(await checkPasswordBreached(PWD)).toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "" }) as unknown as typeof fetch;
    expect(await checkPasswordBreached(PWD)).toBeNull();
  });
});

describe("validateNewPassword", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("rejects a short password before making any network call", async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;

    const problem = await validateNewPassword("short");

    expect(problem?.blocking).toBe(true);
    expect(problem?.message).toContain(String(MIN_PASSWORD_LENGTH));
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a long but breached password", async () => {
    // Derive the real suffix for this password so the mock genuinely matches,
    // rather than asserting something that would pass either way.
    const candidate = "correct-horse-battery-staple";
    const hash = createHash("sha1").update(candidate).digest("hex").toUpperCase();
    const suffix = hash.slice(5);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:157`,
    }) as unknown as typeof fetch;

    const problem = await validateNewPassword(candidate);

    expect(problem).not.toBeNull();
    expect(problem!.blocking).toBe(true);
    expect(problem!.message).toContain("157");
  });

  it("accepts a long, unbreached password", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1",
    }) as unknown as typeof fetch;

    expect(await validateNewPassword("a-perfectly-fine-passphrase")).toBeNull();
  });

  it("accepts the password when the breach service is down", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    expect(await validateNewPassword("a-perfectly-fine-passphrase")).toBeNull();
  });
});
