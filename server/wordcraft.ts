/**
 * WordCraft, rendered on this server: WordCraft's own .docx reader, page
 * layout and rasteriser (vello_cpu), compiled to wasm — the pipeline
 * `wordcraft-cli convert x.docx x.png` runs. Pages are PNGs, the way
 * Microsoft's viewer sends page images, and they are sent the way Microsoft's
 * and Google's viewers send theirs: the page itself is small (every page's
 * size and one image URL each), and a page is rasterised when the browser
 * asks for its image, which it does as the page nears the viewport
 * (`loading="lazy"`, no script). Opening 500 pages costs what opening 3 does.
 *
 * (Every page inline in one response was 522 MB for 550 pages; the platform
 * closed that response partway through.)
 *
 * Nothing is stored: an image URL names the document's URL, the first 16 hex
 * digits of its SHA-256 and the page number. An isolate that has not seen the
 * document fetches and lays it out again (about a second for 550 pages) and
 * keeps the layout in memory for the pages asked for next.
 *
 * The module (12.6 MB, 5.3 MB gzipped) is built from storytold/wordcraft by
 * open-docs/tools/wordcraft-render (its README has the exact build). Val
 * files are text-only, so it is fetched once per isolate from the open-docs
 * repo at a pinned commit and checked against its pinned SHA-256 before it is
 * instantiated. The glue (wc_render.js) is that build's wasm-bindgen output.
 */
import init, { Doc } from "./wc_render.js";

const COMMIT = "dec24e9e9c2c36d625144b5fed1695b1e599b947";
const WASM_GZ = `https://raw.githubusercontent.com/arthrod/open-docs/${COMMIT}/tools/wordcraft-render/dist/wc_render_bg.wasm.gz`;
const WASM_GZ_SHA256 = "60869b8554e3656bfe13f517d1cece3d99b05d017e261d65ce597e614a6cc85f";
const CSS_PX_PER_POINT = 96 / 72;
/**
 * The two rasters offered per page, by device pixels per CSS pixel: 1 is one
 * pixel per CSS pixel; 1.5 is 2 pixels per point, for denser screens.
 */
const DENSITIES = ["1", "1.5"] as const;
/** Pages above the fold load with the page; the rest wait until they are near the viewport. */
const EAGER_PAGES = 2;
/** Layouts kept per isolate. */
const KEPT = 3;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (b: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>));

