import { assertEquals } from "jsr:@std/assert@1";
import { fetchFailure, MAX_SEEN, privateIp, publicUrl, resolvesPublic } from "./net.ts";

Deno.test("addresses that are not on the public internet", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "ff02::1", "not an address"]) {
    assertEquals(privateIp(ip), true, ip);
  }
});

Deno.test("public addresses pass", () => {
  for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "100.63.0.1", "192.169.0.1", "18.155.68.44", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8"]) {
    assertEquals(privateIp(ip), false, ip);
  }
});

/** A resolver that answers from a table, counting how often it is asked. */
const table = (answers: Record<string, string[] | Error>) => {
  const asked: string[] = [];
  const lookup = (host: string) => {
    asked.push(host);
    const a = answers[host];
    return a instanceof Error ? Promise.reject(a) : Promise.resolve(a ?? []);
  };
  return { asked, lookup };
};

Deno.test("a public name that resolves to a local address is refused (127.0.0.1.nip.io)", async () => {
  const { lookup } = table({ "127.0.0.1.nip.io": ["127.0.0.1"], "mixed.example": ["1.1.1.1", "10.0.0.5"], "ok.example": ["1.1.1.1", "2606:4700:4700::1111"] });
  assertEquals(await resolvesPublic("127.0.0.1.nip.io", lookup, new Map()), false);
  assertEquals(await resolvesPublic("mixed.example", lookup, new Map()), false); // any private answer refuses
  assertEquals(await resolvesPublic("ok.example", lookup, new Map()), true);
});

Deno.test("a name is looked up once while its answer is fresh; when no resolver answers, the name is refused and asked again", async () => {
  const cache = new Map();
  const { asked, lookup } = table({ "ok.example": ["1.1.1.1"], "down.example": new Error("resolver down") });
  assertEquals(await resolvesPublic("ok.example", lookup, cache), true);
  assertEquals(await resolvesPublic("ok.example", lookup, cache), true);
  assertEquals(asked, ["ok.example"]);
  assertEquals(await resolvesPublic("down.example", lookup, cache), false); // could not be checked: refused, and not remembered
  assertEquals(await resolvesPublic("down.example", lookup, cache), false);
  assertEquals(asked.filter((h) => h === "down.example").length, 2);
  assertEquals(await resolvesPublic("nothing.example", lookup, cache), false); // no public address: the host's own resolver may still know the name
});

Deno.test("an answer that is no longer fresh is asked for again", async () => {
  const cache = new Map([["flip.example", { ok: true, at: Date.now() - 61_000 }]]);
  const { lookup } = table({ "flip.example": ["127.0.0.1"] });
  assertEquals(await resolvesPublic("flip.example", lookup, cache), false);
});

Deno.test("old and special IPv6 forms that carry or stand for a local address", () => {
  for (const ip of ["::127.0.0.1", "::ffff:0:127.0.0.1", "64:ff9b:1::127.0.0.1", "2002:7f00:1::", "2002:a00:1::1", "2001:db8::1", "192.0.2.1", "198.51.100.7", "203.0.113.9"]) {
    assertEquals(privateIp(ip), true, ip);
  }
  assertEquals(privateIp("2002:808:808::1"), false); // 6to4 of 8.8.8.8
});

Deno.test("the edges of each range: the first and last address inside, and the nearest outside", () => {
  for (const ip of ["172.16.0.0", "172.31.255.255", "100.64.0.0", "100.127.255.255", "198.18.0.0", "198.19.255.255", "169.254.0.0", "169.254.255.255",
    "fe80::", "febf:ffff::1", "fc00::", "fdff:ffff::1", "ff00::",
    // Outside 2000::/3 nothing is a global address: deprecated site-local, and space never allocated.
    "fec0::1", "fbff:ffff::1", "fe00::1", "1fff::1", "4000::1", "100::1"]) {
    assertEquals(privateIp(ip), true, ip);
  }
  for (const ip of ["172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0", "198.17.255.255", "198.20.0.0", "169.253.255.255", "169.255.0.0",
    "2000::1", "3fff:ffff::1"]) {
    assertEquals(privateIp(ip), false, ip);
  }
});

Deno.test("a name the public resolver has no address for is refused: it may still resolve inside the host's network", async () => {
  const { lookup, asked } = table({ "internal.example": [] });
  const seen = new Map();
  assertEquals(await resolvesPublic("internal.example", lookup, seen), false);
  assertEquals(await resolvesPublic("internal.example", lookup, seen), false);
  assertEquals(asked.length, 1); // the refusal is kept for the minute too
});

Deno.test("the answers kept are bounded: the oldest goes first", async () => {
  const { lookup } = table({});
  const seen = new Map();
  const ok = (host: string) => resolvesPublic(host, () => Promise.resolve(["1.1.1.1"]), seen);
  for (let i = 0; i < MAX_SEEN + 5; i++) await ok(`h${i}.example`);
  assertEquals(seen.size, MAX_SEEN);
  assertEquals(seen.has("h0.example"), false);
  assertEquals(seen.has(`h${MAX_SEEN + 4}.example`), true);
  void lookup;
});

Deno.test("a document address: https, by name, and not a local name however it is spelled", () => {
  for (const bad of ["http://example.com/a.docx", "https://localhost/a.docx", "https://localhost./a.docx", "https://LOCALHOST../a.docx", "https://x.internal./a.docx",
    "https://printer.local./a.docx", "https://127.0.0.1/a.docx", "https://127.0.0.1./a.docx", "https://[::1]/a.docx", "not a url", undefined]) {
    assertEquals(publicUrl(bad), null, String(bad));
  }
  assertEquals(publicUrl("https://example.com./a.docx")?.hostname, "example.com.");
  assertEquals(publicUrl("https://huggingface.co/x.docx")?.href, "https://huggingface.co/x.docx");
});

Deno.test("why a fetch failed is said in our words, never the runtime's (which names the stage and the address)", () => {
  assertEquals(fetchFailure(new TypeError("error sending request for url (https://10.0.0.5:8443/): client error (Connect): dns error: failed to lookup address information")), "its host name could not be found");
  assertEquals(fetchFailure(new TypeError("client error (Connect): invalid peer certificate: UnknownIssuer")), "its TLS certificate or handshake was not accepted");
  assertEquals(fetchFailure(new TypeError("client error (Connect): tcp connect error: Connection refused (os error 111)")), "the connection was refused");
  assertEquals(fetchFailure(new Error("something else about 10.0.0.5:8443")), "the connection failed");
  assertEquals(fetchFailure("a string"), "the connection failed");
  // Deno says "fetch failed" and keeps the reason in the cause: that is where it is read from.
  assertEquals(fetchFailure(new TypeError("fetch failed", { cause: new Error("client error (Connect): invalid peer certificate: certificate expired") })), "its TLS certificate or handshake was not accepted");
  assertEquals(fetchFailure(new TypeError("fetch failed", { cause: new Error("dns error: failed to lookup address information") })), "its host name could not be found");
});
