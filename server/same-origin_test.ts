import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { ENGINES } from "./engines.ts";
import { viewPage } from "./render.ts";
import { passedThrough, passThroughHeaders, passThroughPath, passThroughUrl, VENDOR_ROOT } from "./pass-through.ts";

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

Deno.test("pass-through: the OpenDoc frame's request reaches the editors site without the prefix, its query untouched", () => {
  const asked = new URL("https://viewers.benchmarks.law/eo1/vendor/opendoc/2026-11-05/editor.html?blank=1&od-at=https%3A%2F%2Fviewers.benchmarks.law%2Feo1");
  assertEquals(
    passThroughUrl("https://editors.benchmarks.law", asked),
    "https://editors.benchmarks.law/vendor/opendoc/2026-11-05/editor.html?blank=1&od-at=https%3A%2F%2Fviewers.benchmarks.law%2Feo1",
  );
  assertEquals(passThroughUrl("https://editors.benchmarks.law", new URL("https://viewers.benchmarks.law/eo1/api/keys")), undefined);
});

Deno.test("pass-through: an answer that may not have a body keeps its status, and a download keeps its file name", async () => {
  const none = await passedThrough(new Response(null, { status: 304 }));
  assertEquals([none.status, none.body], [304, null]);
  const file = await passedThrough(new Response("x", { headers: { "content-disposition": 'attachment; filename="open-docs-sample.docx"' } }));
  assertEquals(file.headers.get("content-disposition"), 'attachment; filename="open-docs-sample.docx"');
});

Deno.test("pass-through: the body is streamed on, not read into memory first", () => {
  const upstream = new Response(new ReadableStream({ pull() {/* never produces: reading it whole would hang */} }));
  const res = passedThrough(upstream);
  assertEquals([res.status, res.body instanceof ReadableStream], [200, true]);
});
