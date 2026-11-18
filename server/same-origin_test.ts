import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { ENGINES } from "./engines.ts";
import { viewPage } from "./render.ts";
import { passedThrough, passThroughHeaders, passThroughPath, VENDOR_ROOT } from "./pass-through.ts";

const src = new URL("https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx");
const map = (html: string) => JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)![1]).imports;
const e = ENGINES[0]!;
const base = { body: "<div></div>", entry: "/editors/x/main.ts", importMap: { "pkg": "/vendor/npm/pkg@1/index.js", "react": "https://esm.sh/react@18.2.0" } };

Deno.test("view page: an engine's files are linked from the editors site by default", () => {
  assertEquals(map(viewPage(e, base, src, (h) => h)).pkg, "https://editors.benchmarks.law/vendor/npm/pkg@1/index.js");
});

Deno.test("view page: an engine that needs same-origin files gets them from this origin", () => {
  const html = viewPage(e, { ...base, sameOrigin: true }, src, (h) => h);
  assertEquals(map(html), { "pkg": "/eo1/vendor/npm/pkg@1/index.js", "react": "https://esm.sh/react@18.2.0" });
  assertStringIncludes(html, "https://editors.benchmarks.law/lib/boot.ts"); // the site's own modules still load directly
});

Deno.test("pass-through: the editors site is asked for gzip only, and sent nothing of the visitor's", () => {
  assertEquals(Object.fromEntries(passThroughHeaders().entries()), { "accept-encoding": "gzip" });
});

Deno.test("pass-through: the answer keeps what describes the bytes and drops the encoding this runtime already undid, cookies and hop headers", async () => {
  const upstream = new Response("abc", {
    status: 200,
    headers: {
      "content-type": "text/javascript",
      "content-encoding": "gzip",
      "cache-control": "public, max-age=1",
      "set-cookie": "a=b",
      "content-length": "999",
      "via": "x",
    },
  });
  const res = await passedThrough(upstream);
  assertEquals(Object.fromEntries(res.headers.entries()), {
    "content-type": "text/javascript",
    "cache-control": "public, max-age=1",
    "x-proxied-from": "open-docs",
  });
  assertEquals(await res.text(), "abc");
});

Deno.test("pass-through: only engine files under the prefix are passed, and the prefix is taken off", () => {
  assertEquals(VENDOR_ROOT, "/eo1");
  assertEquals(passThroughPath("/eo1/vendor/npm/pkg@1/index.js"), "/vendor/npm/pkg@1/index.js");
  assertEquals(passThroughPath("/eo1/api/keys"), undefined);
  assertEquals(passThroughPath("/eo1/vendor/../api/keys"), undefined);
  assertEquals(passThroughPath("/vendor/npm/pkg@1/index.js"), undefined);
});

Deno.test("pass-through: a failed answer is never cacheable", async () => {
  const res = await passedThrough(new Response("slow down", { status: 429, headers: { "cache-control": "public, max-age=31536000, immutable" } }));
  assertEquals([res.status, res.headers.get("cache-control")], [429, "no-store"]);
});
