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
import BUNDLED from "../results/browser.json" with { type: "json" };

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

export async function currentResults(): Promise<Results> {
  if (cached && Date.now() - cached.at < RESULTS_TTL_MS) return cached.results;
  let results = RESULTS;
  try {
    const res = await fetch(RESULTS_URL, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json = await res.json() as Results;
      // Only take it if it has the shape the page renders.
      if (json && typeof json === "object" && json.engines && typeof json.engines === "object") results = json;
    } else {
      await res.body?.cancel();
    }
  } catch {
    // GitHub unreachable or slow: the bundled copy is still a real measurement.
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
export const SERVER_MEASURED_AT =
  "2026-11-09, curl from a Mac, showcase.docx (47,871 B); Docxodus and Plate re-measured after adding pagination and pictures. Docxodus times exclude its in-browser pagination (~65 ms in Chrome)";
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
    "bytes": 58818,
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
    "bytes": 207736,
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
    "bytes": 242255,
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
    "bytes": 31504,
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
    "bytes": 42737,
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
    "bytes": 851493,
  },
];
