# open-docs viewer

[![Val Town](https://img.shields.io/badge/Val%20Town-open--docs--viewer-334155)](https://www.val.town/x/arthrod/open-docs-viewer)
[![Live](https://img.shields.io/badge/live-viewers.benchmarks.law-2557d6)](https://viewers.benchmarks.law)
[![GitHub](https://img.shields.io/badge/github-arthrod%2Fopen--docs--viewer-181717)](https://github.com/arthrod/open-docs-viewer)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Engines](https://img.shields.io/badge/engines-arthrod%2Fopen--docs-0f172a)](https://github.com/arthrod/open-docs)

Every `.docx` renderer from the [open-docs](https://github.com/arthrod/open-docs) bench, **view-only**, fed the
same public document URL, and measured the same way. Ten engines render in the browser. The other two, Microsoft's and Google's viewers, render on the vendor's own
servers and are shown here in a frame: nothing of theirs renders client-side. Seven of the ten also
render **on this Val's server**, the way those two do: the server fetches the document,
lays it out, paints it, and the browser receives finished pages.

## Routes

| Route | What |
| --- | --- |
| `GET /` | the engines, the measurements, a URL form |
| `GET /v/<engine>?src=<url>` | view-only page: the engine runs in the browser, in its own read-only mode (Microsoft's and Google's viewers: a frame onto their server render) |
| `GET /r/<engine>?src=<url>` | **server-rendered**: the engine runs here; timings in `Server-Timing` (`fetch`, `init`, `render`), page count in `x-pages`, anything laid out but not painted in `x-unpainted` |
| `GET /api/doc?src=<url>` | this server fetches the document (https only, no private hosts, every redirect re-checked, ≤ 25 MB read in chunks, 20 s deadline, must be a zip); refusals are 4xx with the reason as text |
| `GET /results.json` | the browser-side measurements |

`src` defaults to the rich sample on Hugging Face:
[`arthrod/open-docs-fixtures/showcase.docx`](https://huggingface.co/datasets/arthrod/open-docs-fixtures).

## Samples

The landing page's form has three buttons that fill in the URL field
([`server/samples.ts`](server/samples.ts)); all three files are in the same dataset,
and they are the files the editors at editors.benchmarks.law load from their Menu.

| Button | File | What it is for |
| --- | --- | --- |
| Rich sample | `showcase.docx`, 47,871 B, 3 pages | Rendering fidelity; the document the main tables are measured on |
| Redline | `redline.docx`, 80,450 B, 3 pages | The rich sample after two reviewers: 23 tracked changes and 6 comments. Does the engine draw the revisions, hide them, or lose the words? |
| 500 pages | `lorem-500.docx`, 467,814 B | Lorem ipsum, 50 chapters of 10 pages, 2,726 paragraphs; 500 pages in Microsoft Word. Time, memory and page count on a long document |

The landing's **Other documents** section shows both new files measured on every
engine, the `/v/` page and the `/r/` route side by side
([`results/samples.json`](results/samples.json)):

<!-- samples:start -->
Measured 2026-11-15: Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from Darwin arm64.

**Redline (`redline.docx`)**

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 1.09 s | 964 ms, 1.50 s, 1.09 s | 10 MB | 334 MB | 673 KB | no server route |
| Docxodus | 1.70 s | 2.79 s, 1.40 s, 1.70 s | 7 MB | 374 MB | 8 MB | 1.09 s (543 ms rendering), 72 KB |
| SuperDoc | 2.42 s | 2.47 s, 2.42 s, 2.21 s | 15 MB | 552 MB | 8 MB | 727 ms (488 ms rendering), 18 KB |
| Plate | 1.72 s | 2.09 s, 1.69 s, 1.72 s | 11 MB | 307 MB | 1 MB | 467 ms (204 ms rendering), 37 KB |
| docen | 1.12 s | 2.62 s, 1.12 s, 1.08 s | 18 MB | 367 MB | 1 MB | 362 ms (46 ms rendering), 55 KB, 4 pages |
| docx-editor.dev | 945 ms | 1.49 s, 935 ms, 945 ms | 30 MB | 368 MB | 5 MB | 1.21 s (899 ms rendering), 326 KB, 3 pages |
| folio | 1.11 s | 1.00 s, 1.11 s, 1.20 s | 26 MB | 365 MB | 2 MB | 671 ms (314 ms rendering), 250 KB, 3 pages |
| WordCraft | 1.71 s | 1.98 s, 1.71 s, 1.50 s | 3 MB | 649 MB | 22 MB | 642 ms (309 ms rendering), 940 KB, 3 pages |
| Word Online viewer | 662 ms (frame load) | 720 ms, 662 ms, 560 ms | n/a | 687 MB | 2 MB | no server route |
| Google viewer | 2.01 s (frame load) | 1.10 s, failed, 2.92 s | n/a | 405 MB | 1 MB | no server route |
| Apryse WebViewer | 3.92 s | 6.59 s, 3.92 s, 1.71 s | 21 MB | 456 MB | 7 MB | no server route |
| Nutrient | 3.18 s | 3.18 s, 4.21 s, 3.04 s | 22 MB | 493 MB | 24 MB | no server route |

**500 pages (`lorem-500.docx`)**

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 13.5 s | 13.4 s, 13.5 s, 14.3 s | 1279 MB | 2292 MB | 1 MB | no server route |
| Docxodus | 7.14 s | 5.65 s, 9.97 s, 7.14 s | 14 MB | 985 MB | 8 MB | 5.00 s (4.40 s rendering), 2 MB |
| SuperDoc | 5.81 s | 5.71 s, 5.81 s, 6.63 s | 36 MB | 1106 MB | 8 MB | 6.17 s (5.66 s rendering), 2 MB |
| Plate | 21.1 s | 21.9 s, 21.1 s, 20.6 s | 82 MB | 454 MB | 1 MB | 2.34 s (875 ms rendering), 2 MB |
| docen | 2.48 s | 2.48 s, 2.35 s, 3.94 s | 22 MB | 561 MB | 2 MB | 2.45 s (1.26 s rendering), 5 MB, 623 pages |
| docx-editor.dev | 1.30 s | 1.29 s, 2.04 s, 1.30 s | 151 MB | 646 MB | 5 MB | **failed**: HTTP 500 "socket hang up" |
| folio | 2.11 s | 2.07 s, 2.73 s, 2.11 s | 56 MB | 957 MB | 3 MB | 6.58 s (5.78 s rendering), 29 MB, 500 pages |
| WordCraft | 2.71 s | 3.02 s, 2.71 s, 2.35 s | 3 MB | 707 MB | 22 MB | 154.8 s (64.5 s rendering), 224 MB, 550 pages |
| Word Online viewer | 788 ms (frame load) | 824 ms, 786 ms, 788 ms | n/a | 670 MB | 2 MB | no server route |
| Google viewer | 1.02 s (frame load) | 27.7 s, 975 ms, 1.02 s | n/a | 458 MB | 1 MB | no server route |
| Apryse WebViewer | 1.98 s | 1.94 s, 1.98 s, 2.01 s | 27 MB | 526 MB | 7 MB | no server route |
| Nutrient | 8.20 s | 8.64 s, 7.91 s, 8.20 s | 28 MB | 522 MB | 25 MB | no server route |
<!-- samples:end -->

Tracked changes on the server routes: Docxodus is asked for them
(`renderTrackedChanges: true`); Plate's import (mammoth) has no revision model, so
the document goes through open-docs' `lib/revisions.ts` first (inserted words
underlined, deleted words struck), exactly as its editor adapter does. SuperDoc's
projection is asked for its `redline` review mode (`<ins>` and `<del>`). The other
four are handed the original bytes. What each engine draws in the browser is
listed in the [open-docs README](https://github.com/arthrod/open-docs#tracked-changes-what-each-engine-draws).

## Server rendering

| `/r/…` | Engine | How it runs on Deno | Output |
| --- | --- | --- | --- |
| `docxodus` | Docxodus | `docxodus/core` `convertDocxToHtml` in Paginated mode, with headers, footers and notes (.NET in wasm); Docxodus's own `paginateHtml` then flows it into pages **in the browser** (see below) | pages |
| `folio` | folio | `@stll/folio-core` headless layout → display list → its HTML backend; fonts from `@stll/folio-fonts` | positioned pages |
| `eigenpal` | docx-editor.dev | `@docx-editor.dev/core/export` layout (HarfBuzz, packaged metric-compatible fonts) → the editor's own `paintSemanticLayout` into a linkedom document | positioned pages |
| `plate` | Plate | mammoth's import (as the editor adapter does) → `platejs/static` `serializeHtml`; pictures through `@platejs/media` at Word's width and alignment (read from `document.xml`, which mammoth drops) | flowing HTML |
| `docen` | docen | `@docen/docx` parse → `@docen/layout` paginator with a font-file `measureText` (opentype.js) → SVG pages painted here | positioned pages |
| `wordcraft` | WordCraft | its reader, layout and vello_cpu rasteriser compiled to wasm ([open-docs/tools/wordcraft-render](https://github.com/arthrod/open-docs/tree/main/tools/wordcraft-render)), fetched at a pinned commit and SHA-256-checked | PNG page images |
| `superdoc` | SuperDoc | `@superdoc/docx-engine/document-runtime` `openDocumentRuntime` (the engine's headless runtime, imported directly; that package is under SuperDoc's proprietary DOCX Engine licence, not the AGPL) → Document API `projectHtml` in `redline` review mode. **Not the paginated view**: no page breaks, colours or fonts, pictures become placeholders; what was downgraded is counted in `x-unpainted` | flowing HTML |

Not offered, deliberately: SuperDoc's **paginated** view (its layout measures text through a browser canvas and paints
into the DOM; its SDK wraps a native binary), **canvas-editor** (DOM and canvas throughout), **Apryse** and **Nutrient** (their
server products are native/Docker). Running those here would mean faking a browser.

Known gaps, stated rather than hidden:

- docen: headers and footers are not painted (`x-unpainted`), and its paginator puts the sample on 4 pages where
  the others use 3.
- Docxodus paginates by measuring laid-out text (its `PaginationEngine`; its `export-browser` package lays out in a
  frame). Deno has no layout engine, so the server does the conversion and the page runs Docxodus's `paginateHtml`
  once (`x-paginated-in: browser`; `Server-Timing` does not include it, ~65 ms in Chrome on the sample). That
  bundle is too large for a Val file: it is loaded from jsDelivr at a pinned commit of this repo, SRI-checked, and
  the page's CSP allows only that script and this Val's own (`scripts/build-dx-paginate.sh` rebuilds it).
- Plate is not a paginated editor; its output is one flowing page.
- Plate's import (mammoth) drops colours and highlighting, in the editor too; pictures inside list items are
  counted in `x-unpainted`.
- Fonts are metric-compatible stand-ins (Carlito for Calibri, Liberation for Arial/Times/Courier, …); WordCraft
  uses its own bundled faces.

Hardening: `/r` pages carry a CSP with `script-src 'none'` (Docxodus: only its pinned paginator and this Val's boot script) (a `javascript:` link in a .docx cannot run), Plate keeps
only http/https/mailto/`#` links, and a failed engine load is retried on the next request instead of cached.
Not covered: a public hostname that resolves to a private address (no connect-time IP check on Val Town), and
CPU/memory limits per render (a hostile .docx, e.g. a zip bomb, can exhaust the isolate; there is no worker isolation).

Two Deno workarounds, each scoped to one engine and commented in place:
`server/plate.ts` restores the `__proto__` setter mammoth needs (what `--unsafe-proto` does);
`server/docen.ts` supplies a 2D-canvas `measureText` because Deno's `OffscreenCanvas` has no 2D context.

### What the browser pays for a server render

<!-- server-client:start -->
Measured 2026-11-16: Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from Darwin arm64. Loaded = navigation start to the end of the load event (server render and download included).

**Rich sample (`showcase.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 2.04 s | 4.92 s, 2.04 s, 1.75 s | 1.77 s | 2.0 MB | 265 MB | 925 | 59 KB |
| folio | 1.85 s | 10.5 s, 1.85 s, 980 ms | 1.74 s | 1.2 MB | 248 MB | 478 | 140 KB |
| docx-editor.dev | 3.70 s | 19.8 s, 3.70 s, 1.89 s | 3.80 s | 706 KB | 258 MB | 1,046 | 1.1 MB |
| Plate | 986 ms | 986 ms, 1.07 s, 858 ms | 1.06 s | 1.1 MB | 241 MB | 460 | 13 KB |
| docen | 1.29 s | 22.3 s, 1.29 s, 586 ms | 940 ms | 706 KB | 254 MB | 301 | 1.1 MB |
| WordCraft | 1.18 s | 1.08 s, 1.18 s, 1.33 s | 1.22 s | 1.1 MB | 248 MB | 36 | 466 KB |
| SuperDoc | 989 ms | 1.81 s, 952 ms, 989 ms | 1.08 s | 1.1 MB | 241 MB | 231 | 3 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 769 ms | 769 ms, 584 ms, 785 ms | n/a | 1.7 MB | n/a | n/a | 1.6 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 20.8 s | 20.9 s, 808 ms, 20.8 s | n/a | 2.0 MB | n/a | n/a | 1.1 MB |

**Redline (`redline.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 1.25 s | 1.25 s, 1.38 s, 905 ms | 988 ms | 2.0 MB | 267 MB | 1,235 | 61 KB |
| folio | 671 ms | 671 ms, 823 ms, 566 ms | 640 ms | 1.1 MB | 250 MB | 661 | 144 KB |
| docx-editor.dev | 1.29 s | 1.30 s, 1.18 s, 1.29 s | 1.36 s | 689 KB | 259 MB | 1,264 | 1.1 MB |
| Plate | 567 ms | 575 ms, 567 ms, 502 ms | 640 ms | 1.1 MB | 242 MB | 720 | 14 KB |
| docen | 423 ms | 423 ms, 508 ms, 337 ms | 404 ms | 688 KB | 254 MB | 447 | 1.0 MB |
| WordCraft | 671 ms | 541 ms, 671 ms, 904 ms | 720 ms | 1.1 MB | 251 MB | 36 | 560 KB |
| SuperDoc | 1.05 s | 1.10 s, 949 ms, 1.05 s | 1.12 s | 1.1 MB | 241 MB | 349 | 4 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 662 ms | 720 ms, 662 ms, 560 ms | n/a | 1.7 MB | 687 MB | n/a | 1.7 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 2.01 s | 1.10 s, failed, 2.92 s | n/a | 1.8 MB | 405 MB | n/a | 1.1 MB |

**500 pages (`lorem-500.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 9.95 s | 10.1 s, 9.45 s, 9.95 s | 4.30 s | 2.5 MB | 902 MB | 28,444 | 575 KB |
| folio | 7.02 s | 7.02 s, 8.48 s, 6.73 s | 5.93 s | 736 KB | 522 MB | 93,497 | 1.7 MB |
| docx-editor.dev | **failed**: HTTP 500 | failed, failed, failed | | | | | |
| Plate | 2.29 s | 1.80 s, 2.29 s, 2.38 s | 2.17 s | 689 KB | 348 MB | 15,415 | 508 KB |
| docen | 4.20 s | 4.20 s, 4.54 s, 3.68 s | 2.24 s | 706 KB | 1650 MB | 36,966 | 1.1 MB |
| WordCraft | 154.0 s | 149.9 s, 155.1 s, 154.0 s | 70.6 s | 1.6 MB | 207 MB | 418 | 105 MB |
| SuperDoc | 6.94 s | 7.52 s, 6.56 s, 6.94 s | 7.00 s | 688 KB | 295 MB | 6,525 | 445 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 788 ms | 824 ms, 786 ms, 788 ms | n/a | 1.7 MB | 670 MB | n/a | 1.9 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 1.02 s | 27.7 s, 975 ms, 1.02 s | n/a | 1.7 MB | 458 MB | n/a | 1.1 MB |
<!-- server-client:end -->

### Lighthouse

Google's [PageSpeed Insights](https://pagespeed.web.dev) on every page (`scripts/measure_pagespeed.py`): Lighthouse run on
Google's machines, as a phone on slow 4G and as a desktop, so the figures do not depend on the computer that asks.
The four category scores (0 to 100) and the lab metrics. It scores the page load, not how faithfully the document is drawn.
For Microsoft's and Google's viewers it sees this site's frame page, not their servers' work.

<!-- lighthouse:start -->
Measured 2026-11-16: PageSpeed Insights (pagespeed.web.dev), Lighthouse 13.6.0 on Google's servers, 3 analyses per page, median. Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.

**Browser pages (`/v/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 40 · 42 | 6.86 s · 40.1 s | 898 ms · 1.18 s | 0.001 · 0.0 | 217 ms · 776 ms | 3.21 s · 10.8 s | 95 | 100 | 91 | 41/40/37 · 42/46/38 |
| folio | 54 · 49 | 2.81 s · 13.7 s | 784 ms · 737 ms | 0.002 · 0 | 451 ms · 1.66 s | 2.23 s · 7.66 s | 92 | 96 | 82 | 56/54/51 · 42/49/50 |
| docx-editor.dev | 41 · 47 | 4.82 s · 28.8 s | 1.53 s · 700 ms | 0.001 · 0.0 | 449 ms · 1.66 s | 2.80 s · 10.2 s | 100 | 100 | 90 | 41/41/39 · 51/47/44 |
| Plate | 72 · 61 | 1.64 s · 8.25 s | 505 ms · 506 ms | 0.002 · 0.0 | 234 ms · 771 ms | 2.35 s · 4.30 s | 98 | 100 | 91 | 78/46/72 · 46/61/68 |
| docen | 39 · 54 | 2.30 s · 767 ms | 699 ms · 930 ms | 0.288 · 0.327 | 235 ms · 767 ms | 3.67 s · 7.03 s | 82 | 88 | 90 | 28/44/39 · 52/61/54 |
| WordCraft | 100 · 97 | 680 ms · 2.63 s | 0 ms · 0 ms | 0.002 · 0.0 | 213 ms · 769 ms | 876 ms · 2.49 s | 100 | 96 | 90 | 100/100/100 · 97/97/96 |
| SuperDoc | 50 · 49 | 3.25 s · 17.5 s | 748 ms · 884 ms | 0.137 · 0.05 | 453 ms · 1.67 s | 1.29 s · 5.46 s | 94 | 100 | 90 | 50/48/60 · 45/61/49 |
| canvas-editor | 98 · 97 | 235 ms · 800 ms | 48 ms · 179 ms | 0.079 · 0.008 | 235 ms · 800 ms | 764 ms · 3.22 s | 94 | 100 | 80 | 98/98/fail · 97/97/fail |
| Apryse WebViewer | 100 · 92 | 215 ms · 765 ms | 69 ms · 354 ms | 0.002 · 0.0 | 215 ms · 765 ms | 229 ms · 773 ms | 100 | 96 | 90 | 100/100/67 · 92/98/76 |
| Nutrient | 72 · 79 | 218 ms · 767 ms | 546 ms · 551 ms | 0.002 · 0.0 | 218 ms · 767 ms | 2.54 s · 6.33 s | 100 | 96 | 90 | 84/72/71 · 87/79/79 |
| Word Online viewer | 96 · 94 | 223 ms · 773 ms | 0 ms · 0 ms | 0.003 · 0.0 | 223 ms · 773 ms | 1.96 s · 6.40 s | 100 | 73 | 90 | 94/96/99 · 94/97/91 |
| Google viewer | 100 · 99 | 221 ms · 773 ms | 0 ms · 60 ms | 0.002 · 0.0 | 221 ms · 773 ms | 257 ms · 3.50 s | 100 | 100 | 90 | 100/100/99 · 98/99/100 |

**Server-rendered pages (`/r/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 100 · 99 | 521 ms · 1.85 s | 0 ms · 7 ms | 0.0 · 0 | 261 ms · 924 ms | 809 ms · 2.26 s | 90 | 100 | 91 | 100/100/100 · 99/100/99 |
| folio | 100 · 99 | 594 ms · 2.14 s | 0 ms · 0 ms | 0 · 0 | 299 ms · 968 ms | 577 ms · 1.47 s | 70 | 100 | 82 | 100/100/99 · 100/99/99 |
| docx-editor.dev | 96 · 76 | 1.40 s · 6.49 s | 0 ms · 0 ms | 0.005 · 0.009 | 523 ms · 1.84 s | 885 ms · 2.94 s | 92 | 100 | 90 | 96/95/96 · 76/76/74 |
| Plate | 100 · 100 | 244 ms · 801 ms | 0 ms · 0 ms | 0 · 0 | 244 ms · 801 ms | 546 ms · 1.05 s | 96 | 100 | 91 | 100/100/100 · 100/100/100 |
| docen | 98 · 79 | 1.17 s · 5.90 s | 0 ms · 0 ms | 0 · 0 | 261 ms · 835 ms | 444 ms · 1.48 s | 97 | 100 | 90 | 98/97/98 · 79/76/100 |
| WordCraft | 99 · 85 | 793 ms · 3.35 s | 0 ms · 0 ms | 0 · 0 | 793 ms · 3.35 s | 836 ms · 3.35 s | 97 | 100 | 91 | 99/99/99 · 85/85/85 |
| SuperDoc | 100 · 100 | 213 ms · 766 ms | 0 ms · 0 ms | 0 · 0 | 213 ms · 766 ms | 782 ms · 1.78 s | 98 | 100 | 90 | 100/100/100 · 100/100/100 |

**Browser pages (`/v/`), 500 pages (`lorem-500.docx`)**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 35 · 35 | 10.4 s · 42.8 s | 10.1 s · 10.1 s | 0.001 · 0.0 | 215 ms · 771 ms | 20.7 s · 42.7 s | 96 | 100 | 90 | fail/35/fail · 35/35/fail |
| folio | 38 · 34 | 4.50 s · 18.1 s | 4.70 s · 9.10 s | 0.002 · 0.0 | 443 ms · 1.66 s | 6.39 s · 20.3 s | 96 | 96 | 91 | 36/38/39 · 34/34/34 |
| docx-editor.dev | 40 · 66 | 5.06 s · 1.66 s | 877 ms · 1.13 s | 0.001 · 0.0 | 450 ms · 1.66 s | 4.36 s · 13.1 s | 100 | 100 | 90 | 40/42/37 · 69/66/65 |
| Plate | **no result**: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding. | | | | | | | | | |
| docen | 57 · 53 | 2.31 s · 767 ms | 578 ms · 1.16 s | 0.002 · 0.327 | 214 ms · 765 ms | 2.45 s · 7.87 s | 100 | 96 | 90 | 100/57/43 · 55/44/53 |
| WordCraft | 99 · 84 | 915 ms · 4.54 s | 0 ms · 0 ms | 0.002 · 0.0 | 218 ms · 765 ms | 875 ms · 2.72 s | 100 | 96 | 90 | 99/99/99 · 83/84/84 |
| SuperDoc | 59 · 59 | 3.54 s · 19.5 s | 376 ms · 418 ms | 0.137 · 0.05 | 459 ms · 1.69 s | 1.36 s · 5.36 s | 100 | 100 | 90 | 58/59/59 · 59/58/60 |
| canvas-editor | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| Apryse WebViewer | 63 · 69 | 213 ms · 766 ms | 1.08 s · 1.16 s | 0.007 · 0.0 | 213 ms · 766 ms | 3.71 s · 9.00 s | 100 | 96 | 90 | 65/60/63 · 57/69/69 |
| Nutrient | 81 · 85 | 219 ms · 767 ms | 316 ms · 359 ms | 0.002 · 0.0 | 219 ms · 767 ms | 2.50 s · 6.95 s | 100 | 96 | 90 | 85/81/70 · 87/77/85 |
| Word Online viewer | 100 · 99 | 225 ms · 780 ms | 0 ms · 0 ms | 0.003 · 0.0 | 225 ms · 780 ms | 1.11 s · 3.11 s | 100 | 100 | 90 | 100/100/94 · 100/99/99 |
| Google viewer | 93 · 89 | 222 ms · 775 ms | 119 ms · 222 ms | 0.002 · 0.0 | 222 ms · 775 ms | 2.09 s · 7.01 s | 100 | 58 | 90 | 93/100/87 · 80/89/95 |

**Server-rendered pages (`/r/`), 500 pages**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | n/a · 28 | n/a · 9.49 s | n/a · 10.0 s | n/a · 0 | n/a · 3.60 s | n/a · 35.8 s | n/a | n/a | n/a | fail/fail/fail · 28/fail/fail |
| folio | 54 · 30 | 5.62 s · 11.0 s | 120 ms · 1.34 s | 0 · 0 | 5.36 s · 9.94 s | 7.34 s · 15.2 s | 74 | n/a | 80 | 54/fail/fail · 30/fail/fail |
| docx-editor.dev | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| Plate | 97 · 84 | 869 ms · 3.46 s | 18 ms · 6 ms | 0 · 0 | 869 ms · 3.46 s | 1.56 s · 3.46 s | 97 | 100 | 90 | 97/97/96 · 83/84/84 |
| docen | 53 · 33 | 1.69 s · 7.40 s | 1.57 s · 3.31 s | 0 · 0 | 1.20 s · 4.69 s | 2.14 s · 5.65 s | 97 | 100 | 82 | 53/53/59 · 28/33/38 |
| WordCraft | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| SuperDoc | 88 · 77 | 897 ms · 3.26 s | 0 ms · 0 ms | 0.0 · 0.0 | 897 ms · 3.26 s | 5.93 s · 15.2 s | 100 | 100 | 90 | 89/fail/88 · 77/fail/77 |
<!-- lighthouse:end -->

## Measuring

- Server routes: `python3 scripts/measure_server.py docxodus,folio,eigenpal,plate,docen,wordcraft,superdoc 5`
  (plain `curl`, a never-seen `?n=` per request, `Server-Timing` parsed). The numbers on `/` are the first
  request to each engine after a deploy, then the median of 5 warm requests.
- What a server route costs the browser: `uv run --with playwright python -I scripts/measure_server_client.py all showcase,redline,lorem-500 3 --out results/server-client.json`
  opens each `/r/` route in the installed Chrome (fresh profile per run) and records the load event, first paint,
  JS heap, renderer memory, DOM nodes and bytes. The landing page shows them under the server tables.
- Lighthouse: `uv run --with playwright python -I scripts/measure_pagespeed.py https://viewers.benchmarks.law v/docxodus,r/docxodus 3 --out results/lighthouse.json`
  (PageSpeed Insights, through its own site because the keyless API quota is usually spent; median of the analyses).
- Browser pages: `uv run --with playwright python -I scripts/measure.py <engines> <runs>` drives the installed
  Google Chrome, headed, with a fresh profile per run (cold cache) and a never-seen document URL per run, and reads
  `data-od-rendered`, which the page sets once the engine shows the document. `val.run` sits behind Cloudflare,
  which blocks headless browsers; a challenged run is recorded as blocked, and nothing here tries to get past it.
- The other documents: `scripts/measure.py all 3 --doc redline --samples results/samples.json` and
  `python3 scripts/measure_server.py all 3 --doc lorem-500 --samples results/samples.json`
  (`--doc showcase|redline|lorem-500`). Besides the JS heap, each browser run records **renderer memory**: the
  resident memory of every renderer process of that Chrome (`ps`), which also counts WebAssembly memory, canvases,
  the DOM and cross-origin frames. A server run that fails keeps its HTTP status and the reason.
- Refreshing the published table: the landing reads [`results/browser.json`](results/browser.json) from GitHub
  (5-minute cache; the copy bundled with the deploy is the fallback). Re-measure with
  `scripts/remeasure.sh [engines|all] [runs]` (runs `measure.py --results results/browser.json`, commits, pushes) or
  the [Re-measure workflow](.github/workflows/remeasure.yml) (on demand and Mondays 06:17 UTC; Chrome under Xvfb on
  ubuntu-latest, commits the file). Engines not re-measured keep their previous entry.
- In the page: every `/v/<engine>` page has **Re-measure now**, which reads JS heap, bytes and files loaded again with
  open-docs' own `lib/metrics.ts`, as the page is at that moment (nothing is stored).

## Development

```sh
vt clone arthrod/open-docs-viewer && cd open-docs-viewer
vt watch            # edit locally, deploys on save
```

Engines' browser code is not copied: shells are imported from the open-docs val and adapters load from
`editors.benchmarks.law`.

## License

MIT, like open-docs. Each engine keeps its own license (Apryse and Nutrient are proprietary and run in evaluation
mode).
