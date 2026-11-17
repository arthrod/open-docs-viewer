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

Deno.test("the server table reads its figures from the results file; a route the file lacks has none", async () => {
  const { serverResults, SERVER_ROUTES } = await import("./results.ts");
  const rows = serverResults({ measuredAt: "2026-11-16", environment: "curl", engines: { folio: { firstMs: 1500, warmMs: 450, bytes: 9, firstCold: false } } });
  assertEquals(rows.length, SERVER_ROUTES.length);
  const folio = rows.find((r) => r.slug === "folio")!;
  assertEquals([folio.firstMs, folio.warmMs, folio.firstCold, folio.name], [1500, 450, false, "folio"]);
  assertEquals(rows.find((r) => r.slug === "plate")!.warmMs, null);
});

Deno.test("samples: a row measured on another day than the table says so", () => {
  const html = samplesSection(ENGINES, {
    measuredAt: "2026-11-16", environment: "test",
    samples: { redline: { document: "redline.docx",
      browser: { folio: { ...browserRow, measuredAt: "2026-11-10" }, plate: { ...browserRow, measuredAt: "2026-11-16" } },
      server: { folio: { code: 200, totalMs: 400, renderMs: 200, bytes: 9, pages: 3, runs: [400], measuredAt: "2026-11-12" } } } },
  }, noClient);
  assertStringIncludes(html, "measured 2026-11-10");
  assertStringIncludes(html, "measured 2026-11-12");
  assertEquals((html.match(/odv-prov/g) ?? []).length, 2);
});

Deno.test("Lighthouse: a page whose analyses disagree shows their range beside the median", () => {
  const wide = { ...lh(), performance: 71, performanceRuns: [79, 44, 71] };
  const tight = { ...lh(), performance: 98, performanceRuns: [97, 98, 98] };
  const html = lighthouseSection(ENGINES, { measuredAt: "2026-11-16", environment: "x", pages: { "v/folio": both(tight, wide), "r/folio": both(wide, tight), "v/docen": both(tight, tight) } });
  assertStringIncludes(html, "mobile analyses ranged 44 to 79");
  assertStringIncludes(html, "desktop analyses ranged 44 to 79");
  assertEquals((html.match(/analyses ranged/g) ?? []).length, 2);
});

Deno.test("Lighthouse: the 500-page table is shown when only it was measured", () => {
  const html = lighthouseSection(ENGINES, { measuredAt: null, environment: "", pages: {}, docs: { "lorem-500": { "v/folio": both() } }, docsMeta: { "lorem-500": { measuredAt: "2026-11-16", environment: "new run" } } });
  assertStringIncludes(html, "Measured 2026-11-16 · new run");
  assertStringIncludes(html, "/v/folio");
});

Deno.test("samples: what the server page cost the browser is shown even where curl has no result, or a failed one", () => {
  const client: ServerClientResults = { measuredAt: "2026-11-16", environment: "t", docs: { redline: {
    folio: { loadMs: 900, heapBytes: 2 * 1048576, rendererRss: 80 * 1048576, runs: [900] },
    plate: { loadMs: 700, heapBytes: 2 * 1048576, rendererRss: 70 * 1048576, runs: [700] },
    docen: { loadMs: 600, heapBytes: 2 * 1048576, rendererRss: 60 * 1048576, runs: [600] },
  } } } as unknown as ServerClientResults;
  const html = samplesSection(ENGINES, samples({ plate: { code: 500, totalMs: null, renderMs: null, bytes: null, pages: null, runs: [null], error: "HTTP 500" } }, { folio: browserRow, plate: browserRow }), client);
  const cell = (slug: string) => { const r = html.slice(html.indexOf(`/v/${slug}?`)); return r.slice(0, r.indexOf("</tr>")); };
  assertStringIncludes(cell("folio"), "in the browser: loaded 900 ms"); // no curl result
  assertStringIncludes(cell("plate"), "in the browser: loaded 700 ms"); // a failed curl result
  assertStringIncludes(cell("docen"), "in the browser: loaded 600 ms"); // neither browser page nor curl: still a row
});

Deno.test("samples: a run that failed says why, beside the median of the runs that rendered", () => {
  const html = samplesSection(ENGINES, samples({}, { folio: { ...browserRow, runs: [800, null, 810], failed: "not rendered within 240s <i>" } as typeof browserRow }), noClient);
  assertStringIncludes(html, "1 of 3 runs failed</span>: not rendered within 240s &lt;i&gt;");
});

Deno.test("samples: a run that rendered and then lost a reading says so", () => {
  const html = samplesSection(ENGINES, samples({}, { folio: { ...browserRow, incomplete: "TimeoutError: heap <b>" } as typeof browserRow }), noClient);
  assertStringIncludes(html, "a later reading failed</span>: TimeoutError: heap &lt;b&gt;");
});
