/**
 * The documents the bench offers besides whatever URL a visitor types: all in
 * the Hugging Face dataset arthrod/open-docs-fixtures, the same files the
 * editors at editors.benchmarks.law load from their Menu.
 */
import BUNDLED from "../results/samples.json" with { type: "json" };
import CLIENT from "../results/server-client.json" with { type: "json" };
import LIGHTHOUSE_JSON from "../results/lighthouse.json" with { type: "json" };

export const FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main";

export interface Sample {
  id: string;
  file: string;
  /** Short name for buttons and headings. */
  label: string;
  /** What it is for. */
  note: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "showcase",
    file: "showcase.docx",
    label: "Rich sample",
    note: "3 pages: styles, lists, a table with a merged cell, a chart, header and footer",
  },
  {
    id: "redline",
    file: "redline.docx",
    label: "Redline",
    note: "the rich sample after two reviewers: 23 tracked changes and 6 comments",
  },
  {
    id: "lorem-500",
    file: "lorem-500.docx",
    label: "500 pages",
    note: "lorem ipsum, 50 chapters of 10 pages, 2,726 paragraphs (500 pages in Microsoft Word)",
  },
];

export const sampleUrl = (s: Sample) => `${FIXTURES}/${s.file}`;

/** One engine's /v/ page on one sample (scripts/measure.py --doc). */
export interface SampleBrowser {
  renderedMs: number | null;
  runs: (number | null)[];
  bytes: number | null;
  requests: number | null;
  heapBytes: number | null;
  /** Resident memory of every renderer process of the Chrome that ran it. */
  rendererRss?: number | null;
  how: string | null;
  /** Why a run did not render, when one did not and others did. */
  failed?: string | null;
  /** What a run that rendered then failed to read (its time is kept). */
  incomplete?: string | null;
  /** When this row was measured, when the file records it per row (a partial re-run). */
  measuredAt?: string;
  environment?: string;
}
/** One engine's /r/ route on one sample (scripts/measure_server.py --doc). */
export interface SampleServer {
  /** HTTP status of the median run (a failure keeps its status and `error`). */
  code: number;
  /** Median wall-clock ms, and the engine's own render time from Server-Timing. */
  totalMs: number | null;
  renderMs: number | null;
  bytes: number | null;
  pages: number | null;
  /** Every run's total time (null = that run failed). */
  runs?: (number | null)[];
  /** A failed run's error; present beside a median when only some runs failed. */
  error?: string;
  /** When and how this route was timed (curl): the file's heading describes the browser rows. */
  measuredAt?: string;
  environment?: string;
}
export interface SampleResults {
  measuredAt: string | null;
  environment: string;
  samples: Record<string, {
    document: string;
    browser: Record<string, SampleBrowser>;
    server: Record<string, SampleServer>;
  }>;
}

export const SAMPLE_RESULTS = BUNDLED as SampleResults;

/** What one /r/ page costs the browser that opens it (scripts/measure_server_client.py). */
export interface ServerClient {
  /** Navigation start → end of the load event: server render, download, parse, layout, picture decoding. */
  loadMs: number | null;
  paintMs: number | null;
  heapBytes: number | null;
  rendererRss: number | null;
  domNodes: number | null;
  bytes: number | null;
  requests: number | null;
  runs: (number | null)[];
  error: string | null;
  /** When this row was measured, when the file records it per row (a partial re-run). */
  measuredAt?: string;
  environment?: string;
}
export interface ServerClientResults {
  measuredAt: string | null;
  environment: string;
  /** sample id → engine slug → medians */
  docs: Record<string, Record<string, ServerClient>>;
}
export const SERVER_CLIENT = CLIENT as ServerClientResults;

/** Lighthouse, as PageSpeed Insights runs it, for one page and one form factor (scripts/measure_pagespeed.py). */
export interface LighthousePage {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
  speedIndexMs: number | null;
  performanceRuns: (number | null)[];
  error: string | null;
}
/** One page's medians per form factor, and the run that measured it when that is recorded. */
export interface LighthouseEntry {
  desktop: LighthousePage;
  mobile: LighthousePage;
  measuredAt?: string;
  environment?: string;
}
export interface LighthouseResults {
  measuredAt: string | null;
  environment: string;
  /** "v/<slug>" and "r/<slug>" → medians, per form factor */
  pages: Record<string, LighthouseEntry>;
  /** The same pages opening another sample: sample id → page → medians. */
  docs?: Record<string, Record<string, LighthouseEntry>>;
  /** When and how each `docs` population was measured, when it was measured apart from `pages`. */
  docsMeta?: Record<string, { measuredAt: string; environment: string }>;
}
export const LIGHTHOUSE = LIGHTHOUSE_JSON as LighthouseResults;
