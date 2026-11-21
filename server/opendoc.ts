/**
 * OpenDoc, rendered on this server: CasualOffice's Viewer SDK
 * (`@casualoffice/opendoc-viewer`, Apache-2.0, a pre-release), which is
 * OpenDoc's own .docx reader, pagination and rasteriser compiled to
 * WebAssembly with no editing code in it. Pages are PNGs the engine draws
 * (`renderPagePng`), sent the way WordCraft's are: the page holds every page's
 * size and one image URL each, and a page is rasterised when the browser asks
 * for its image (server/page-images.ts).
 *
 * Not the build the browser page shows: `/v/opendoc` runs OpenDoc's editor
 * application from its site, a snapshot of 2026-11-05; the only Viewer SDK on
 * npm is 0.1.0-alpha.1 of 2026-10-24, built from an older commit.
 *
 * The module (11.2 MB) is fetched once per isolate from jsDelivr's copy of the
 * npm package and checked against its SHA-256 before it is instantiated.
 *
 * Fonts. The module embeds one family, Liberation Sans. The package's
 * `pkg/fonts/` (the faces its README tells the host to serve) is named in its
 * `files` and is not in the published tarball, so the same faces are fetched
 * from OpenDoc's repository at the commit the package was published from,
 * which is where its build copies them from. The three families Word's
 * default fonts fall back to (Carlito for Calibri, Liberation Serif for Times
 * New Roman and Georgia, Liberation Mono for Courier New) are registered
 * before the first layout, so a document is paginated once. A document that
 * needs one of the other three (Caladea, Roboto, Noto Emoji) is laid out a
 * second time with it, through the package's own font hook.
 */
import { openDocument } from "npm:@casualoffice/opendoc-viewer@0.1.0-alpha.1";
import { type LaidDocument, pageImages, sha256 } from "./page-images.ts";

const VERSION = "0.1.0-alpha.1";
const WASM = `https://cdn.jsdelivr.net/npm/@casualoffice/opendoc-viewer@${VERSION}/pkg/opendoc_viewer_bg.wasm`;
const WASM_SHA256 = "7ddd460569e9ebb4249539561c6043efb46d7088ebd1f30667234b1215b22400";
/** "Publish npm pre-releases by hand" (#882), 2026-10-23: the commit 0.1.0-alpha.1 was published from. */
const FONTS_COMMIT = "331781bfce67bcc38af91a0d0f21505ce47751fc";
const FONTS = `https://raw.githubusercontent.com/CasualOffice/opendoc/${FONTS_COMMIT}/crates/casual-doc-layout/fonts/`;
const FOUR = ["Regular", "Bold", "Italic", "BoldItalic"];
/** The faces the package's build copies into `pkg/fonts/`, by the family name the engine asks for. */
const FACES: Record<string, string[]> = {
  "Carlito": FOUR.map((s) => `Carlito-${s}.ttf`),
  "Liberation Serif": FOUR.map((s) => `liberation/LiberationSerif-${s}.ttf`),
  "Liberation Mono": FOUR.map((s) => `liberation/LiberationMono-${s}.ttf`),
  "Caladea": FOUR.map((s) => `Caladea-${s}.ttf`),
  "Roboto": FOUR.map((s) => `Roboto-${s}.ttf`),
  "Noto Emoji": ["NotoEmoji-Variable.ttf"],
};
/** Registered before the first layout: what Calibri, Times New Roman, Georgia and Courier New are drawn in. */
const PRELOADED = ["Carlito", "Liberation Serif", "Liberation Mono"];
/** CSS pixels per twip: a twip is 1/20 point, a point 96/72 CSS pixels. */
const PX_PER_TWIP = 96 / 72 / 20;

const families = new Map<string, Promise<Uint8Array<ArrayBuffer>[]>>();
/** A family's faces, fetched once per isolate; a failed fetch is tried again by the next document. */
function family(name: string): Promise<Uint8Array<ArrayBuffer>[]> {
  let got = families.get(name);
  if (!got) {
    got = Promise.all(FACES[name].map(async (file) => {
      const res = await fetch(FONTS + file, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`OpenDoc font ${file}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }));
    got.catch(() => families.delete(name));
    families.set(name, got);
  }
  return got;
}

let wasm: ArrayBuffer | undefined;
async function load() {
  const [res] = await Promise.all([fetch(WASM, { signal: AbortSignal.timeout(30_000) }), ...PRELOADED.map(family)]);
  if (!res.ok) throw new Error(`OpenDoc wasm: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const got = await sha256(bytes);
  if (got !== WASM_SHA256) throw new Error(`OpenDoc wasm: SHA-256 ${got}, expected ${WASM_SHA256}`);
  wasm = bytes;
}

type FontNeed = { requested: string; substitute: string | null; substituteAvailable: boolean };

async function open(bytes: Uint8Array): Promise<LaidDocument & { fontNeeds: FontNeed[] }> {
  const doc = await openDocument(bytes as Uint8Array<ArrayBuffer>, {
    wasm, // used by the first document only: the package instantiates the module once
    fonts: (await Promise.all(PRELOADED.map(family))).flat() as Uint8Array<ArrayBuffer>[],
    // Asked once per font the first layout needed and did not have.
    fontProvider: (need: FontNeed) => (need.substitute && !need.substituteAvailable && need.substitute in FACES ? family(need.substitute) : null),
  });
  return {
    sizes: Array.from(doc.pageSizes(), (s) => [s.widthTwips * PX_PER_TWIP, s.heightTwips * PX_PER_TWIP]).flat(),
    page: (index, density) => doc.renderPagePng(index, { dpi: 96 * density }),
    free: () => doc.free(),
    fontNeeds: doc.fontNeeds(),
  };
}

const route = pageImages({
  slug: "opendoc",
  name: "OpenDoc",
  contentType: "image/png",
  // 1 is one pixel per CSS pixel; 1.5 is 2 pixels per point, for denser screens.
  densities: ["1", "1.5"],
  load,
  open,
});

export const opendocHtml = route.html;
export const opendocPage = route.page;
/** For the tests. */
export const opendocForget = route.forget;
/** The fonts a document asks for and what each is drawn in (tests, and a check by hand). */
export async function opendocFontNeeds(bytes: Uint8Array): Promise<FontNeed[]> {
  if (!wasm) await load();
  const doc = await open(bytes);
  doc.free();
  return doc.fontNeeds;
}
