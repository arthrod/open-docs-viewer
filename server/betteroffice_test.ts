/**
 * BetterOffice's server route, end to end with the real engine (jsDelivr's
 * copy of @betteroffice/docx and @betteroffice/fonts) and the real sample
 * documents (Hugging Face).
 *
 *   deno test -A server/betteroffice_test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { betterofficeForget, betterofficeHtml, betterofficePage, headersFootersOf } from "./betteroffice.ts";

const FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main";
const bytesOf = async (name: string) => new Uint8Array(await (await fetch(`${FIXTURES}/${name}.docx`)).arrayBuffer());
const pageUrls = (html: string) => [...html.matchAll(/<img class="page"[^>]* src="([^"]+)"/g)].map((m) => new URL(m[1].replaceAll("&amp;", "&"), "https://v.test"));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

Deno.test("BetterOffice: the rich sample is three Letter pages, each an SVG the engine's painter drew: glyph outlines, its picture, no text left to the reader's fonts", async () => {
  const src = new URL(`${FIXTURES}/showcase.docx`);
  const bytes = await bytesOf("showcase");
  const r = await betterofficeHtml(bytes, src);
  assertEquals(r.pages, 3);
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assert((imgs[0] ?? "").includes('width="816"') && (imgs[0] ?? "").includes('height="1056"'), imgs[0]);
  assert(!r.html.includes("srcset"), "one vector image per page");
  const urls = pageUrls(r.html);
  assertEquals(urls.map((u) => u.pathname), ["/r/betteroffice/page", "/r/betteroffice/page", "/r/betteroffice/page"]);
  const doc = urls[0].searchParams.get("doc")!;
  const svgs: string[] = [];
  for (const n of ["1", "2", "3"]) {
    const res = await betterofficePage({ doc, n, s: "1" }, () => Promise.resolve(bytes));
    assertEquals([res.status, res.headers.get("content-type")], [200, "image/svg+xml"]);
    assert(res.headers.get("content-security-policy")?.includes("default-src 'none'"));
    svgs.push(await res.text());
  }
  for (const svg of svgs) {
    assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="816" height="1056" viewBox="0 0 816 1056">') && svg.endsWith("</svg>"), svg.slice(0, 120));
    assert(!/<script|<foreignObject|\son\w+=|href="(?!#|data:image\/)/i.test(svg), "nothing in a page can run or load");
  }
  // Page 1: its 1,100-odd characters as outlines, the heading's colour, the table header's fill and the yellow highlight.
  assert(count(svgs[0], /<use /g) > 1000, `${count(svgs[0], /<use /g)} glyphs on page 1`);
  for (const colour of ['fill="#17375E"', 'fill="#1F3A8A"', 'fill="#FFFF00"']) assert(svgs[0].includes(colour), colour);
  // List numbers, bullets and small capitals reach the canvas as text: drawn as outlines here, not left to a font the reader may not have.
  assertEquals(svgs.map((s) => count(s, /<text /g)), [0, 0, 0]);
  // Page 2 holds the chart: the document's own PNG, inline.
  assertEquals(count(svgs[1], /<image href="data:image\/png;base64,/g), 1);
  assertEquals((await betterofficePage({ doc, n: "4", s: "1" }, () => Promise.resolve(bytes))).status, 404);
});

Deno.test("BetterOffice: the redline is drawn as a redline, with the engine's marks for insertions and deletions", async () => {
  const bytes = await bytesOf("redline");
  const r = await betterofficeHtml(bytes, new URL(`${FIXTURES}/redline.docx`));
  assertEquals(r.pages, 3);
  const doc = pageUrls(r.html)[0].searchParams.get("doc")!;
  await betterofficeForget(); // as a fresh isolate: the page is drawn from the document again
  let fetches = 0;
  const res = await betterofficePage({ doc, n: "1", s: "1" }, () => (fetches++, Promise.resolve(bytes)));
  assertEquals([res.status, fetches], [200, 1]);
  const svg = await res.text();
  // Deleted text in the engine's red, struck through; inserted text underlined in its green, each on its tint.
  assert(count(svg, /fill="#c62828"/g) > 50, "deleted text and its strike");
  assert(count(svg, /stroke="#2e7d32"/g) > 50, "the insertions' underline");
  assert(svg.includes('fill="rgba(211, 47, 47, 0.08)"') && svg.includes('fill="rgba(52, 168, 83, 0.08)"'), "the tints behind them");
});

Deno.test("BetterOffice: 500 pages open as a small page, and a page is built when it is asked for", async () => {
  const src = new URL(`${FIXTURES}/lorem-500.docx`);
  const r = await betterofficeHtml(await bytesOf("lorem-500"), src);
  assertEquals(r.pages, 500);
  assert(r.html.length < 400_000, `page is ${r.html.length} chars`);
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assertEquals([imgs.length, imgs.filter((i) => i.includes('loading="lazy"')).length], [500, 498]);
  const doc = pageUrls(r.html)[0].searchParams.get("doc")!;
  const kept = () => Promise.reject(new Error("the layout is kept: not fetched"));
  // Asked for together and out of order, as a browser does: each answer is its own page.
  const [last, first, again] = await Promise.all(["500", "1", "500"].map(async (n) => (await betterofficePage({ doc, n, s: "1" }, kept)).text()));
  assert(count(last, /<use /g) > 300 && count(first, /<use /g) > 1000, "both pages hold their text");
  assert(last !== first && last === again, "page 500 is page 500 both times");
  await betterofficeForget();
});

Deno.test("BetterOffice: the header and footer parts are read from the layout reply without parsing the layout", () => {
  const hf = { titlePg: false, variants: [{ rId: "rId9", kind: "header" }] };
  assertEquals(headersFootersOf(`{"layout":{"pages":[{"x":",\\"headersFooters\\":"}]},"headersFooters":${JSON.stringify(hf)},"notesConverged":true}`), hf);
  // A reply in another order, or without them, is read whole.
  assertEquals(headersFootersOf(`{"notesConverged":true,"headersFooters":${JSON.stringify(hf)},"layout":{}}`), hf);
  assertEquals(headersFootersOf('{"layout":{},"notesConverged":true}'), undefined);
});

Deno.test("BetterOffice: a zip that is not a .docx is refused in a sentence", async () => {
  // An empty zip: the end-of-central-directory record alone.
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  let said = "";
  await betterofficeHtml(empty, new URL(`${FIXTURES}/empty.docx`)).catch((e) => (said = String(e?.message ?? e)));
  assert(said.length > 5 && !said.includes("\n    at "), `refused with: ${JSON.stringify(said)}`);
});
