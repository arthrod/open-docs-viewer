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
  /** Why a run did not render, when one did not and others did. */
  failed?: string | null;
  /** What a run that rendered then failed to read (its time is kept). */
  incomplete?: string | null;
  /** Runs whose heap could not be collected first: left out of heapBytes while any run was collected. */
  heapNotCollected?: number;
  /** When and how this engine was measured, when the file records it per engine (a partial re-run). */
  measuredAt?: string;
  environment?: string;
}
export interface Results {
  measuredAt: string | null;
  environment: string;
  document: string;
  engines: Record<string, EngineResult>;
}
import BUNDLED from "../results/browser.json" with { type: "json" };
import SERVER_BUNDLED from "../results/server.json" with { type: "json" };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The cold browser benchmark lives in results/browser.json, written by
 * scripts/measure.py --results (locally via scripts/remeasure.sh, or by the
 * "Re-measure" GitHub workflow, which commits it). The landing reads the
 * latest committed copy from GitHub (5-minute cache), so a refresh shows up
 * without redeploying; the copy bundled with this deploy is the fallback.
 */
export const RESULTS: Results = BUNDLED as Results;
export const RESULTS_URL = "https://raw.githubusercontent.com/arthrod/open-docs-viewer/main/results/browser.json";
const RESULTS_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; results: Results } | undefined;
let pending: Promise<Results> | undefined;

/** The published results: GitHub's copy when it can be had and has the shape the page renders, else the bundled one. */
export function currentResults(): Promise<Results> {
  if (cached && Date.now() - cached.at < RESULTS_TTL_MS) return Promise.resolve(cached.results);
  // Requests that arrive together share one fetch, and none of them waits for it: the page is
  // answered with what is held (the last fetched file, or the bundled one, itself a real
  // measurement), and the next request gets the fetched file. Waiting cost the landing up to
  // four seconds whenever GitHub was slow.
  pending ??= fetchResults().finally(() => (pending = undefined));
  pending.catch(() => {});
  return Promise.resolve(cached?.results ?? RESULTS);
}

/** Forget what was fetched, as a fresh isolate would start (tests). */
export function forgetResults() {
  cached = undefined;
  pending = undefined;
}

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

async function fetchResults(): Promise<Results> {
  let results = RESULTS;
  try {
    const res = await fetch(RESULTS_URL, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json: unknown = await res.json();
      // Only take it if it has the shape the page renders: a dated file with at least one engine.
      if (isRecord(json) && typeof json.measuredAt === "string" && isRecord(json.engines) && Object.keys(json.engines).length > 0) results = json as unknown as Results;
    } else {
      await res.body?.cancel();
    }
  } catch {
    // GitHub unreachable or slow, or not JSON: the bundled copy is still a real measurement.
  }
  cached = { at: Date.now(), results };
  return results;
}

/** KPI strip for the landing hero (cold benchmark + harness facts). */
export function landingStatItems(
  engineCount: number,
  openCount: number,
  serverRouteCount: number,
  results: Results,
): { value: string; label: string }[] {
  const measured = results.measuredAt
    ? results.measuredAt.replace(/T.*/, "").slice(0, 10)
    : "pending";
  return [
    { value: String(engineCount), label: "Engines · same document URL and harness" },
    { value: String(openCount), label: "Open source · rendered in your browser" },
    { value: String(engineCount - openCount), label: "Proprietary · vendor servers or trial mode" },
    { value: measured, label: `Cold browser table · last run (${serverRouteCount} also on server)` },
  ];
}

export function statStripHtml(items: { value: string; label: string }[]): string {
  return `<ul class="stats is-kpi odv-stats">${
    items.map((i) => `<li class="stat"><b>${esc(i.value)}</b><span>${esc(i.label)}</span></li>`).join("")
  }</ul>`;
}

/**
 * Server-rendered routes (/r/<engine>), measured with plain HTTP (curl) by
 * scripts/measure_server.py --first-warm, which writes results/server.json:
 * the first request to each engine right after a deploy (only the very first
 * one also paid the isolate's boot), then the median of the warm requests.
 * Times are wall clock from the measuring machine; render/init come from
 * Server-Timing.
 */
