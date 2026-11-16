/**
 * WordCraft's server route, end to end with the real wasm module (fetched at
 * its pinned commit) and the real sample documents (fetched from Hugging Face).
 *
 *   deno test -A server/wordcraft_test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { wordcraftHtml, wordcraftPage } from "./wordcraft.ts";

const FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main";
const bytesOf = async (name: string) => new Uint8Array(await (await fetch(`${FIXTURES}/${name}.docx`)).arrayBuffer());
const pageUrls = (html: string) => [...html.matchAll(/<img class="page"[^>]* src="([^"]+)"/g)].map((m) => new URL(m[1].replaceAll("&amp;", "&"), "https://v.test"));
const pngSize = (p: Uint8Array) => {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
};

Deno.test("500 pages: the page is small and holds one lazily loaded image per page, none inline", async () => {
  const src = new URL(`${FIXTURES}/lorem-500.docx`);
  const r = await wordcraftHtml(await bytesOf("lorem-500"), src);
  assertEquals(r.pages, 550);
  assert(r.html.length < 400_000, `page is ${r.html.length} chars`);
  assert(!r.html.includes("data:image"), "no page image is inline");
  assert(r.html.trimEnd().endsWith("</html>"));
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assertEquals(imgs.length, 550);
  // The first screen loads at once; everything below it waits until it is near the viewport.
  const first = imgs[0] ?? "";
  assert(!first.includes('loading="lazy"'));
  assertEquals(imgs.filter((i) => i.includes('loading="lazy"')).length, 548);
  // US Letter at 96 CSS px per inch, reserved before the image arrives.
  assert(first.includes('width="816"') && first.includes('height="1056"'), first);
  const urls = pageUrls(r.html);
  assertEquals(urls[0].pathname, "/r/wordcraft/page");
  assertEquals(urls[0].searchParams.get("src"), src.href);
  assertEquals(urls[549].searchParams.get("n"), "550");
});

Deno.test("a page URL from the page answers with that page as a PNG, at 1 and 1.5 device pixels per CSS pixel", async () => {
  const src = new URL(`${FIXTURES}/showcase.docx`);
  const bytes = await bytesOf("showcase");
  const { html, pages } = await wordcraftHtml(bytes, src);
  assertEquals(pages, 3);
  const q = pageUrls(html)[2].searchParams;
  for (const [s, w, h] of [["1", 816, 1056], ["1.5", 1224, 1584]] as const) {
    const res = await wordcraftPage({ doc: q.get("doc")!, n: q.get("n")!, s }, () => Promise.resolve(bytes));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "image/png");
    const png = new Uint8Array(await res.arrayBuffer());
    assertEquals([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assertEquals(pngSize(png), { w, h });
  }
  // The image's own srcset offers both.
  assert(/srcset="[^"]*s=1 1x, [^"]*s=1\.5 1\.5x"/.test(html), "srcset with 1x and 1.5x");
});

Deno.test("a page request is refused when it cannot be that document's page", async () => {
  const bytes = await bytesOf("showcase");
  const other = await bytesOf("redline");
  const { html } = await wordcraftHtml(bytes, new URL(`${FIXTURES}/showcase.docx`));
  const doc = pageUrls(html)[0].searchParams.get("doc")!;
  const get = () => Promise.resolve(bytes);
  assertEquals((await wordcraftPage({ doc, n: "4", s: "1" }, get)).status, 404); // 3 pages
  assertEquals((await wordcraftPage({ doc, n: "0", s: "1" }, get)).status, 400);
  assertEquals((await wordcraftPage({ doc, n: "1", s: "7" }, get)).status, 400); // only 1 and 1.5 are rendered
  assertEquals((await wordcraftPage({ doc: "zz", n: "1", s: "1" }, get)).status, 400);
  // The URL now holds a different document than the page was made from.
  const moved = await wordcraftPage({ doc: "0".repeat(16), n: "1", s: "1" }, () => Promise.resolve(other));
  assertEquals(moved.status, 409);
  // A failed fetch is passed through as it is.
  const gone = await wordcraftPage({ doc: "1".repeat(16), n: "1", s: "1" }, () => Promise.resolve(new Response("upstream 404", { status: 422 })));
  assertEquals(gone.status, 422);
});
