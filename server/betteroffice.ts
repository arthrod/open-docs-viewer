/**
 * BetterOffice, rendered on this server.
 *
 * What is BetterOffice's: reading the .docx, shaping and measuring the text,
 * breaking lines and pages, the list of what to draw on each page (its display
 * list), and the painter that draws that list (`drawDisplayPage`, the one its
 * editor draws its pages with). What is ours: the surface the painter draws
 * on. BetterOffice publishes one painter and it draws on a browser canvas;
 * there is no canvas here, so it is handed a canvas that writes SVG
 * (server/svg-canvas.ts) and the page is that SVG. No pixel is decided here,
 * and none is made here either: the reader's browser rasterises the SVG.
 *
 * `@betteroffice/docx@0.5.1` (Apache-2.0), headless, as its own
 * `exportDocxStructuredWithPages` runs it: a session of its Rust engine in
 * WebAssembly (`createYrsSession`), its layout request for the opened
 * document, its font resolution (`createRustMeasureSource`) over its bundled
 * metric-compatible faces (`@betteroffice/fonts@0.4.2`: Carlito for Calibri,
 * Liberation for Arial, Times New Roman and Courier New, Gelasio for Georgia).
 * The display list is built a page at a time, when the browser asks for that
 * page (`buildDisplayPagesFrame`, as its editor does for the pages in view):
 * the list of all 500 pages of the long sample at once ends the engine
 * ("RuntimeError: unreachable", 3.9 GB, measured 2026-11-21).
 *
 * Pages are sent the way WordCraft's are (server/page-images.ts): the page
 * holds every page's size and one image URL each, and a page is drawn when the
 * browser asks for its image.
 *
 * Its files are loaded from jsDelivr's copy of the npm packages, by address:
 * the layout request builder and the page-at-a-time display calls are in the
 * package and not among its documented entry points. The engine (24.4 MB,
 * 6.3 MB compressed) is fetched once per isolate and checked against its
 * SHA-256 before it is compiled.
 *
 * One more thing is done here. The engine hands most text to the painter as
 * positioned glyph outlines, and some as text for the canvas to draw in a
 * named font: list numbers and bullets, small capitals, tab leaders. An SVG
 * shown as an image cannot load a font, so that text is turned into outlines
 * here (opentype.js) from the same bundled face the engine measured it with,
 * each glyph at its advance; a small capital is the capital at 0.8 of the
 * size, which is the width the engine gave it. A character that face has no
 * glyph for stays text, drawn by the reader's browser in a font of its own.
 *
 * Known limits. A picture that is not a raster image (EMF, WMF, SVG) is not
 * drawn. Fonts embedded in the document are not read.
 */
import { type LaidDocument, pageImages, sha256 } from "./page-images.ts";
import opentype from "npm:opentype.js@1.3.4";
import { type CanvasFont, imageSize, type OutlinedGlyph, SvgCanvas, type SvgImage, SvgPath } from "./svg-canvas.ts";

const DOCX = "https://cdn.jsdelivr.net/npm/@betteroffice/docx@0.5.1/dist/";
const FONTS = "https://cdn.jsdelivr.net/npm/@betteroffice/fonts@0.4.2/dist/index.js";
const WASM_SHA256 = "ff775228796835f0007a20742c67b5926e1e3f1f12d23e69fc295f7ff9511431";

// deno-lint-ignore no-explicit-any
type Any = any;
/** The parts of the two packages this route calls. */
let bo: {
  createYrsSession: (o: { clientId: number }) => Promise<Any>;
  buildResidentRegionLayoutRequest: (document: Any, pageGap: number, renderEnv: Any) => Any;
  createRustMeasureSource: (o: { engine: Any; bundled: Any }) => Any;
  decodeFrameDelta: (bytes: Uint8Array) => Any;
  applyFrameDelta: (previous: Any, delta: Any) => Any;
  drawDisplayPage: (ctx: Any, page: Any, options: Any) => Promise<void>;
  GlyphCache: new (o: Any) => Any;
  /** The bundled faces, fetched from the fonts package's files as documents need them. */
  fonts: Any;
  /** The fonts package: which bundled face stands in for a family, and its bytes. */
  bundled: Any;
} | undefined;

