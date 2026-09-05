import { describe, it, expect, beforeAll } from "vitest";

/**
 * The deep-link token binds a Telegram chat to a HostFlow account, so a
 * malformed one has to be rejected rather than crash the webhook that receives
 * it. The secret is read at module load, so it is set before the import.
 */
beforeAll(() => {
  process.env.TELEGRAM_LINK_SECRET = "test-secret-for-token-verification";
});

const load = async () => await import("@/lib/telegram");

describe("deep-link token verification", () => {
  it("accepts a token it generated itself", async () => {
    const { generateDeepLinkToken, verifyDeepLinkToken } = await load();
    const token = generateDeepLinkToken("user-123");
    expect(verifyDeepLinkToken(token)).toBe("user-123");
  });

  it("rejects a token whose signature was altered", async () => {
    const { generateDeepLinkToken, verifyDeepLinkToken } = await load();
    // Format is hf_<userId>_<signature>; the id may itself contain underscores.
    const token = generateDeepLinkToken("user-123");
    const parts = token.split("_");
    const signature = parts[parts.length - 1];
    // Flip one hex digit, keeping the length and the character set valid.
    const tampered = signature[0] === "a" ? "b" + signature.slice(1) : "a" + signature.slice(1);
    expect(verifyDeepLinkToken([...parts.slice(0, -1), tampered].join("_"))).toBeNull();
  });

  it("rejects a 16-character signature that is not hex", async () => {
    // The regression: the guard only compared lengths, so this passed it and
    // then decoded to zero bytes. crypto.timingSafeEqual throws on a length
    // mismatch, turning a malformed token into a 500 instead of a rejection.
    const { verifyDeepLinkToken } = await load();
    expect(() => verifyDeepLinkToken("hf_user-123_zzzzzzzzzzzzzzzz")).not.toThrow();
    expect(verifyDeepLinkToken("hf_user-123_zzzzzzzzzzzzzzzz")).toBeNull();
  });

  it("rejects signatures of the wrong length", async () => {
    const { verifyDeepLinkToken } = await load();
    expect(verifyDeepLinkToken("hf_user-123_abc")).toBeNull();
    expect(verifyDeepLinkToken("hf_user-123_0123456789abcdef00")).toBeNull();
  });

  it("rejects a token with no signature at all", async () => {
    const { verifyDeepLinkToken } = await load();
    expect(verifyDeepLinkToken("hf_user-123")).toBeNull();
    expect(verifyDeepLinkToken("")).toBeNull();
  });
});
