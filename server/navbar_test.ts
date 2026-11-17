import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { ENGINES } from "./engines.ts";
import { landingPage } from "./landing.ts";
import { viewPage } from "./render.ts";
import { RESULTS } from "./results.ts";
import { goTarget, SERVER_RENDER_SLUGS } from "./navbar.ts";

const SAMPLE_SRC =
  "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx";
const esc = (s: string) => encodeURIComponent(s);
const src = new URL(SAMPLE_SRC);
const shell = { body: "<div id=\"mount\"></div>", entry: "/editors/docxodus/main.ts" };
const absolutize = (h: string) => h;

Deno.test("view page: open-docs wordmark and / viewer crumb", () => {
  const e = ENGINES.find((x) => x.slug === "docxodus")!;
  const html = viewPage(e, shell, src, absolutize);
  assertStringIncludes(html, `<span class="del">CHILL</span>`);
  assertStringIncludes(html, `<span class="ins">NEUROTIC</span>`);
  assertStringIncludes(html, `DOCX<span class="dot">.</span>BENCH`);
  assertStringIncludes(html, `<span class="crumb">/ viewers</span>`);
  assertStringIncludes(html, `<header class="site-nav od-bar odv-chrome">`);
});

Deno.test("view page: Re-measure lives in the menu, not the bar", () => {
  const e = ENGINES[0]!;
  const html = viewPage(e, shell, src, absolutize);
  const menuStart = html.indexOf(`class="od-menu" id="od-menu"`);
  const remeasure = html.indexOf(`id="od-remeasure"`);
  assertEquals(remeasure > menuStart, true);
  const barEnd = html.indexOf("</header>");
  assertEquals(remeasure < barEnd, true);
});

Deno.test("view page: engine picker lists every engine and keeps src", () => {
  const e = ENGINES.find((x) => x.slug === "plate")!;
  const custom = new URL("https://example.com/doc.docx");
  const html = viewPage(e, shell, custom, absolutize);
  assertStringIncludes(html, `id="od-switch"`);
  assertStringIncludes(html, `data-src="${custom.href.replace(/&/g, "&amp;")}"`);
  for (const eng of ENGINES) {
    assertStringIncludes(html, `value="${eng.slug}"`);
  }
  assertEquals((html.match(/<option /g) ?? []).length, ENGINES.length);
});

Deno.test("view page: server results link only for server-rendered engines", () => {
  for (const e of ENGINES) {
    const html = viewPage(e, shell, src, absolutize);
    const link = `/r/${e.slug}?src=${esc(src.href)}`;
    assertEquals(html.includes(link), SERVER_RENDER_SLUGS.has(e.slug), e.slug);
  }
});

Deno.test("view page: a vendor's embed viewer is server-rendered, Browser struck out", () => {
  const frames = ENGINES.filter((e) => e.frame);
  assertEquals(frames.map((e) => e.slug).sort(), ["google-viewer", "word-online"]);
  for (const e of frames) {
    const html = viewPage(e, shell, src, absolutize);
    assertStringIncludes(html, `<span class="off" aria-disabled="true" title="Nothing is rendered in your browser`, e.slug);
    assertStringIncludes(html, `servers, not this site's; the frame shows their finished pages">Server</span>`, e.slug);
    assertEquals(html.includes(`title="Rendered in your browser by the engine"`), false, e.slug);
  }
});

Deno.test("view page: Browser | Server toggle, Server a link only where a route exists", () => {
  for (const e of ENGINES.filter((e) => !e.frame)) {
    const html = viewPage(e, shell, src, absolutize);
    assertStringIncludes(html, `<span class="on" aria-current="page"`, e.slug);
    const link = `<a href="/r/${e.slug}?src=${esc(src.href)}" title="Rendered on this server`;
    assertEquals(html.includes(link), SERVER_RENDER_SLUGS.has(e.slug), e.slug);
    // The toggle's own struck-out Server side, by its full opening tag: another `.off` elsewhere would not match.
    assertEquals(html.includes(`<span class="off" aria-disabled="true" title="This engine has no server route on this site">Server`), !SERVER_RENDER_SLUGS.has(e.slug), e.slug);
  }
});

Deno.test("landing: wordmark and site links with MENU chrome", () => {
  const html = landingPage(ENGINES, RESULTS, SAMPLE_SRC);
  assertStringIncludes(html, `>CHILL<`);
  assertStringIncludes(html, `>NEUROTIC<`);
  assertStringIncludes(html, `/ viewer`);
  assertStringIncludes(html, `id="od-more"`);
  assertStringIncludes(html, `id="od-menu"`);
  assertStringIncludes(html, `Editors`);
  assertStringIncludes(html, `Viewers`);
  assertStringIncludes(html, `Measurements`);
  assertStringIncludes(html, `arena.benchmarks.law`);
});

