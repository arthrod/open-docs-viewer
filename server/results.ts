/**
 * Measurements shown on the landing page. Written by scripts/measure.py
 * (Playwright, fresh browser per run, a never-seen document URL per run).
 */
export interface EngineResult {
  /** Median ms from navigation to the document showing. */
  renderedMs: number | null;
  /** Every run's rendered time (null = failed). */
  runs: (number | null)[];
  /** Median bytes over the network, all frames (headers + bodies). */
  bytes: number | null;
  requests: number | null;
  /** Median JS heap across the page and its out-of-process frames. */
  heapBytes: number | null;
  /** How "rendered" was detected in the median run. */
  how: string | null;
}
export interface Results {
  measuredAt: string | null;
  environment: string;
  document: string;
  engines: Record<string, EngineResult>;
}
export const RESULTS: Results = { measuredAt: null, environment: "", document: "", engines: {} };

/**
 * Server-rendered routes (/r/<engine>), measured with plain HTTP (curl): the
 * first request to each engine right after a deploy (only the very first one
 * also paid the isolate's boot), then the median of 5 warm requests. Times
 * are wall clock from this machine; render/init come from Server-Timing.
 */
export interface ServerResult {
  slug: string;
  name: string;
  how: string;
  output: "html" | "pages" | "images" | "browser-paginated";
  firstMs: number;
  firstInitMs: number;
  firstRenderMs: number;
  warmMs: number;
  warmRenderMs: number;
  bytes: number;
}
export const SERVER_MEASURED_AT = "2026-11-09, curl from a Mac, showcase.docx (47,871 B); Docxodus and Plate re-measured after adding pagination and pictures. Docxodus times exclude its in-browser pagination (~65 ms in Chrome)";
export const SERVER_RESULTS: ServerResult[] = [
  {
    "slug": "docxodus",
    "name": "Docxodus",
    "how": "docxodus/core convertDocxToHtml in Paginated mode (.NET in wasm) here; its own paginateHtml flows it into pages in the browser",
    "output": "browser-paginated",
    "firstMs": 2231,
    "firstInitMs": 235,
    "firstRenderMs": 1103,
    "warmMs": 622,
    "warmRenderMs": 302,
    "bytes": 58818
  },
  {
    "slug": "folio",
    "name": "folio",
    "how": "@stll/folio-core headless layout → display list → its HTML backend: absolutely positioned pages",
    "output": "pages",
    "firstMs": 1556,
    "firstInitMs": 449,
    "firstRenderMs": 337,
    "warmMs": 459,
    "warmRenderMs": 157,
    "bytes": 207736
  },
  {
    "slug": "eigenpal",
    "name": "docx-editor.dev",
    "how": "@docx-editor.dev/core/export layout (HarfBuzz) → the editor's own painter into linkedom",
    "output": "pages",
    "firstMs": 1192,
    "firstInitMs": 90,
    "firstRenderMs": 859,
    "warmMs": 791,
    "warmRenderMs": 574,
    "bytes": 242255
  },
  {
    "slug": "plate",
    "name": "Plate",
    "how": "platejs/static serializeHtml (react-dom/server) after mammoth's import, pictures via @platejs/media: one flowing page",
    "output": "html",
    "firstMs": 893,
    "firstInitMs": 355,
    "firstRenderMs": 245,
    "warmMs": 448,
    "warmRenderMs": 133,
    "bytes": 31504
  },
  {
    "slug": "docen",
    "name": "docen",
    "how": "@docen/layout's paginator with a font-file measureText → SVG pages painted here (no headers/footers yet)",
    "output": "pages",
    "firstMs": 716,
    "firstInitMs": 380,
    "firstRenderMs": 136,
    "warmMs": 257,
    "warmRenderMs": 36,
    "bytes": 42737
  },
  {
    "slug": "wordcraft",
    "name": "WordCraft",
    "how": "WordCraft's reader, layout and vello_cpu rasteriser compiled to wasm: PNG page images",
    "output": "images",
    "firstMs": 1202,
    "firstInitMs": 220,
    "firstRenderMs": 656,
    "warmMs": 550,
    "warmRenderMs": 218,
    "bytes": 851493
  }
];
