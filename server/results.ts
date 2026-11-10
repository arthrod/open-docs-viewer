/**
 * Measurements shown on the landing page, from scripts/measure.py: the
 * installed Google Chrome (headed) driven by Playwright, a fresh profile per
 * run (cold cache), a never-seen document URL per run.
 */
export interface EngineResult {
  /** Median ms from navigation to the document showing. */
  renderedMs: number | null;
  /** Every run's rendered time (null = failed). */
  runs: (number | null)[];
  /** Median bytes over the network, all frames (headers + bodies). */
  bytes: number | null;
  requests: number | null;
  /** Median JS heap of the top page; cross-origin frames (Microsoft, Google) are not included. */
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
export const RESULTS: Results = {
  "measuredAt": "2026-11-09",
  "environment": "Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Mac",
  "document": "showcase.docx (47,871 B) with a never-seen ?n= per run",
  "engines": {
    "apryse": {
      "renderedMs": 3477,
      "runs": [
        3477,
        3123,
        5282
      ],
      "bytes": 7296801,
      "requests": 158,
      "heapBytes": 21651080,
      "how": "data-od-rendered"
    },
    "canvas-editor": {
      "renderedMs": 963,
      "runs": [
        963,
        970,
        824
      ],
      "bytes": 609607,
      "requests": 24,
      "heapBytes": 9690980,
      "how": "data-od-rendered"
    },
    "docen": {
      "renderedMs": 1408,
      "runs": [
        1672,
        1356,
        1408
      ],
      "bytes": 1456529,
      "requests": 327,
      "heapBytes": 32098880,
      "how": "data-od-rendered"
    },
    "docxodus": {
      "renderedMs": 2816,
      "runs": [
        2816,
        3308,
        2042
      ],
      "bytes": 8100439,
      "requests": 58,
      "heapBytes": 8408300,
      "how": "data-od-rendered"
    },
    "eigenpal": {
      "renderedMs": 1197,
      "runs": [
        1197,
        1584,
        971
      ],
      "bytes": 5294825,
      "requests": 200,
      "heapBytes": 32266276,
      "how": "data-od-rendered"
    },
    "folio": {
      "renderedMs": 1124,
      "runs": [
        2279,
        1081,
        1124
      ],
      "bytes": 2193101,
      "requests": 78,
      "heapBytes": 21732176,
      "how": "data-od-rendered"
    },
    "google-viewer": {
      "renderedMs": 20838,
      "runs": [
        20927,
        808,
        20838
      ],
      "bytes": 1134168,
      "requests": 27,
      "heapBytes": 2143616,
      "how": "frame load event (cross-origin: the page cannot see when the vendor finished rendering); google-viewer: 2 of 3 runs needed the 20 s retry"
    },
    "nutrient": {
      "renderedMs": 4084,
      "runs": [
        4168,
        3332,
        4084
      ],
      "bytes": 25538995,
      "requests": 98,
      "heapBytes": 22391244,
      "how": "data-od-rendered"
    },
    "plate": {
      "renderedMs": 1394,
      "runs": [
        1394,
        1095,
        1522
      ],
      "bytes": 1079773,
      "requests": 429,
      "heapBytes": 26428324,
      "how": "data-od-rendered"
    },
    "superdoc": {
      "renderedMs": 2656,
      "runs": [
        3660,
        2656,
        2473
      ],
      "bytes": 9077099,
      "requests": 24,
      "heapBytes": 18602632,
      "how": "data-od-rendered"
    },
    "word-online": {
      "renderedMs": 769,
      "runs": [
        769,
        584,
        785
      ],
      "bytes": 1701729,
      "requests": 66,
      "heapBytes": 1758268,
      "how": "frame load event (cross-origin: the page cannot see when the vendor finished rendering); google-viewer: 2 of 3 runs needed the 20 s retry"
    },
    "wordcraft": {
      "renderedMs": 1675,
      "runs": [
        1675,
        1555,
        2743
      ],
      "bytes": 22699273,
      "requests": 19,
      "heapBytes": 3199356,
      "how": "data-od-rendered"
    }
  }
};

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
