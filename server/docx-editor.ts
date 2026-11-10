/**
 * docx-editor.dev, rendered on this server with the engine's own pieces:
 *
 *   layout  @docx-editor.dev/core/export — openFontBackedDocumentForExport, the
 *           documented "no DOM required" exporter session: real font metrics
 *           (HarfBuzz over @docx-editor.dev/fonts' metric-compatible faces),
 *           Word-style page breaks.
 *   paint   @docx-editor.dev/core/output — paintSemanticLayout, the same
 *           painter the editor uses. The layout is already final, so the painter
 *           only creates positioned elements; here it creates them in a
 *           linkedom document, and the page is that markup serialized.
 *
 * The browser receives finished pages: absolutely positioned lines and runs,
 * the editor's stylesheet, and @font-face rules for the same faces the server
 * measured with (served from jsDelivr).
 */
import { parseHTML } from "npm:linkedom@0.18.12";
import { openFontBackedDocumentForExport } from "npm:@docx-editor.dev/core@2.35.0/export";
import { packagedFonts } from "npm:@docx-editor.dev/fonts@2.35.0";

// deno-lint-ignore no-explicit-any
type Any = any;

const CORE_CDN = "https://cdn.jsdelivr.net/npm/@docx-editor.dev/core@2.35.0/dist/";
const FONT_CDN = "https://cdn.jsdelivr.net/npm/@docx-editor.dev/fonts@2.35.0/assets/";
const SCALE = 96 / 72; // points → CSS pixels at 100%

/** The packaged fonts resolve their files next to the module; fetch them from the CDN. */
const fetcher = ((u: string | URL, init?: RequestInit) => fetch(FONT_CDN + String(u).split("/").pop(), init)) as typeof fetch;

/** Word families → the packaged metric-compatible faces (as @docx-editor.dev/fonts maps them). */
const SUBSTITUTES: [string, string, string][] = [
  ["Calibri", "Carlito", "ttf"],
  ["Cambria", "Caladea", "ttf"],
  ["Times New Roman", "LiberationSerif", "ttf"],
  ["Arial", "LiberationSans", "ttf"],
  ["Courier New", "LiberationMono", "ttf"],
];
const FACES = [["Regular", 400, "normal"], ["Bold", 700, "normal"], ["Italic", 400, "italic"], ["BoldItalic", 700, "italic"]] as const;
const FONT_CSS = SUBSTITUTES.flatMap(([family, prefix, ext]) =>
  FACES.map(([suffix, weight, style]) =>
    `@font-face{font-family:"${family}";src:url("${FONT_CDN}${prefix}-${suffix}.${ext}");font-weight:${weight};font-style:${style};font-display:block}`
  )
).join("\n");

const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

let painter: Promise<Any> | undefined;

export async function docxEditorHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  // The painter module reads browser globals when it loads; it is imported
  // once, with linkedom's constructors installed (see paint below).
  painter ??= (async () => {
    const { window } = parseHTML("<!doctype html><html><body></body></html>");
    for (const k of ["HTMLElement", "Element", "Node", "Text", "DocumentFragment", "SVGElement"]) (globalThis as Any)[k] ??= (window as Any)[k];
    return (await import("npm:@docx-editor.dev/core@2.35.0/output")).paintSemanticLayout;
  })().catch((e) => {
    painter = undefined; // retried on the next request
    throw e;
  });
  const paintSemanticLayout = await painter;
  const t1 = performance.now();

  const opened: Any = await openFontBackedDocumentForExport(bytes, {
    fonts: packagedFonts({ fetcher }),
    // Faces the package has no substitute for (Georgia, Symbol, ...) are
    // measured with the engine's fallback instead of refusing the document.
    fontPolicy: "best-effort",
  } as Any);
  if (!opened.ok) throw new Error(`docx-editor.dev refused the document: ${opened.reason} ${opened.detail ?? ""}`);
  const session = opened.session;
  try {
    const layout = await session.layout();

    // Pictures: the painter asks a port for a URL per validated image; the
    // session hands out each picture's validated bytes, inlined as data: URLs.
    const images = new Map<string, Uint8Array>();
    const walk = (o: Any): void => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.resource?.kind === "ready" && o.resource.validatedHandle) {
        const b = session.validatedImageBytes(o);
        if (b) images.set(o.resource.validatedHandle.contentId, b);
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(layout.pages);
    const imageUrlPort = {
      create: (h: Any, mime: string) => {
        const b = images.get(h.contentId);
        return b ? `data:${mime};base64,${b64(b)}` : "";
      },
    };

    // Paint into a fresh linkedom document. The painter is synchronous, so the
    // global `document` it may reach for is this request's for the whole paint.
    const { document } = parseHTML(`<!doctype html><html><body><div id="pages"></div></body></html>`);
    const root: Any = document.getElementById("pages")!;
    const prev = (globalThis as Any).document;
    (globalThis as Any).document = document;
    try {
      paintSemanticLayout(root, layout, { scale: SCALE, ariaHidden: false, imageUrlPort } as Any);
    } finally {
      (globalThis as Any).document = prev;
    }
    // A viewer: drop the editor's editing furniture.
    for (const el of Array.from(root.querySelectorAll(".docx-hf-edit-hint") as Any[])) el.remove();
    for (const el of Array.from(root.querySelectorAll("[contenteditable]") as Any[])) el.removeAttribute("contenteditable");

    const pages = layout.pages.length;
    const last = layout.pages[pages - 1];
    const widthPx = Math.max(...layout.pages.map((p: Any) => p.box.width)) * SCALE;
    // Pages sit at absolute offsets; the last one's bottom is the content height.
    const tops = Array.from(root.querySelectorAll(".docx-page") as Any[]).map((p) => parseFloat(/top:\s*([\d.]+)px/.exec(p.getAttribute("style") ?? "")?.[1] ?? "0"));
    const heightPx = (tops.length ? Math.max(...tops) : 0) + last.box.height * SCALE;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>docx-editor.dev · server-rendered</title>
<link rel="stylesheet" href="${CORE_CDN}editor.css" />
<style>${FONT_CSS}
html,body{margin:0}body{background:#eef1f5;padding:24px 0}
#pages{position:relative;margin:0 auto;width:${widthPx}px;height:${heightPx}px}
.docx-page{background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06)}
</style></head><body>${root.outerHTML}</body></html>`;
    return { html, pages, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1) };
  } finally {
    session.dispose();
  }
}
