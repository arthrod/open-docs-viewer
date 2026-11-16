/** Behaviour asked for in the review of PR #17: the /r/ toggle, the landing tables, the route registry. */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { ENGINES } from "./engines.ts";
import { lighthouseSection, samplesSection } from "./landing.ts";
import { renderToggle, SERVER_RENDER_SLUGS, serverToggle } from "./navbar.ts";
import { codeLines } from "./plate.ts";
import type { LighthousePage, LighthouseResults, SampleResults, ServerClientResults } from "./samples.ts";
import { SUPERDOC_CSS } from "./superdoc.ts";

const src = new URL("https://example.com/a b.docx?x=1&y=2");
const href = `/v/folio?src=${encodeURIComponent(src.href)}`;

Deno.test("/r/ toggle: the Browser link keeps the document, with or without a </body>, whatever its case", () => {
  for (const html of ["<html><body><p>x</p></body></html>", "<HTML><BODY><p>x</p></BODY></HTML>", "<p>no document tags</p>"]) {
    const out = serverToggle(html, "folio", src);
    assertStringIncludes(out, `<a href="${href}"`);
    assertStringIncludes(out, `aria-current="page"`);
  }
  // Before the closing tag when there is one (any case), so the bar is inside the document.
  const upper = serverToggle("<HTML><BODY><p>x</p></BODY></HTML>", "folio", src);
  assert(upper.indexOf("<nav") < upper.indexOf("</BODY>"), upper);
  assert(serverToggle("<p>x</p>", "folio", src).endsWith("</nav>"));
});

Deno.test("/r/ toggle: the slug is escaped, and the bar is not printed", () => {
  const out = serverToggle("<body></body>", `x"><script>alert(1)</script>`, src);
  assertEquals(out.includes("<script>"), false);
  assertStringIncludes(out, "@media print");
});

Deno.test("a struck-out side of the toggle says why to a screen reader too", () => {
  const noRoute = renderToggle("apryse", src, "browser");
  assertStringIncludes(noRoute, `<span class="off" aria-disabled="true"`);
  assertStringIncludes(noRoute, `<span class="od-sr"> (not available: this engine has no server route on this site)</span>`);
  const vendor = renderToggle("word-online", src, "browser", true);
  assertStringIncludes(vendor, `<span class="off" aria-disabled="true"`);
  assertStringIncludes(vendor, `<span class="od-sr"> (not available: nothing is rendered in your browser)</span>`);
});

Deno.test("the toggle's list of server routes is the router's list", async () => {
  // The router imports Val Town's std utils, whose client wants a key at import time; none is used here.
  if (!Deno.env.get("VAL_TOWN_API_KEY")) Deno.env.set("VAL_TOWN_API_KEY", "not-used-by-this-test");
  const { RENDERERS } = await import("../main.http.ts");
  assertEquals([...SERVER_RENDER_SLUGS].sort(), Object.keys(RENDERERS).sort());
});

Deno.test("code paragraphs keep revision marks (the Plate route)", () => {
  assertEquals(codeLines([{ text: "old", strikethrough: true }, { text: "new\nx", underline: true }]), [
    { type: "code_line", children: [{ text: "old", strikethrough: true }, { text: "new", underline: true }] },
    { type: "code_line", children: [{ text: "x", underline: true }] },
  ]);
});

Deno.test("SuperDoc: a change marked only by an attribute (an inserted or deleted row) is drawn", () => {
  assertStringIncludes(SUPERDOC_CSS, `[data-superdoc-change-side="inserted"]`);
  assertStringIncludes(SUPERDOC_CSS, `[data-superdoc-change-side="deleted"]`);
});

const lh = (over: Partial<LighthousePage> = {}): LighthousePage => ({
  performance: 90, accessibility: 100, bestPractices: 100, seo: 90, fcpMs: 300, lcpMs: 500, tbtMs: 0, cls: 0, speedIndexMs: 600,
  performanceRuns: [90, 90, 90], error: null, ...over,
});
const both = (d = lh(), m = lh()) => ({ desktop: d, mobile: m });