async function load() {
  // By address, and not as literals: the type-check of this Val does not download the engine's sixty files.
  const at = (path: string) => import(DOCX + path);
  const [yrs, editor, layout, render, fonts, wasmEdit, wasm] = await Promise.all([
    at("yrs/index.mjs"),
    at("editor/index.mjs"),
    at("layout/index.mjs"),
    at("layout/render/index.mjs"),
    import(FONTS),
    at("wasm-edit.mjs"),
    fetch(`${DOCX}generated/edit/docx_edit_bg.wasm`, { signal: AbortSignal.timeout(30_000) }).then((res) => {
      if (!res.ok) throw new Error(`BetterOffice wasm: HTTP ${res.status}`);
      return res.arrayBuffer();
    }),
  ]);
  const got = await sha256(wasm);
  if (got !== WASM_SHA256) throw new Error(`BetterOffice wasm: SHA-256 ${got}, expected ${WASM_SHA256}`);
  // Handed to the package's own loader, which would otherwise fetch the same file unchecked.
  await wasmEdit.preloadEditWasmFrom(WebAssembly.compile(wasm));
  bo = {
    createYrsSession: yrs.createYrsSession,
    buildResidentRegionLayoutRequest: editor.buildResidentRegionLayoutRequest,
    createRustMeasureSource: layout.createRustMeasureSource,
    decodeFrameDelta: render.decodeFrameDelta,
    applyFrameDelta: render.applyFrameDelta,
    drawDisplayPage: render.drawDisplayPage,
    GlyphCache: render.GlyphCache,
    fonts: fonts.createFontProvider(),
    bundled: fonts,
  };
}

/** A bundled face read for its outlines, and the outline of each glyph asked for so far. */
type Face = { font: Any; paths: Map<number, SvgPath | null> };
/** By the face's file in the fonts package. */
const faceFiles = new Map<string, Promise<Face>>();
/** By family, weight and style as a canvas font names them; null when the family has no bundled face that loads. */
const faces = new Map<string, Face | null>();
const faceKey = (f: CanvasFont) => `${f.family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase()}|${+f.bold}|${+f.italic}`;

/** Load the face the engine measured `key`'s family with: its metric-compatible stand-in, else the last resort it falls back to. */
async function loadFace(key: string) {
  const [family, bold, italic] = key.split("|");
  try {
    const face = bo!.bundled.resolveMetricCompatFace(family, bold === "1", italic === "1") ?? bo!.bundled.resolveLastResortFace(family, bold === "1", italic === "1", "word");
    let file = faceFiles.get(face.file);
    if (!file) {
      file = (async () => ({ font: opentype.parse(await bo!.bundled.loadBundledFontBytes(face)), paths: new Map() }))();
      file.catch(() => faceFiles.delete(face.file));
      faceFiles.set(face.file, file);
    }
    faces.set(key, await file);
  } catch (err) {
    console.error("betteroffice: no outlines for", JSON.stringify(key), err);
    faces.set(key, null); // its text stays text
  }
}

function glyphPath(face: Face, glyph: Any): SvgPath | null {
  let path = face.paths.get(glyph.index);
  if (path === undefined) {
    const commands: Any[] = glyph.path?.commands ?? [];
    path = commands.length ? new SvgPath() : null;
    for (const c of commands) {
      if (c.type === "M") path!.moveTo(c.x, c.y);
      else if (c.type === "L") path!.lineTo(c.x, c.y);
      else if (c.type === "Q") path!.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
      else if (c.type === "C") path!.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.type === "Z") path!.closePath();
    }
    face.paths.set(glyph.index, path);
  }
  return path;
}

/** The size of a small capital against the font size: the engine's own (the widths it lays them out with are the capitals' × 0.8). */
const SMALL_CAP = 0.8;

/**
 * The outlines of text the painter hands the canvas as text. `missing` collects
 * the faces not loaded yet: the page is drawn again when they are.
 */
function outliner(missing: Set<string>) {
  return (text: string, font: CanvasFont) => {
    const key = faceKey(font);
    const face = faces.get(key);
    if (face === undefined) missing.add(key);
    if (!face) return null;
    const glyphs: OutlinedGlyph[] = [];
    for (const ch of text) {
      const small = font.smallCaps && ch !== ch.toUpperCase() && [...ch.toUpperCase()].length === 1;
      const glyph = face.font.charToGlyph(small ? ch.toUpperCase() : ch);
      // No glyph in this face (its .notdef would be drawn): left to the reader's browser.
      if (!glyph || (glyph.index === 0 && !/\s/.test(ch))) return null;
      glyphs.push({ path: glyphPath(face, glyph), advance: glyph.advanceWidth ?? 0, ...(small ? { scale: SMALL_CAP } : {}) });
    }
    return { unitsPerEm: face.font.unitsPerEm, glyphs };
  };
}

/** The header and footer parts of a layout reply, without parsing the layout before them (10 MB of JSON for 500 pages). */
export function headersFootersOf(layoutJson: string): unknown {
  const from = layoutJson.lastIndexOf(',"headersFooters":'), to = layoutJson.lastIndexOf(',"notesConverged":');
  if (from > 0 && to > from) {
    try {
      return JSON.parse(layoutJson.slice(from + 18, to));
    } catch { /* not where they were expected: read the whole reply */ }
  }
  return JSON.parse(layoutJson).headersFooters;
}

