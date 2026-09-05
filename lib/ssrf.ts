/**
 * Guarding outbound requests to addresses a user chose.
 *
 * A webhook endpoint is a URL somebody typed into a form, and the server then
 * fetches it. That is server-side request forgery by construction: the same
 * field that reaches Slack also reaches `http://169.254.169.254/`, the cloud
 * metadata service, or anything else on the private network the app happens to
 * sit inside. The response body is not returned to the writer here, but the
 * status and the timing are, and a blind request is enough to reach an internal
 * endpoint that acts on a POST.
 *
 * So the host is resolved before the request is made and every address it
 * answers with has to be public. Resolving first also means a name that points
 * at 127.0.0.1 is refused, which a string check on the URL would never catch.
 *
 * This does not close DNS rebinding - a name whose answer changes between this
 * lookup and the connection. Closing that needs the connection pinned to the
 * address that was checked, which Node's fetch does not expose. It is a much
 * narrower hole than the one this closes, and it is recorded here rather than
 * left for somebody to assume was handled.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Only these ever leave the server. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Ports a webhook receiver plausibly listens on.
 *
 * Without this, a URL is a port scanner: the response time of
 * `http://10.0.0.5:22/` says whether something is listening.
 */
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable is not provably public
  }
  const [a, b] = parts;

  if (a === 0) return true;                          // 0.0.0.0/8, "this network"
  if (a === 10) return true;                         // private
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;  // private
  if (a === 192 && b === 168) return true;           // private
  if (a === 192 && b === 0) return true;             // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                         // multicast and reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0]; // drop any zone index

  if (address === "::" || address === "::1") return true;

  // An IPv4-mapped address is an IPv4 address wearing a hat.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);

  const head = address.split(":")[0];
  if (/^f[cd]/.test(head)) return true;              // fc00::/7 unique local
  if (/^fe[89ab]/.test(head)) return true;           // fe80::/10 link-local
  return false;
}

export function addressIsPrivate(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version === 6) return ipv6IsPrivate(ip);
  return true; // not an address at all
}

export interface UrlVerdict {
  ok: boolean;
  /** Why it was refused, safe to log. Never shown to the person who typed it. */
  reason?: string;
}

/**
 * Whether this URL may be fetched from the server.
 *
 * Shape is checked without touching the network; the DNS lookup only happens
 * once the URL is otherwise acceptable.
 */
export async function checkOutboundUrl(raw: string): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `protocol ${url.protocol} is not allowed` };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: `port ${url.port} is not allowed` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // an IPv6 literal arrives bracketed

  // A literal address needs no lookup, and must not get one: resolving it would
  // only give the same answer.
  if (isIP(host)) {
    return addressIsPrivate(host)
      ? { ok: false, reason: `${host} is not a public address` }
      : { ok: true };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: `${host} does not resolve` };
  }

  if (resolved.length === 0) {
    return { ok: false, reason: `${host} does not resolve` };
  }
  // EVERY answer must be public. One private address among them is enough for a
  // resolver to hand back the private one at connection time.
  for (const { address } of resolved) {
    if (addressIsPrivate(address)) {
      return { ok: false, reason: `${host} resolves to ${address}, which is not public` };
    }
  }

  return { ok: true };
}
