/**
 * WordCraft, rendered on this server: WordCraft's own .docx reader, page
 * layout and rasteriser (vello_cpu), compiled to wasm — the pipeline
 * `wordcraft-cli convert x.docx x.png` runs. Pages come back as PNGs, the
 * way Microsoft's viewer sends page images.
 *
 * The module (12.5 MB, 5.3 MB gzipped) is built from storytold/wordcraft by
 * open-docs/tools/wordcraft-render (its README has the exact build). Val
 * files are text-only, so it is fetched once per isolate from the open-docs
 * repo at a pinned commit and checked against its pinned SHA-256 before it is
 * instantiated. The glue (wc_render.js) is that build's wasm-bindgen output.
 */
import init, { render_docx } from "./wc_render.js";

const COMMIT = "5cb4fca54a7dbf4865e456e01eee9dd89a5517d4";
const WASM_GZ = `https://raw.githubusercontent.com/arthrod/open-docs/${COMMIT}/tools/wordcraft-render/dist/wc_render_bg.wasm.gz`;
const WASM_GZ_SHA256 = "e42d2c262d052b33292fd9dbace987be9b457b091209d5497e987d231bf949f6";
/** PNG pixels per point (WordCraft's render scale). A page shows at 96/72 CSS px per point, so 2 gives 1.5 device pixels per CSS pixel. */
const SCALE = 2;
const CSS_PX_PER_POINT = 96 / 72;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

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

const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
/** A PNG's pixel size, from its IHDR. */
const pngSize = (p: Uint8Array) => {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
};

export async function wordcraftHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  await load();
  const t1 = performance.now();
  const pngs = render_docx(bytes, SCALE) as Uint8Array[];
  const pages = pngs.map((p, i) => {
    const { w, h } = pngSize(p);
    // Shown at the page's CSS size (points × 96/72), like the other engines.
    return `<img class="page" alt="Page ${i + 1}" width="${Math.round((w / SCALE) * CSS_PX_PER_POINT)}" height="${Math.round((h / SCALE) * CSS_PX_PER_POINT)}" src="data:image/png;base64,${b64(p)}" />`;
  });
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>WordCraft · server-rendered</title>
<style>html,body{margin:0}body{background:#eef1f5;padding:24px 0;display:flex;flex-direction:column;align-items:center;gap:16px}
img.page{display:block;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06);max-width:calc(100vw - 16px);height:auto}</style>
</head><body>${pages.join("\n")}</body></html>`;
  return { html, pages: pngs.length, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1) };
}
