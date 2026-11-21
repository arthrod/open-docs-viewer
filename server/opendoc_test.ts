/**
 * OpenDoc's server route, end to end with the real engine (its wasm from
 * jsDelivr's copy of the npm package, its fonts from OpenDoc's repository) and
 * the real sample documents (Hugging Face).
 *
 *   deno test -A server/opendoc_test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { opendocFontNeeds, opendocForget, opendocHtml, opendocPage } from "./opendoc.ts";

const FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main";
const bytesOf = async (name: string) => new Uint8Array(await (await fetch(`${FIXTURES}/${name}.docx`)).arrayBuffer());
const pageUrls = (html: string) => [...html.matchAll(/<img class="page"[^>]* src="([^"]+)"/g)].map((m) => new URL(m[1].replaceAll("&amp;", "&"), "https://v.test"));
const png = async (res: Response) => {
  const p = new Uint8Array(await res.arrayBuffer());
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { magic: [...p.subarray(0, 4)], w: v.getUint32(16), h: v.getUint32(20), bytes: p.length };
};

Deno.test("OpenDoc: the rich sample is three Letter pages, each a PNG the engine drew, at 1 and 1.5 device pixels per CSS pixel", async () => {
  const src = new URL(`${FIXTURES}/showcase.docx`);
  const bytes = await bytesOf("showcase");
  const r = await opendocHtml(bytes, src);
  assertEquals(r.pages, 3);
  assert(!r.html.includes("data:image"), "no page image is inline");
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assert((imgs[0] ?? "").includes('width="816"') && (imgs[0] ?? "").includes('height="1056"'), imgs[0]);
  const urls = pageUrls(r.html);
  assertEquals(urls.map((u) => u.pathname), ["/r/opendoc/page", "/r/opendoc/page", "/r/opendoc/page"]);
  assertEquals(urls[0].searchParams.get("src"), src.href);
  const q = urls[2].searchParams;
  for (const [s, w, h] of [["1", 816, 1056], ["1.5", 1224, 1584]] as const) {
    const res = await opendocPage({ doc: q.get("doc")!, n: q.get("n")!, s }, () => Promise.resolve(bytes));
    assertEquals([res.status, res.headers.get("content-type")], [200, "image/png"]);
    const got = await png(res);
    assertEquals([got.magic, got.w, got.h], [[0x89, 0x50, 0x4e, 0x47], w, h]);
    assert(got.bytes > 10_000, `page 3 at ${s}x is ${got.bytes} bytes: an empty page`);
  }
  assertEquals((await opendocPage({ doc: q.get("doc")!, n: "4", s: "1" }, () => Promise.resolve(bytes))).status, 404);
});

Deno.test("OpenDoc: every font the samples ask for is drawn in a face the engine has, none left to its one embedded family for want of a file", async () => {
  for (const name of ["showcase", "redline"]) {
    const needs = await opendocFontNeeds(await bytesOf(name));
    const by = Object.fromEntries(needs.map((n) => [n.requested, n]));
    assertEquals([by["Calibri"]?.substitute, by["Courier New"]?.substitute, by["Georgia"]?.substitute], ["Carlito", "Liberation Mono", "Liberation Serif"], name);
    assertEquals(needs.filter((n) => !n.substituteAvailable), [], name);
  }
});

Deno.test("OpenDoc: the redline is three pages, and an isolate without its layout draws a page from the document again", async () => {
  const bytes = await bytesOf("redline");
  const r = await opendocHtml(bytes, new URL(`${FIXTURES}/redline.docx`));
  assertEquals(r.pages, 3);
  const doc = pageUrls(r.html)[0].searchParams.get("doc")!;
  await opendocForget(); // as a fresh isolate
  let fetches = 0;
  const res = await opendocPage({ doc, n: "1", s: "1" }, () => (fetches++, Promise.resolve(bytes)));
  assertEquals([res.status, fetches], [200, 1]);
  assertEquals((await png(res)).w, 816);
});

Deno.test("OpenDoc: 500 pages open as a small page with one lazily loaded image per page", async () => {
  const src = new URL(`${FIXTURES}/lorem-500.docx`);
  const r = await opendocHtml(await bytesOf("lorem-500"), src);
  assertEquals(r.pages, 500);
  assert(r.html.length < 400_000, `page is ${r.html.length} chars`);
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assertEquals([imgs.length, imgs.filter((i) => i.includes('loading="lazy"')).length], [500, 498]);
  const last = pageUrls(r.html)[499].searchParams;
  const res = await opendocPage({ doc: last.get("doc")!, n: "500", s: "1" }, () => Promise.reject(new Error("the layout is kept: not fetched")));
  assertEquals(res.status, 200);
  assertEquals((await png(res)).h, 1056);
  await opendocForget();
});

Deno.test("OpenDoc: a zip that is not a .docx is refused in a sentence", async () => {
  // An empty zip: the end-of-central-directory record alone.
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  let said = "";
  await opendocHtml(empty, new URL(`${FIXTURES}/empty.docx`)).catch((e) => (said = String(e?.message ?? e)));
  assert(said.length > 5 && !said.includes("\n    at "), `refused with: ${JSON.stringify(said)}`);
});