Deno.test("Lighthouse: a median from fewer analyses than were run says so, for the browser page and the server route", () => {
  const data: LighthouseResults = {
    measuredAt: "2026-11-16", environment: "t",
    pages: {
      "v/docxodus": both(lh({ performance: 35, performanceRuns: [null, 35, null], error: "PAGE_HUNG: stopped responding" })),
      "r/docxodus": both(lh(), lh({ performance: 60, performanceRuns: [60, null, 60], error: "NO_FCP" })),
    },
  };
  const html = lighthouseSection(ENGINES, data);
  assertStringIncludes(html, "desktop 1/3 analyses: PAGE_HUNG: stopped responding");
  assertStringIncludes(html, "mobile 2/3 analyses: NO_FCP");
});

Deno.test("Lighthouse: a server route measured without its browser page still has a row", () => {
  const html = lighthouseSection(ENGINES, { measuredAt: "2026-11-16", environment: "t", pages: { "r/wordcraft": both(lh({ performance: 77 })) } });
  assertStringIncludes(html, ">77</b>");
  assertStringIncludes(html, "not measured yet");
});

Deno.test("Lighthouse: the 500-page table is dated by its own run when the file records one", () => {
  const data: LighthouseResults = {
    measuredAt: "2026-11-10", environment: "old", pages: { "v/folio": both() },
    docs: { "lorem-500": { "v/folio": both() } }, docsMeta: { "lorem-500": { measuredAt: "2026-11-16", environment: "new run" } },
  };
  assertStringIncludes(lighthouseSection(ENGINES, data), "Measured 2026-11-16 · new run");
});

const browserRow = { renderedMs: 800, runs: [800], bytes: 1000, requests: 3, heapBytes: 5 * 1048576, rendererRss: 300 * 1048576, how: "data-od-rendered" };
const noClient: ServerClientResults = { measuredAt: null, environment: "", docs: {} };
const samples = (server: SampleResults["samples"][string]["server"], browser: Record<string, typeof browserRow>): SampleResults => ({
  measuredAt: "2026-11-15", environment: "t", samples: { redline: { document: "redline.docx", browser, server } },
});

Deno.test("samples: a vendor frame's time is labelled as a frame load and has no heap of its own", () => {
  const html = samplesSection(ENGINES, samples({}, { "word-online": { ...browserRow, how: "frame load event" } }), noClient);
  const row = html.slice(html.indexOf("/v/word-online"));
  assertStringIncludes(row.slice(0, row.indexOf("</tr>")), "800 ms</b> <span class=\"ro\">frame load</span>");
  assertEquals(row.slice(0, row.indexOf("</tr>")).includes("5.0 MB"), false);
});

Deno.test("samples: a route that exists but was not measured is not called absent", () => {
  const html = samplesSection(ENGINES, samples({ plate: { code: 200, totalMs: 400, renderMs: 200, bytes: 9, pages: null, runs: [400] } }, { folio: browserRow, plate: browserRow, apryse: browserRow }), noClient);
  const cell = (slug: string) => { const r = html.slice(html.indexOf(`/v/${slug}?`)); return r.slice(0, r.indexOf("</tr>")); };
  assertStringIncludes(cell("folio"), "not measured on this file yet");
  assertStringIncludes(cell("apryse"), "no server route");
});

Deno.test("samples: a median beside a failed run shows that run's error", () => {
  const html = samplesSection(ENGINES, samples({ folio: { code: 200, totalMs: 400, renderMs: 200, bytes: 9, pages: 3, runs: [400, null], error: "curl exited 18 <b>" } }, { folio: browserRow }), noClient);
  assertStringIncludes(html, `<span class="odv-fail">1 of 2 runs failed</span>: curl exited 18 &lt;b&gt;`);
  assertStringIncludes(html, "<b>400 ms</b>"); // the median of the run that answered stays
});

Deno.test("Lighthouse: a page analysed in a different run from its table says when", () => {
  const html = lighthouseSection(ENGINES, {
    measuredAt: "2026-11-10", environment: "old",
    pages: { "v/folio": { ...both(), measuredAt: "2026-11-10", environment: "old" }, "r/folio": { ...both(), measuredAt: "2026-11-16", environment: "new run" } },
  });
  assertStringIncludes(html, "measured 2026-11-16 · new run");
  assertEquals((html.match(/odv-prov/g) ?? []).length, 1);
});