let ready: Promise<void> | undefined;
function load() {
  ready ??= (async () => {
    const res = await fetch(WASM_GZ);
    if (!res.ok) throw new Error(`WordCraft wasm: HTTP ${res.status}`);
    const gz = await res.arrayBuffer();
    const got = hex(await crypto.subtle.digest("SHA-256", gz));
    if (got !== WASM_GZ_SHA256) throw new Error(`WordCraft wasm: SHA-256 ${got}, expected ${WASM_GZ_SHA256}`);
    const wasm = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    await init({ module_or_path: wasm });
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

/** A document laid out: its id (16 hex digits of its SHA-256) and every page's size in points. */
type Laid = { doc: Doc; sizes: Float32Array; initMs: number; layoutMs: number };
/** Most recently used last. A dropped layout is freed by the glue's finalizer, not here: a request may still hold it. */
const laid = new Map<string, Promise<Laid>>();

/** The layout of `bytes`: the one kept under `id`, or a new one when there is none (or `anew`). */
function layOut(id: string, bytes: Uint8Array, anew = false): Promise<Laid> {
  let hit = anew ? undefined : laid.get(id);
  laid.delete(id);
  if (!hit) {
    hit = (async () => {
      const t0 = performance.now();
      await load();
      const t1 = performance.now();
      const doc = new Doc(bytes);
      return { doc, sizes: doc.page_sizes(), initMs: Math.round(t1 - t0), layoutMs: Math.round(performance.now() - t1) };
    })();
    hit.catch(() => laid.delete(id));
  }
  laid.set(id, hit);
  for (const old of laid.keys()) {
    if (laid.size <= KEPT) break;
    laid.delete(old);
  }
  return hit;
}

const attr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export async function wordcraftHtml(bytes: Uint8Array, src: URL) {
  const id = (await sha256(bytes)).slice(0, 16);
  // Opening the page always reads and lays the document out, as every other engine's route does;
  // only its page images reuse that work.
  const { sizes, initMs, layoutMs } = await layOut(id, bytes, true);
  const count = sizes.length / 2;
  const q = `/r/wordcraft/page?src=${encodeURIComponent(src.href)}&doc=${id}`;
  const pages: string[] = [];
  for (let i = 0; i < count; i++) {
    const url = (s: string) => attr(`${q}&n=${i + 1}&s=${s}`);
    // Shown at the page's CSS size (points × 96/72), like the other engines; reserved before the image arrives.
    pages.push(
      `<img class="page" alt="Page ${i + 1}" width="${Math.round(sizes[2 * i] * CSS_PX_PER_POINT)}" height="${Math.round(sizes[2 * i + 1] * CSS_PX_PER_POINT)}"` +
        `${i < EAGER_PAGES ? "" : ' loading="lazy"'} decoding="async" src="${url("1")}" srcset="${DENSITIES.map((s) => `${url(s)} ${s}x`).join(", ")}" />`,
    );
  }
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>WordCraft · server-rendered</title>
<style>html,body{margin:0}body{background:#eef1f5;padding:24px 0;display:flex;flex-direction:column;align-items:center;gap:16px}
img.page{display:block;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06);max-width:calc(100vw - 16px);height:auto}</style>
</head><body>${pages.join("\n")}</body></html>`;
  return { html, pages: count, initMs, renderMs: layoutMs };
}

const refuse = (status: number, msg: string) => new Response(msg, { status, headers: { "cache-control": "no-store" } });

/**
 * One page as a PNG. `getBytes` fetches the document, and is only called when
 * this isolate does not hold its layout; a Response from it (the fetch
 * failed) is passed through.
 */
export async function wordcraftPage(
  q: { doc?: string; n?: string; s?: string },
  getBytes: () => Promise<Uint8Array | Response>,
): Promise<Response> {
  if (!q.doc || !/^[0-9a-f]{16}$/.test(q.doc)) return refuse(400, "doc must be 16 hex digits");
  if (!q.n || !/^[1-9]\d{0,5}$/.test(q.n)) return refuse(400, "n must be a page number, from 1");
  if (!DENSITIES.includes(q.s as typeof DENSITIES[number])) return refuse(400, `s must be one of ${DENSITIES.join(", ")}`);
  const t0 = performance.now();
  let hit = laid.get(q.doc);
  let fetchMs = 0;
  if (!hit) {
    const bytes = await getBytes();
    if (bytes instanceof Response) return bytes;
    fetchMs = Math.round(performance.now() - t0);
    if ((await sha256(bytes)).slice(0, 16) !== q.doc) {
      return refuse(409, "the document at that URL is no longer the one this page was made from: reload the page");
    }
    hit = layOut(q.doc, bytes);
  } else hit = layOut(q.doc, new Uint8Array()); // already laid out: only moves it to most recently used
  const t1 = performance.now();
  const { doc, sizes } = await hit;
  const n = Number(q.n);
  if (n > sizes.length / 2) return refuse(404, `the document has ${sizes.length / 2} pages`);
  const t2 = performance.now();
  // Pixels per point: 96/72 is one pixel per CSS pixel.
  const png = doc.render_page(n - 1, Number(q.s) * CSS_PX_PER_POINT);
  return new Response(png as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "image/png",
      "server-timing": `fetch;dur=${fetchMs}, layout;dur=${Math.round(t2 - t1)}, render;dur=${Math.round(performance.now() - t2)}`,
      // The URL names the document by its hash, so the image does not change under it; an hour, so a new engine build shows up.
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