Deno.test("Contact is the last item of both menus; crumb reads / viewers (#9)", () => {
  const e = ENGINES.find((x) => x.slug === "docxodus")!;
  const pages = [viewPage(e, shell, src, absolutize), landingPage(ENGINES, RESULTS, SAMPLE_SRC)];
  for (const html of pages) {
    assertStringIncludes(html, `<span class="crumb">/ viewers</span>`);
    const menu = html.slice(html.indexOf(`id="od-menu"`));
    const items = [...menu.slice(0, menu.indexOf("\n      </div>")).matchAll(/<(?:a|button)\b[^>]*>([^<]*)</g)].map((m) => m[1].trim());
    assertEquals(items.at(-1), "Contact →");
    assertStringIncludes(menu, `href="https://arthur.law/contact"`);
  }
});

Deno.test("view menu credits the makers under / Made by; Contact still last (#13)", () => {
  const e = { ...ENGINES.find((x) => x.slug === "docxodus")!, makers: [
    { name: "John Scrudato", kind: "person" as const, linkedin: "https://www.linkedin.com/in/john-scrudato/" },
  ] };
  const html = viewPage(e, shell, src, absolutize);
  const menu = html.slice(html.indexOf(`id="od-menu"`));
  assertStringIncludes(menu, "/ Made by");
  assertStringIncludes(menu, `href="https://www.linkedin.com/in/john-scrudato/"`);
  const items = [...menu.slice(0, menu.indexOf("\n      </div>")).matchAll(/<(?:a|button)\b[^>]*>([^<]*)</g)].map((m) => m[1].trim());
  assertEquals(items.at(-1), "Contact →");
});

Deno.test("navbar: the menu is a disclosure, not an ARIA menu (it has no arrow-key navigation)", () => {
  for (const html of [landingPage(ENGINES, RESULTS, SAMPLE_SRC), viewPage(ENGINES[0]!, shell, src, absolutize)]) {
    assertStringIncludes(html, `aria-expanded="false" aria-controls="od-menu"`);
    assertEquals(/role="menu(?:item)?"|aria-haspopup/.test(html), false);
  }
});

Deno.test("a /v page gives an engine the page the editors site gives it: border-box, a plain 13px body, no brand type", () => {
  const html = viewPage(ENGINES[0]!, shell, src, absolutize);
  // As open-docs' `* { box-sizing: border-box }`: Plate's adapter lays its page out under it.
  assertStringIncludes(html, ".odv-chrome-wrap *,");
  assertStringIncludes(html, ".odv-chrome-wrap{background:var(--bg);font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45}");
  // Brand type is on the bar and the error box, not on the body an engine inherits from.
  const body = html.match(/\.odv-chrome-wrap\{[^}]*\}/g)!.join("");
  assertEquals(/letter-spacing|font-smoothing|var\(--font-sans\)|color:var\(--ink\)/.test(body), false);
  assertStringIncludes(html, ".bl.odv,.odv-chrome,#od-stage > .verr{color:var(--ink);font-family:var(--font-sans)");
  assertEquals(/html\.odv-view body\{[^}]*color:/.test(html), false);
});

Deno.test("the long separator row of a table may wrap", () => {
  assertStringIncludes(viewPage(ENGINES[0]!, shell, src, absolutize), ".tbl tr.odv-sep th{white-space:normal;");
});

Deno.test("a menu button that is hidden stays hidden", () => {
  assertStringIncludes(viewPage(ENGINES[0]!, shell, src, absolutize), ".od-menu>button:not([hidden]),.od-menu>a{");
});

Deno.test("the status is readable on a phone, and whole on hover when it is cut", () => {
  const html = viewPage(ENGINES[0]!, shell, src, absolutize);
  const phone = html.slice(html.indexOf("@media(max-width:760px){"));
  assertEquals(phone.includes(".od-status-chip{display:none}"), false);
  assertStringIncludes(phone, ".od-status-chip{order:1;flex:0 0 100%;");
});

Deno.test("without script, the landing's form still reaches the engine's page", () => {
  assertEquals(goTarget("folio", "https://example.com/a.docx", ENGINES), "/v/folio?src=https%3A%2F%2Fexample.com%2Fa.docx");
  assertEquals(goTarget("nope", "https://example.com/a.docx", ENGINES), null);
  assertEquals(goTarget("folio", "", ENGINES), null);
});