export interface ServerResult {
  slug: string;
  name: string;
  how: string;
  output: "html" | "pages" | "images" | "browser-paginated";
  /** The first request to the route after a deploy. */
  firstMs: number | null;
  firstInitMs: number | null;
  firstRenderMs: number | null;
  /** False when that request found the engine already loaded (init 0): it was not a first request. */
  firstCold?: boolean;
  /** Median of the warm requests. */
  warmMs: number | null;
  warmRenderMs: number | null;
  bytes: number | null;
  /** Every warm request's total time (null = it failed). */
  warmRuns?: (number | null)[];
  /** How many warm requests reached a process that had not loaded the engine: listed, not in the medians. */
  warmColdRuns?: number;
  /** A failed request's error. */
  error?: string;
  /** When this route was measured, when the file records it per route. */
  measuredAt?: string;
  environment?: string;
}
/** The engines with a server route: what runs, and what the browser is sent. */
export const SERVER_ROUTES: Pick<ServerResult, "slug" | "name" | "how" | "output">[] = [
  {
    "slug": "docxodus",
    "name": "Docxodus",
    "how": "docxodus/core convertDocxToHtml in Paginated mode (.NET in wasm) here; its own paginateHtml flows it into pages in the browser",
    "output": "browser-paginated"
  },
  {
    "slug": "folio",
    "name": "folio",
    "how": "@stll/folio-core headless layout \u2192 display list \u2192 its HTML backend: absolutely positioned pages",
    "output": "pages"
  },
  {
    "slug": "eigenpal",
    "name": "docx-editor.dev",
    "how": "@docx-editor.dev/core/export layout (HarfBuzz) \u2192 the editor's own painter into linkedom",
    "output": "pages"
  },
  {
    "slug": "plate",
    "name": "Plate",
    "how": "platejs/static serializeHtml (react-dom/server) after mammoth's import, pictures via @platejs/media: one flowing page",
    "output": "html"
  },
  {
    "slug": "docen",
    "name": "docen",
    "how": "@docen/layout's paginator with a font-file measureText \u2192 SVG pages painted here (no headers/footers yet)",
    "output": "pages"
  },
  {
    "slug": "wordcraft",
    "name": "WordCraft",
    "how": "WordCraft's reader, layout and vello_cpu rasteriser compiled to wasm. The page holds each page's size and one image URL per page; a PNG is rasterised (about 0.2 s) when the browser asks for it, as its page nears the viewport. Render and Sent are the page without its images (measured 2026-11-16)",
    "output": "images"
  },
  {
    "slug": "superdoc",
    "name": "SuperDoc",
    "how": "@superdoc/docx-engine headless runtime \u2192 Document API projectHtml (redline mode): semantic HTML, not its paginated view; no colours, pictures as placeholders",
    "output": "html"
  },
  {
    "slug": "opendoc",
    "name": "OpenDoc",
    "how": "CasualOffice's Viewer SDK (@casualoffice/opendoc-viewer 0.1.0-alpha.1): OpenDoc's reader, pagination and rasteriser in wasm, an older build than the application the browser page shows. The page holds each page's size and one image URL per page; a PNG is rasterised when the browser asks for it. Render and Sent are the page without its images",
    "output": "images"
  },
  {
    "slug": "betteroffice",
    "name": "BetterOffice",
    "how": "@betteroffice/docx's headless layout and its own page painter, drawing on a canvas of ours that writes SVG (it publishes no surface but a browser canvas). The page holds each page's size and one image URL per page; an SVG is drawn when the browser asks for it. Render and Sent are the page without its images",
    "output": "images"
  },
  {
    "slug": "office-open",
    "name": "office-open",
    "how": "@office-open/docx 0.15.3 `parseDocument`, drawn as an outline by the same code as its page on editors.benchmarks.law. The library has no renderer: there is no layout and there are no pages",
    "output": "html"
  },
  {
    "slug": "fidus-writer",
    "name": "Fidus Writer",
    "how": "@fiduswriter/document 0.3.40: its DocxConvert importer, then its own schema's toDOM rules run by ProseMirror's DOMSerializer into a linkedom document. One flowing page, as in its editor; the words inside tracked changes are left out, as there",
    "output": "html"
  },
  {
    "slug": "docs-plus",
    "name": "docs.plus",
    "how": "docs.plus's own server conversion code at a9b0c69 (importDocx: mammoth into its Tiptap document), then its render schema run by ProseMirror's DOMSerializer into a linkedom document. One flowing page; pictures are inlined",
    "output": "html"
  }
];

/** The file scripts/measure_server.py --first-warm writes. */
export interface ServerMeasurements {
  measuredAt: string | null;
  environment: string;
  document?: string;
  engines: Record<string, Partial<Pick<ServerResult, "firstMs" | "firstInitMs" | "firstRenderMs" | "firstCold" | "warmMs" | "warmRenderMs" | "bytes" | "warmRuns" | "warmColdRuns" | "error">>>;
}
const SERVER_FILE = SERVER_BUNDLED as ServerMeasurements;
const NO_FIGURES = { firstMs: null, firstInitMs: null, firstRenderMs: null, warmMs: null, warmRenderMs: null, bytes: null };

/** Each route with its figures from results/server.json; a route the file does not hold has none. */
export const serverResults = (file: ServerMeasurements = SERVER_FILE): ServerResult[] =>
  SERVER_ROUTES.map((r) => ({ ...r, ...NO_FIGURES, ...(file.engines?.[r.slug] ?? {}) }));
export const SERVER_RESULTS: ServerResult[] = serverResults();
/** The heading of that file: a row measured on another day says so. */
export const SERVER_FILE_HEAD = { measuredAt: SERVER_FILE.measuredAt };
export const SERVER_MEASURED_AT = [SERVER_FILE.measuredAt, SERVER_FILE.environment, SERVER_FILE.document].filter(Boolean).join(", ");
