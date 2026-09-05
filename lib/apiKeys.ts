/**
 * Issuing and checking the keys for the public API.
 *
 * The column has always been called `key_hash`, but nothing ever hashed
 * anything: the three rows in it hold 21-character values, which is the length
 * of a token, not of a digest. The route then compared the bearer token against
 * a column named `key`, which does not exist - so every request errored and
 * answered 401. The endpoint has never worked, and the credentials behind it
 * were sitting in the database in a form that could be used directly.
 *
 * A key is shown once, at issue, and only its digest is stored. SHA-256 with no
 * salt is deliberate and correct here, unlike for a password: the token is 256
 * bits of randomness, so there is no dictionary to attack and a per-row salt
 * would only prevent the lookup this needs to do in one indexed query.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Marks a token as ours in logs and paste buffers, and gives it a shape to validate. */
const PREFIX = "hf_";

/** 32 bytes, base64url: no padding, safe in a header and in a URL. */
export function generateApiKey(): string {
  return `${PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** The digest stored for a key. Never reversible, and never logged. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Whether a presented token even looks like one of ours, before any database work. */
export function looksLikeApiKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(PREFIX) && key.length >= PREFIX.length + 32;
}

/**
 * Compare two digests without leaking, through timing, how much of one matched.
 *
 * Both are hex of the same length, so a length mismatch means the stored value
 * is not a digest at all - which is exactly what the three legacy rows are.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
