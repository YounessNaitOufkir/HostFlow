import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The webhook dispatcher fetches a URL a user typed into a form. Everything here
 * is about the addresses that must never be reachable that way - the cloud
 * metadata service above all, which answers on a link-local address and hands
 * out credentials to anything that asks.
 */
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  // node:dns/promises carries a default export as well as the named one.
  return { lookup, default: { lookup } };
});

import { lookup } from "node:dns/promises";
import { addressIsPrivate, checkOutboundUrl } from "@/lib/ssrf";

const resolvesTo = (...addresses: string[]) =>
  vi.mocked(lookup).mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as never
  );

describe("addressIsPrivate", () => {
  it("rejects the cloud metadata address", () => {
    // The one that matters most: it serves instance credentials over plain HTTP.
    expect(addressIsPrivate("169.254.169.254")).toBe(true);
  });

  it("rejects loopback, the private ranges and the odd corners", () => {
    for (const ip of [
      "127.0.0.1", "127.1.2.3",
      "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "0.0.0.0", "192.0.0.1", "100.64.0.1", "198.18.0.1",
      "224.0.0.1", "255.255.255.255",
    ]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });

  it("accepts ordinary public addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "192.167.1.1", "100.63.255.255"]) {
      expect(addressIsPrivate(ip), ip).toBe(false);
    }
  });

  it("sees through an IPv4-mapped IPv6 address", () => {
    // ::ffff:127.0.0.1 is loopback wearing a hat.
    expect(addressIsPrivate("::ffff:127.0.0.1")).toBe(true);
    expect(addressIsPrivate("::ffff:169.254.169.254")).toBe(true);
    expect(addressIsPrivate("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects IPv6 loopback, unique-local and link-local", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0"]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
    expect(addressIsPrivate("2606:4700:4700::1111")).toBe(false);
  });

  it("treats anything that is not an address as unsafe", () => {
    expect(addressIsPrivate("not-an-ip")).toBe(true);
    expect(addressIsPrivate("")).toBe(true);
  });
});

describe("checkOutboundUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvesTo("93.184.216.34");
  });

  it("allows an ordinary https endpoint", async () => {
    expect((await checkOutboundUrl("https://hooks.example.com/abc")).ok).toBe(true);
  });

  it("refuses a private address written straight into the URL", async () => {
    expect((await checkOutboundUrl("http://169.254.169.254/latest/meta-data/")).ok).toBe(false);
    expect((await checkOutboundUrl("http://127.0.0.1:8080/")).ok).toBe(false);
    expect((await checkOutboundUrl("http://[::1]/")).ok).toBe(false);
    // A literal address is never looked up.
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a public NAME that resolves somewhere private", async () => {
    // The case a string check on the URL can never catch.
    resolvesTo("127.0.0.1");
    const verdict = await checkOutboundUrl("https://totally-fine.example.com/hook");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("127.0.0.1");
  });

  it("refuses when only ONE of several answers is private", async () => {
    // The resolver is free to hand back the private one at connection time.
    resolvesTo("93.184.216.34", "10.0.0.5");
    expect((await checkOutboundUrl("https://split.example.com/hook")).ok).toBe(false);
  });

  it("refuses protocols that are not http or https", async () => {
    for (const url of ["file:///etc/passwd", "gopher://x/", "ftp://x/"]) {
      expect((await checkOutboundUrl(url)).ok, url).toBe(false);
    }
  });

  it("refuses ports a webhook receiver would not listen on", async () => {
    // Otherwise the response time of http://host:22/ is a port scan.
    expect((await checkOutboundUrl("http://example.com:22/")).ok).toBe(false);
    expect((await checkOutboundUrl("http://example.com:6379/")).ok).toBe(false);
    expect((await checkOutboundUrl("https://example.com:443/")).ok).toBe(true);
    expect((await checkOutboundUrl("https://example.com:8443/")).ok).toBe(true);
  });

  it("refuses a name that does not resolve, and junk", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    expect((await checkOutboundUrl("https://nope.example/")).ok).toBe(false);
    expect((await checkOutboundUrl("not a url")).ok).toBe(false);
  });
});
