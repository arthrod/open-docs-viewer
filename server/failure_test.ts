import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { renderFailure } from "./failure.ts";
import { serverToggle } from "./navbar.ts";

Deno.test("an engine that throws on a document answers with the reason and no stack trace", async () => {
  const err = new Error("missing part: word/document.xml\n    at wasm://wasm/00a1:wasm-function[412]");
  err.stack = "Error: missing part: word/document.xml\n    at file:///app/server/wc_render.js:79:11";
  const res = renderFailure("WordCraft", err);
  const body = await res.text();
  assertEquals(res.status, 422);
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertEquals(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assertStringIncludes(body, "WordCraft could not open this document: missing part: word/document.xml");
  assertEquals(/wasm-function|wc_render|\bat \S+:\d+/.test(body), false);
  assertEquals(await renderFailure("folio", "a string was thrown").text(), "folio could not open this document: a string was thrown");
  assertEquals((await renderFailure("folio", new Error("x".repeat(900))).text()).length < 400, true);
});

Deno.test("the toggle goes before the last closing body tag in time proportional to the page", () => {
  const page = "<html><body>" + "<p>&lt;/body&gt; </body > </BODY></p>".repeat(20000) + "</body></html>";
  const t0 = performance.now();
  const out = serverToggle(page, "folio", new URL("https://example.com/a.docx"));
  assertEquals(performance.now() - t0 < 500, true); // the lookahead version took seconds on 1000 occurrences in 29 MB
  assertEquals(out.endsWith("</nav></body></html>"), true);
  assertEquals(out.match(/data-odv-toggle aria-label/g)?.length, 1);
});
