/**
 * Whether a document's host is on the public internet.
 *
 * main.http.ts refuses literal IP addresses and local names by their spelling.
 * That leaves a public NAME that resolves to a local address
 * (`127.0.0.1.nip.io`, or an attacker's own DNS): this module asks a public
 * resolver what the name points to and refuses it when any answer is private.
 *
 * What it does not close: the check and the connection are two lookups, so a
 * DNS server that answers this resolver with a public address and the fetch
 * with a private one still gets through (DNS rebinding). Only a check at
 * connect time closes that, and a Val has no hook there; Val Town's egress is
 * the boundary for that case.
 */

/** IPv4 text as a 32-bit number, or null when it is not a dotted quad. */
function v4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some((n) => n > 255) ? null : ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

/** True when `n` (an IPv4 address) is inside `base/bits`. */
const inBlock = (n: number, base: string, bits: number) => (n >>> (32 - bits)) === (v4(base)! >>> (32 - bits));

// Loopback, private, link-local (cloud metadata lives at 169.254.169.254), carrier NAT, benchmarking, multicast, reserved.
const V4_PRIVATE: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
];

/** IPv6 text as eight 16-bit groups, or null. Accepts `::` and a dotted IPv4 tail. */
function v6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4(tail[2]);
    if (n == null) return null;
    s = `${tail[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (t: string) => (t === "" ? [] : t.split(":"));
  const head = groups(halves[0]), rest = halves.length === 2 ? groups(halves[1]) : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + rest.length > 7) return null;
  const all = [...head, ...Array(8 - head.length - rest.length).fill("0"), ...rest];
  if (all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** True for an address that is not a public unicast one. Text that is not an address counts as private. */
export function privateIp(ip: string): boolean {
  const n = v4(ip);
  if (n != null) return V4_PRIVATE.some(([base, bits]) => inBlock(n, base, bits));
  const g = v6(ip);
  if (!g) return true;
  const embedded = () => privateIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(); // 64:ff9b::/96 (NAT64)
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48, NAT64 for local use
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 and the old IPv4-compatible ::a.b.c.d
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return true; // ::ffff:0:a.b.c.d (translated)
  if (g[0] === 0x2002) return privateIp(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4 carries an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00; // unique local, link-local, multicast
}

/** Every address a name has. */
export type Lookup = (host: string) => Promise<string[]>;

/** A and AAAA records from a public resolver's JSON API over HTTPS (a Val cannot open a DNS socket). */
const doh = (api: string): Lookup => async (host) => {
  const ask = async (type: "A" | "AAAA") => {
    const res = await fetch(`${api}?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`resolver answered ${res.status}`);
    const want = type === "A" ? 1 : 28;
    const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
    return (body.Answer ?? []).filter((a) => a.type === want).map((a) => a.data);
  };
  return (await Promise.all([ask("A"), ask("AAAA")])).flat();
};
/** Cloudflare's resolver, and Google's when Cloudflare's cannot be reached. */
export const dohLookup: Lookup = (host) => doh("https://cloudflare-dns.com/dns-query")(host).catch(() => doh("https://dns.google/resolve")(host));

const FRESH_MS = 60 * 1000;
const SEEN = new Map<string, { ok: boolean; at: number }>();

/**
 * False when `host` has an address that is not public. An answer is kept for
 * one minute per isolate, so a page and its images cost one lookup. When no
 * resolver can be reached the name is REFUSED: allowing it would quietly turn
 * the check off, and two independent resolvers being down together is rare.
 * Nothing is kept in that case, so the next request asks again.
 */
export async function resolvesPublic(host: string, lookup: Lookup = dohLookup, seen = SEEN): Promise<boolean> {
  const hit = seen.get(host);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.ok;
  let ips: string[];
  try {
    ips = await lookup(host);
  } catch {
    return false;
  }
  const ok = !ips.some(privateIp);
  seen.set(host, { ok, at: Date.now() });
  return ok;
}
