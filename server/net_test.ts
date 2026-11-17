import { assertEquals } from "jsr:@std/assert@1";
import { privateIp, resolvesPublic } from "./net.ts";

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
  assertEquals(await resolvesPublic("nothing.example", lookup, cache), true); // no address at all: the fetch itself will fail
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
