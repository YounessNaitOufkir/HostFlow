/**
 * Where to send someone after they sign in, from a `?next=` value.
 *
 * Only a path on this site is accepted. "//evil.com", "/\evil.com" and
 * "https://evil.com" all leave the site in a browser, which would turn the
 * login page into an open redirect - so anything that is not a plain
 * "/something" falls back to the home page.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
