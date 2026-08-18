/**
 * Leaked-password protection using the Have I Been Pwned range API.
 *
 * Supabase ships this natively, but only on the Pro plan. This is the same
 * check, implemented with k-anonymity so it is no less private:
 *
 *   1. Hash the password with SHA-1 locally.
 *   2. Send only the first FIVE hex characters of that hash to HIBP.
 *   3. HIBP returns every known hash suffix sharing that prefix (~500-1000).
 *   4. Compare locally.
 *
 * The password, and the full hash, never leave the browser. SHA-1 is used
 * because that is the corpus HIBP indexes; it is not used to store anything.
 */

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

export interface BreachCheckResult {
  breached: boolean;
  /** How many times the password appears in known breaches. */
  count: number;
}

async function sha1Hex(input: string): Promise<string | null> {
  // Web Crypto is unavailable on insecure origins and in some older browsers
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Parses a HIBP range response body. Each line is `SUFFIX:COUNT`.
 * Exported for testing; you normally want checkPasswordBreached.
 */
export function findSuffixCount(body: string, suffix: string): number {
  for (const line of body.split("\n")) {
    const [candidate, count] = line.trim().split(":");
    if (candidate && candidate.toUpperCase() === suffix) {
      const parsed = parseInt(count ?? "0", 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
  }
  return 0;
}

/**
 * Returns whether the password appears in a known breach corpus.
 *
 * Returns `null` when the check could not be performed — HIBP unreachable,
 * offline, no Web Crypto. Callers must treat `null` as "unknown" and allow the
 * password through: a third-party outage must never block someone from signing
 * up or recovering their account.
 */
export async function checkPasswordBreached(
  password: string,
  signal?: AbortSignal
): Promise<BreachCheckResult | null> {
  if (!password) return null;

  try {
    const hash = await sha1Hex(password);
    if (!hash) return null;

    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      // Ask HIBP to pad the response with fake entries so its size leaks nothing
      headers: { "Add-Padding": "true" },
      signal,
    });
    if (!response.ok) return null;

    const count = findSuffixCount(await response.text(), suffix);
    return { breached: count > 0, count };
  } catch {
    // Network failure, abort, or CSP block — treat as "unknown", never as "safe or unsafe"
    return null;
  }
}

/** Minimum length we enforce client-side, independent of the breach check. */
export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordProblem {
  message: string;
  /** True when the user cannot proceed. */
  blocking: boolean;
}

/**
 * Full validation for a new password: length first (cheap, local), then the
 * breach check. Returns null when the password is acceptable.
 */
export async function validateNewPassword(
  password: string,
  signal?: AbortSignal
): Promise<PasswordProblem | null> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      blocking: true,
    };
  }

  const breach = await checkPasswordBreached(password, signal);
  if (breach?.breached) {
    return {
      message:
        `This password has appeared in ${breach.count.toLocaleString()} known data ` +
        `breaches and is unsafe to use. Please choose a different one.`,
      blocking: true,
    };
  }

  return null;
}
