/**
 * folio, rendered on this server: @stll/folio-core lays the document out
 * headlessly (its own measurer over real font binaries, no DOM, no canvas),
 * builds the display list its PDF writer and DOM painter both paint, and its
 * HTML backend writes the pages as absolutely positioned markup.
 *
 * Fonts: @stll/folio-fonts ships the metric-compatible faces folio measures
 * with (Carlito for Calibri, Tinos for Times New Roman, ...). Val Town has no
 * filesystem, so this module fetches them from jsDelivr once per isolate. The
 * browser gets @font-face rules pointing at the same CDN files, so it paints
 * with exactly the binaries the server measured with.
 */
import { createFontsourceFaces } from "npm:@stll/folio-core@0.67.0/fonts/fontsourceFaces";
import { buildDocxDisplayList } from "npm:@stll/folio-core@0.67.0/export-pdf";
import { renderDisplayListToHtml } from "npm:@stll/folio-core@0.67.0/display-list/html/renderDisplayListToHtml";
import { FOLIO_FONT_FILES } from "npm:@stll/folio-fonts@0.1.0";

const FONT_CDN = "https://cdn.jsdelivr.net/npm/@stll/folio-fonts@0.1.0/fonts/";

type Faces = ReturnType<typeof createFontsourceFaces>;

/**
 * The measured faces (.woff, latin/latin-ext/arabic) and each family's
 * unicode.json, fetched in parallel. createFontsourceFaces reads
 * synchronously, so everything it may ask for is fetched up front.
 */
async function loadFaces(): Promise<{ faces: Faces; css: string }> {
  const wanted = (FOLIO_FONT_FILES as readonly string[]).filter((f) => /\.(woff|json)$/.test(f));
  const files = new Map<string, Uint8Array>();
  await Promise.all(wanted.map(async (f) => {
    const path = f.replace(/^fonts\//, "");
    const res = await fetch(FONT_CDN + path);
    if (!res.ok) throw new Error(`font ${path}: HTTP ${res.status}`);
    files.set(path, new Uint8Array(await res.arrayBuffer()));
  }));
  const faces = createFontsourceFaces({ read: (pkg, rel) => files.get(`${pkg}/${rel}`) ?? null });

  // folio's fontFaceCss inlines every subset as a data: URL (9 MB for the
  // sample). A second, marker-backed reader hands back each font file's own
  // path instead of its bytes, so every data: URL decodes to the file it
  // stands for and is swapped for that file's CDN URL. unicode.json stays
  // real: the rules' unicode-range comes from it.
  const te = new TextEncoder();
  const marker = createFontsourceFaces({
    read: (pkg, rel) => (rel === "unicode.json" ? files.get(`${pkg}/${rel}`) ?? null : te.encode(`@@${pkg}/${rel}`)),
  });
  const families = ["Calibri", "Cambria", "Arial", "Times New Roman", "Courier New", "Aptos", "Aptos Display", "Segoe UI", "Consolas"];
  const css = marker.fontFaceCss({ families }).replace(
    /url\("?data:[^;]+;base64,([A-Za-z0-9+/=]+)"?\)/g,
    (m, b64: string) => {
      const s = atob(b64);
      return s.startsWith("@@") ? `url("${FONT_CDN}${s.slice(2)}")` : m;
    },
  );
  return { faces, css };
}

let loaded: Promise<{ faces: Faces; css: string }> | undefined;

export async function folioHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  loaded ??= loadFaces().catch((e) => {
    loaded = undefined; // a failed font fetch is retried on the next request
    throw e;
  });
  const { faces, css } = await loaded;
  const t1 = performance.now();
  const built = await buildDocxDisplayList(bytes, { fonts: faces.source });
  if (built.isErr()) throw built.error;
  const { list, layoutGaps, measurementSubstitutions } = built.value;
  const html = renderDisplayListToHtml(list, { fontFaceCss: css, pageGapPx: 16, canvasColor: "#eef1f5" });
  return {
    html,
    pages: list.pages.length,
    gaps: layoutGaps.length,
    substitutions: measurementSubstitutions.length,
    initMs: Math.round(t1 - t0),
    renderMs: Math.round(performance.now() - t1),
  };
}
