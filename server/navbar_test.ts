import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { ENGINES } from "./engines.ts";
import { landingPage } from "./landing.ts";
import { viewPage } from "./render.ts";
import { RESULTS } from "./results.ts";
import { SERVER_RENDER_SLUGS } from "./navbar.ts";

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
  assertStringIncludes(html, `editors-arena.val.run`);
});

Deno.test("Contact is the last item of both menus; crumb reads / viewers (#9)", () => {
  const e = ENGINES.find((x) => x.slug === "docxodus")!;
  const pages = [viewPage(e, shell, src, absolutize), landingPage(ENGINES, RESULTS, SAMPLE_SRC)];
  for (const html of pages) {
    assertStringIncludes(html, `<span class="crumb">/ viewers</span>`);
    const menu = html.slice(html.indexOf(`id="od-menu"`));
    const items = [...menu.slice(0, menu.indexOf("</div>\n    </div>")).matchAll(/role="menuitem"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
    assertEquals(items.at(-1), "Contact →");
    assertStringIncludes(menu, `href="https://arthur.law/contact"`);
  }
});