const RASTER = /^image\/(png|jpeg|gif|webp|bmp)$/;
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function open(bytes: Uint8Array): Promise<LaidDocument> {
  const e = bo!;
  const session = await e.createYrsSession({ clientId: 1 });
  try {
    const { document } = session.openDocx(bytes, true);
    const settings = document.package.settings;
    // The render environment of the package's own headless export.
    const request = e.buildResidentRegionLayoutRequest(document, 0, {
      themeColors: Object.fromEntries(Object.entries(document.package.theme?.colorScheme ?? {}).filter(([, v]) => typeof v === "string")),
      defaultTabStopTwips: settings?.defaultTabStop ?? null,
      numericIds: {},
      showHiddenText: false,
    });
    const measure = e.createRustMeasureSource({ engine: session, bundled: e.fonts });
    measure.setCompat(settings?.compatibilityFlags);
    const compat = { noLeading: settings?.compatibilityFlags?.noLeading ?? false, doNotExpandShiftReturn: settings?.compatibilityFlags?.doNotExpandShiftReturn ?? false };
    request.measurement = { fontChains: {}, defaults: { fontSize: 11, fontFamily: "Calibri" }, compat, authoritativeShaping: true };
    const needs = JSON.parse(session.layoutFontRequirementsJson(JSON.stringify(request)));
    await measure.prepareFontRequirements(needs);
    const measurement = measure.measurementConfigForRequirements(needs);
    if (!measurement) throw new Error("no font could be loaded for this document");
    request.measurement = measurement;
    const headersFooters = headersFootersOf(session.layoutDocumentWithRegionsRetainedJson(JSON.stringify(request)));

    // No page's content is built yet: each is, when it is asked for, and released when it has been drawn.
    session.setDisplayWindow(0, 0);
    session.setDisplayRetainBuiltPages(false);
    const frameOf = (previous: Any, bytes: Uint8Array) => e.applyFrameDelta(previous, e.decodeFrameDelta(bytes));
    let frame = frameOf(null, session.buildDisplayListFrame(JSON.stringify({ fontChains: measurement.fontChains, ...(headersFooters ? { headersFooters } : {}) }), 0));
    const glyphs = new e.GlyphCache({ provider: (fontId: number, glyphId: number) => session.outlineGlyphJson(fontId, glyphId), createPath: () => new SvgPath(), maxEntries: 16_384 });

    const images = new Map<string, SvgImage | null>();
    /** The picture a display-list image names: inline already, or a part of the package the session reads. */
    const resolveImage = (source: string): SvgImage | null => {
      let hit = images.get(source);
      if (hit === undefined) {
        let href = source;
        if (!source.startsWith("data:")) {
          const media = session.mediaSource(source);
          href = media && RASTER.test(media.mimeType) ? `data:${media.mimeType};base64,${base64(media.bytes)}` : "";
        }
        hit = href ? { href, ...imageSize(href) } : null;
        images.set(source, hit);
      }
      return hit;
    };

    const encoder = new TextEncoder();
    let turn: Promise<unknown> = Promise.resolve();
    const draw = async (index: number): Promise<Uint8Array> => {
      const unbuilt = frame.pages[index].page.unbuilt;
      if (unbuilt) frame = frameOf(frame, session.buildDisplayPagesFrame([index], frame.frameEpoch));
      try {
        const page = frame.pages[index].page;
        for (;;) {
          const missing = new Set<string>();
          const canvas = new SvgCanvas(page.width, page.height, outliner(missing));
          await e.drawDisplayPage(canvas, page, { glyphCache: glyphs, resolveImage });
          if (!missing.size) return encoder.encode(canvas.toSvg());
          // Text in a face not read yet: read it (once per isolate) and draw the page again.
          await Promise.all([...missing].map(loadFace));
        }
      } finally {
        const released = session.releaseDisplayPagesFrame([index], frame.frameEpoch);
        if (released) frame = frameOf(frame, released);
      }
    };
    return {
      sizes: frame.pages.flatMap((p: Any) => [p.page.width, p.page.height]),
      // One page at a time: building a page changes the frame the next one is built from.
      page: (index) => {
        const next = turn.then(() => draw(index));
        turn = next.catch(() => {});
        return next;
      },
      free: () => session.destroy(),
    };
  } catch (err) {
    session.destroy();
    throw err;
  }
}

const route = pageImages({
  slug: "betteroffice",
  name: "BetterOffice",
  contentType: "image/svg+xml",
  densities: ["1"], // a vector image is sharp at any density
  load,
  open,
  // The 500-page sample's layout holds 504 MB of the engine's memory until it is freed (measured 2026-11-21): one is kept.
  keep: 1,
});

export const betterofficeHtml = route.html;
export const betterofficePage = route.page;
/** For the tests. */
export const betterofficeForget = route.forget;
