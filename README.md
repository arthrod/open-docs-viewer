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
Measured 2026-11-15: Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from Darwin arm64. Server routes: timed with curl.

**Redline (`redline.docx`)**

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 1.09 s | 964 ms, 1.50 s, 1.09 s | 9.7 MB | 334 MB | 673 KB | no server route |
| Docxodus | 1.70 s | 2.79 s, 1.40 s, 1.70 s | 7.4 MB | 374 MB | 7.8 MB | 1.09 s (543 ms rendering), 72 KB |
| SuperDoc | 2.42 s | 2.47 s, 2.42 s, 2.21 s | 15 MB | 552 MB | 7.9 MB | 727 ms (488 ms rendering), 18 KB |
| Plate | 1.72 s | 2.09 s, 1.69 s, 1.72 s | 11 MB | 307 MB | 1.1 MB | 467 ms (204 ms rendering), 37 KB |
| docen | 1.12 s | 2.62 s, 1.12 s, 1.08 s | 18 MB | 367 MB | 1.5 MB | 362 ms (46 ms rendering), 55 KB, 4 pages |
| docx-editor.dev | 945 ms | 1.49 s, 935 ms, 945 ms | 30 MB | 368 MB | 5.1 MB | 1.21 s (899 ms rendering), 326 KB, 3 pages |
| folio | 1.11 s | 1.00 s, 1.11 s, 1.20 s | 26 MB | 365 MB | 2.2 MB | 671 ms (314 ms rendering), 250 KB, 3 pages |
| WordCraft | 1.71 s | 1.98 s, 1.71 s, 1.50 s | 3.1 MB | 649 MB | 22 MB | 287 ms (25 ms laying out), 3 KB + a page image per page viewed, 3 pages |
| Word Online viewer | 662 ms (frame load) | 720 ms, 662 ms, 560 ms | n/a | 687 MB | 1.7 MB | rendered on Microsoft's servers |
| Google viewer | 2.01 s (frame load) | 1.10 s, failed, 2.92 s | n/a | 405 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 3.92 s | 6.59 s, 3.92 s, 1.71 s | 21 MB | 456 MB | 7.1 MB | no server route |
| Nutrient | 3.18 s | 3.18 s, 4.21 s, 3.04 s | 22 MB | 493 MB | 24 MB | no server route |

**500 pages (`lorem-500.docx`)**

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 13.5 s | 13.4 s, 13.5 s, 14.3 s | 1279 MB | 2292 MB | 1.0 MB | no server route |
| Docxodus | 7.14 s | 5.65 s, 9.97 s, 7.14 s | 14 MB | 985 MB | 8.1 MB | 5.00 s (4.40 s rendering), 2.1 MB |
| SuperDoc | 5.81 s | 5.71 s, 5.81 s, 6.63 s | 36 MB | 1107 MB | 8.3 MB | 6.17 s (5.66 s rendering), 1.6 MB |
| Plate | 21.1 s | 21.9 s, 21.1 s, 20.6 s | 82 MB | 454 MB | 1.5 MB | 2.34 s (875 ms rendering), 2.0 MB |
| docen | 2.48 s | 2.48 s, 2.35 s, 3.94 s | 22 MB | 561 MB | 1.8 MB | 2.45 s (1.26 s rendering), 4.8 MB, 623 pages |
| docx-editor.dev | 1.30 s | 1.29 s, 2.04 s, 1.30 s | 151 MB | 646 MB | 5.5 MB | **failed**: "socket hang up" |
| folio | 2.11 s | 2.07 s, 2.73 s, 2.11 s | 56 MB | 957 MB | 2.5 MB | 6.58 s (5.78 s rendering), 29 MB, 500 pages |
| WordCraft | 2.71 s | 3.02 s, 2.71 s, 2.35 s | 3.1 MB | 707 MB | 22 MB | 1.28 s (791 ms laying out), 367 KB + a page image per page viewed, 550 pages |
| Word Online viewer | 788 ms (frame load) | 824 ms, 786 ms, 788 ms | n/a | 670 MB | 1.9 MB | rendered on Microsoft's servers |
| Google viewer | 1.02 s (frame load) | 27.7 s, 975 ms, 1.02 s | n/a | 458 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 1.98 s | 1.94 s, 1.98 s, 2.01 s | 27 MB | 526 MB | 7.4 MB | no server route |
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
| `wordcraft` | WordCraft | its reader, layout and vello_cpu rasteriser compiled to wasm ([open-docs/tools/wordcraft-render](https://github.com/arthrod/open-docs/tree/main/tools/wordcraft-render)), fetched at a pinned commit and SHA-256-checked. The page holds every page's size and one image URL per page; `/r/wordcraft/page` rasterises a page when the browser asks for its image | PNG page images, one request per page, made as the page nears the viewport |
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
- WordCraft's page images are not in the page: the page is each page's size plus one image URL per page
  (`loading="lazy"`, no script), and a page is rasterised (about 0.2 s, about 200 KB; 330 KB for a dense screen)
  when the browser asks for it. Microsoft's and Google's viewers send their pages the same way. Its figures
  here are therefore for opening the document: the server's time is reading and laying out, and the browser's
  load is the page and its first two images. Nothing is stored: an image URL names the document's URL and
  hash, and an isolate that has not seen the document fetches and lays it out again (about a second for 550
  pages). Until 2026-11-16 every page was inline in one response: 522 MB for the 550 pages of
  `lorem-500.docx`, which the platform closed after about 144 s with a third of it sent.
- Plate is not a paginated editor; its output is one flowing page.
- Plate's import (mammoth) drops colours and highlighting, in the editor too; pictures inside list items are
  counted in `x-unpainted`.
- Fonts are metric-compatible stand-ins (Carlito for Calibri, Liberation for Arial/Times/Courier, …); WordCraft
  uses its own bundled faces.

Hardening: `/r` pages carry a CSP with `script-src 'none'` (Docxodus: only its pinned paginator and this Val's boot script) (a `javascript:` link in a .docx cannot run), Plate keeps
only http/https/mailto/`#` links, and a failed engine load is retried on the next request instead of cached.
A public hostname that resolves to a private address (`127.0.0.1.nip.io`) is refused: a public resolver is asked first
(`server/net.ts`). A document that cannot be fetched or opened is answered with HTTP 422 and one line of reason, never a stack trace.
Not covered: DNS rebinding between that check and the connection (no connect-time IP check on Val Town), and
CPU/memory limits per render (a hostile .docx, e.g. a zip bomb, can exhaust the isolate; there is no worker isolation).

**One render at a time.** A server process that runs out of memory ends, and takes every request it was answering
with it. Two guards (2026-11-16):
- Renders take turns within a process (`server/queue.ts`); the wait is reported as `queue` in `Server-Timing`, and
  with six already waiting the answer is `503` with `Retry-After`. Before this, 24 simultaneous requests for the
  500-page sample got five `"socket hang up"` answers and five folio pages cut off at 4 MB of 30; after it, 24 of
  24 and 32 of 32 whole pages. Val Town runs several processes, so this bounds each one, not the site.
- docx-editor.dev's route refuses a document whose `word/document.xml` is over 1 MB (`server/docx-size.ts`), with
  HTTP 422: its exporter ends the process on the 500-page sample (1.8 MB). Only 20 KB (renders) and 1.8 MB (ends
  the process) were tried, so the limit is a guard between the two, not a measured capacity.

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
| WordCraft | 639 ms | 639 ms, 584 ms, 1.42 s | 324 ms | 1.2 MB | 280 MB | 36 | 174 KB |
| SuperDoc | 989 ms | 1.81 s, 952 ms, 989 ms | 1.08 s | 1.1 MB | 241 MB | 231 | 3 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 769 ms | 769 ms, 584 ms, 785 ms | n/a | n/a | n/a | n/a | 1.6 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 20.8 s | 20.9 s, 808 ms, 20.8 s | n/a | n/a | n/a | n/a | 1.1 MB |

**Redline (`redline.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 1.25 s | 1.25 s, 1.38 s, 905 ms | 988 ms | 2.0 MB | 267 MB | 1,235 | 61 KB |
| folio | 671 ms | 671 ms, 823 ms, 566 ms | 640 ms | 1.1 MB | 250 MB | 661 | 144 KB |
| docx-editor.dev | 1.29 s | 1.30 s, 1.18 s, 1.29 s | 1.36 s | 689 KB | 259 MB | 1,264 | 1.1 MB |
| Plate | 567 ms | 575 ms, 567 ms, 502 ms | 640 ms | 1.1 MB | 242 MB | 720 | 14 KB |
| docen | 423 ms | 423 ms, 508 ms, 337 ms | 404 ms | 688 KB | 254 MB | 447 | 1.0 MB |
| WordCraft | 699 ms | 631 ms, 699 ms, 779 ms | 344 ms | 1.2 MB | 280 MB | 36 | 209 KB |
| SuperDoc | 1.05 s | 1.10 s, 949 ms, 1.05 s | 1.12 s | 1.1 MB | 241 MB | 349 | 4 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 662 ms | 720 ms, 662 ms, 560 ms | n/a | n/a | 687 MB | n/a | 1.7 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 2.01 s | 1.10 s, failed, 2.92 s | n/a | n/a | 405 MB | n/a | 1.1 MB |

**500 pages (`lorem-500.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 9.95 s | 10.1 s, 9.45 s, 9.95 s | 4.30 s | 2.5 MB | 902 MB | 28,444 | 575 KB |
| folio | 7.02 s | 7.02 s, 8.48 s, 6.73 s | 5.93 s | 736 KB | 522 MB | 93,497 | 1.7 MB |
| docx-editor.dev | **failed**: HTTP 500 | failed, failed, failed | | | | | |
| Plate | 2.29 s | 1.80 s, 2.29 s, 2.38 s | 2.17 s | 689 KB | 348 MB | 15,415 | 508 KB |
| docen | 4.20 s | 4.20 s, 4.54 s, 3.68 s | 2.24 s | 706 KB | 1650 MB | 36,966 | 1.1 MB |
| WordCraft | 1.42 s | 1.26 s, 1.42 s, 2.61 s | 1.01 s | 1.2 MB | 245 MB | 1,130 | 387 KB |
| SuperDoc | 6.94 s | 7.52 s, 6.56 s, 6.94 s | 7.00 s | 688 KB | 295 MB | 6,525 | 445 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 788 ms | 824 ms, 786 ms, 788 ms | n/a | n/a | 670 MB | n/a | 1.9 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 1.02 s | 27.7 s, 975 ms, 1.02 s | n/a | n/a | 458 MB | n/a | 1.1 MB |
<!-- server-client:end -->

### Lighthouse

Google's [PageSpeed Insights](https://pagespeed.web.dev) on every page (`scripts/measure_pagespeed.py`): Lighthouse run on
Google's machines, as a phone on slow 4G and as a desktop, so the figures do not depend on the computer that asks.
The four category scores (0 to 100) and the lab metrics. It scores the page load, not how faithfully the document is drawn.
For Microsoft's and Google's viewers it sees this site's frame page, not their servers' work.

<!-- lighthouse:start -->
Measured 2026-11-16: PageSpeed Insights (pagespeed.web.dev), Lighthouse 13.6.0 on Google's servers, 5 analyses per page and form factor, median of those that gave a result. Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.

**Browser pages (`/v/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 39 · 41 | 6.88 s · 40.2 s | 1.04 s · 1.40 s | 0.001 · 0 | 215 ms · 769 ms | 3.28 s · 9.96 s | 95 | 100 | 91 | 43/38/43/39/38 · 45/41/36/39/45 |
| folio | 56 · 46 | 2.73 s · 13.5 s | 676 ms · 972 ms | 0.002 · 0 | 444 ms · 1.66 s | 2.00 s · 7.56 s | 92 | 96 | 82 | 51/60/49/56/57 · 43/50/46/46/43 |
| docx-editor.dev | 44 · 50 | 4.83 s · 29.2 s | 953 ms · 585 ms | 0.001 · 0 | 450 ms · 1.66 s | 2.35 s · 11.0 s | 100 | 100 | 90 | 49/43/44/43/49 · 50/50/41/47/51 |
| Plate | 84 · 66 | 1.63 s · 8.19 s | 254 ms · 308 ms | 0.002 · 0 | 215 ms · 775 ms | 558 ms · 3.44 s | 98 | 100 | 91 | 91/84/94/79/83 · 74/63/69/66/64 |
| docen | 45 · 56 | 2.23 s · 765 ms | 639 ms · 897 ms | 0.288 · 0.327 | 213 ms · 765 ms | 2.18 s · 5.98 s | 82 | 88 | 90 | 41/54/48/40/45 · 58/55/55/56/63 |
| WordCraft | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] TypeError: Failed to fetch at Module.__wbg_init (https://editors.benchmarks.law/ | | | | | | | | | |
| SuperDoc | 58 · 49 | 3.21 s · 17.5 s | 415 ms · 942 ms | 0.137 · 0.05 | 482 ms · 1.68 s | 1.37 s · 5.01 s | 94 | 100 | 90 | 52/60/58/49/63 · 49/48/47/58/60 |
| canvas-editor | 98 · 94 | 223 ms · 781 ms | 61 ms · 248 ms | 0.079 · 0.033 | 223 ms · 781 ms | 749 ms · 3.23 s | 94 | 100 | 80 | 99/97/fail/98/98 · 91/99/fail/95/94 |
| Apryse WebViewer | 73 · 72 | 215 ms · 763 ms | 555 ms · 897 ms | 0.005 · 0.049 | 215 ms · 763 ms | 2.16 s · 7.74 s | 100 | 96 | 90 | 73/74/fail/77/66 · 72/72/fail/72/66 |
| Nutrient | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] PSPDFKitError: download 'https://cdn.cloud.pspdfkit.com/pspdfkit-web@1.25.0/nutr | | | | | | | | | |
| Word Online viewer | 96 · 96 | 218 ms · 772 ms | 0 ms · 0 ms | 0.086 · 0 | 218 ms · 772 ms | 1.57 s · 4.99 s | 100 | 73 | 90 | 96/97/99/93/96 · 95/96/99/97/95 |
| Google viewer | 98 · 97 | 220 ms · 789 ms | 61 ms · 109 ms | 0.003 · 0 | 220 ms · 789 ms | 1.31 s · 3.66 s | 100 | 58 | 90 | 93/99/fail/98/99 · 94/98/fail/100/96 |

**Server-rendered pages (`/r/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 100 · 99 | 531 ms · 1.85 s | 3 ms · 4 ms | 0 · 0.008 | 258 ms · 912 ms | 755 ms · 1.87 s | 90 | 100 | 91 | 100/100/fail/100/100 · 97/100/fail/100/99 |
| folio | 100 · 98 | 575 ms · 2.42 s | 0 ms · 0 ms | 0 · 0 | 288 ms · 953 ms | 516 ms · 1.42 s | 70 | 100 | 82 | 100/100/99/100/100 · 98/99/98/98/98 |
| docx-editor.dev | 95 · 80 | 1.44 s · 5.12 s | 0 ms · 0 ms | 0.005 · 0.008 | 559 ms · 1.84 s | 848 ms · 2.52 s | 92 | 100 | 90 | 99/95/94/98/94 · 80/76/79/88/93 |
| Plate | 100 · 100 | 247 ms · 781 ms | 0 ms · 0 ms | 0 · 0 | 247 ms · 781 ms | 362 ms · 901 ms | 96 | 100 | 91 | 100/100/100/100/100 · 100/100/100/100/100 |
| docen | 97 · 95 | 1.32 s · 2.90 s | 0 ms · 0 ms | 0 · 0 | 247 ms · 794 ms | 368 ms · 893 ms | 97 | 100 | 90 | 96/97/97/100/96 · 97/77/84/98/95 |
| WordCraft | 100 · 98 | 390 ms · 2.28 s | 0 ms · 0 ms | 0 · 0 | 234 ms · 784 ms | 290 ms · 829 ms | 97 | 100 | 91 | 100/100/100/100/100 · 100/98/98/99/98 |
| SuperDoc | 100 · 100 | 213 ms · 768 ms | 0 ms · 0 ms | 0 · 0 | 213 ms · 768 ms | 479 ms · 1.47 s | 98 | 100 | 90 | 100/100/100/100/100 · 100/100/100/100/100 |

The 500-page tables: Measured 2026-11-16: PageSpeed Insights (pagespeed.web.dev), Lighthouse 13.6.0 on Google's servers, 2 analyses per page and form factor, median of those that gave a result. Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.

**Browser pages (`/v/`), 500 pages (`lorem-500.docx`)**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| folio | 37 · 34 | 5.08 s · 16.9 s | 6.35 s · 5.43 s | 0.002 · 0 | 445 ms · 1.66 s | 5.56 s · 14.4 s | 96 | 96 | 91 | 36/37/40/36/37 · 34/34/35/34/35 |
| docx-editor.dev | 41 · 64 | 5.05 s · 1.66 s | 950 ms · 1.39 s | 0.002 · 0 | 450 ms · 1.66 s | 3.33 s · 12.5 s | 100 | 100 | 90 | 40/41/45/37/41 · 65/60/66/60/64 |
| Plate | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| docen | 42 · 58 | 2.42 s · 764 ms | 676 ms · 853 ms | 0.288 · 0.327 | 214 ms · 764 ms | 2.42 s · 6.70 s | 82 | 88 | 90 | 40/43/42/36/44 · 51/60/59/58/57 |
| WordCraft | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] TypeError: Failed to fetch at Module.__wbg_init (https://editors.benchmarks.law/ | | | | | | | | | |
| SuperDoc | 58 · 51 | 3.46 s · 19.6 s | 396 ms · 808 ms | 0.137 · 0.05 | 452 ms · 1.66 s | 1.33 s · 5.32 s | 100 | 100 | 90 | 53/58/59/61/53 · 61/51/48/57/48 |
| canvas-editor | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | |
| Apryse WebViewer | 66 · 75 | 217 ms · 766 ms | 1.10 s · 760 ms | 0.002 · 0 | 217 ms · 766 ms | 2.35 s · 7.04 s | 100 | 96 | 90 | 65/75/66/69/66 · 76/68/75/80/72 |
| Nutrient | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] PSPDFKitError: download 'https://cdn.cloud.pspdfkit.com/pspdfkit-web@1.25.0/nutr | | | | | | | | | |
| Word Online viewer | 95 · 98 | 221 ms · 774 ms | 0 ms · 0 ms | 0.003 · 0 | 221 ms · 774 ms | 2.01 s · 4.36 s | 100 | 73 | 90 | 93/100/96/95/93 · 98/98/96/100/97 |
| Google viewer | 96 · 95 | 220 ms · 774 ms | 165 ms · 156 ms | 0.002 · 0 | 220 ms · 774 ms | 1.28 s · 3.50 s | 100 | 58 | 90 | 84/100/91/96/98 · 100/100/95/95/95 |

**Server-rendered pages (`/r/`), 500 pages**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 34 · 28 | 5.93 s · 9.43 s | 9.43 s · 10.1 s | 0 · 0 | 985 ms · 3.58 s | 11.5 s · 31.8 s | 91 | 100 | 90 | fail/fail/35/fail/34 · 28/fail/28/28/fail |
| folio | 55 · 49 | 5.14 s · 11.1 s | 125 ms · 286 ms | 0 · 0 | 4.88 s · 10.1 s | 6.36 s · 13.5 s | 74 | n/a | 80 | 55/55/38/57/fail · 49/53/37/29/54 |
| docx-editor.dev | **no result**: NOT_HTML: The page provided is not HTML (served as MIME type text/plain). | | | | | | | | | |
| Plate | 98 · 81 | 791 ms · 3.53 s | 12 ms · 43 ms | 0 · 0 | 791 ms · 3.53 s | 1.23 s · 4.79 s | 97 | 100 | 90 | 99/98/94/96/98 · 82/81/81/80/84 |
| docen | 61 · 31 | 1.58 s · 7.67 s | 979 ms · 1.67 s | 0 · 0 | 1.09 s · 4.91 s | 1.65 s · 9.75 s | 97 | 100 | 90 | 60/62/fail/63/61 · fail/fail/31/fail/fail |
| WordCraft | 100 · 86 | 539 ms · 4.12 s | 0 ms · 0 ms | 0 · 0 | 275 ms · 841 ms | 732 ms · 3.98 s | 97 | 100 | 91 | 100/97/100/100/100 · 87/95/85/80/86 |
| SuperDoc | 89 · 77 | 870 ms · 3.28 s | 0 ms · 6 ms | 0 · 0 | 870 ms · 3.28 s | 4.23 s · 13.1 s | 100 | 100 | 90 | 89/89/fail/90/fail · 78/77/77/77/fail |
<!-- lighthouse:end -->

Read the Lighthouse tables with care:

- **WordCraft and Nutrient have no browser score.** On Google's machine their engines (about 60 and 70 MB) do not
  download and the page shows its error box, which paints fast: the scores published before 2026-11-16 (WordCraft
  100) were of that failure page. The script now reads the page's own console error from the report and records
  such an analysis as a failure. Why the download fails there is not known; it works in a browser and with `curl`.
- **A score is a median of five analyses**, and the last column lists each one; `fail` is an analysis that gave
  no result, with the reason in the data file.
- **PageSpeed sometimes refuses an address** ("Unable to resolve …") that it analyses a minute later, most often a
  server route that takes seconds to send its first byte.
- **The 500-page server routes were analysed one at a time.** Analysed four at a time (as before 2026-11-16),
  simultaneous renders ended the server process and PageSpeed got error answers; see "one render at a time" below.
- **Microsoft's viewer sends pages ten at a time** as the reader scrolls, so its scores and its "frame load"
  timings on the 500 pages are for the first ten pages, not the document.

## Tests

```sh
deno check --allow-import main.http.ts
deno test -A server/                                   # the WordCraft tests fetch the wasm module and the samples
uv run --with pytest pytest scripts/tests              # the measurement scripts' logic (scripts/measure_lib.py)
```

`.github/workflows/ci.yml` runs the same on every pull request, with coverage.

## Measuring

Every table in this file between `<!-- …:start -->` and `<!-- …:end -->` is written from the files in
[`results/`](results/) by `python3 scripts/readme_tables.py`, and CI fails when the two differ
(`--check`). Every run behind a median is in [`results/raw/`](results/raw/), with the machine's load average
when it was taken.

**Browser pages (`/v/`), rich sample** ([`results/browser.json`](results/browser.json))

<!-- browser:start -->
Measured 2026-11-09: Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Mac. Document: showcase.docx (47,871 B) with a never-seen ?n= per run.

| Engine | Cold render (`/v/`) | Each run | Downloaded | Requests | JS heap | Renderer memory |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| canvas-editor | 963 ms | 963 ms, 970 ms, 824 ms | 595 KB | 24 | 9.2 MB | n/a |
| Docxodus | 2.82 s | 2.82 s, 3.31 s, 2.04 s | 7.7 MB | 58 | 8.0 MB | n/a |
| SuperDoc | 2.66 s | 3.66 s, 2.66 s, 2.47 s | 8.7 MB | 24 | 18 MB | n/a |
| Plate | 1.39 s | 1.39 s, 1.09 s, 1.52 s | 1.0 MB | 429 | 25 MB | n/a |
| docen | 1.41 s | 1.67 s, 1.36 s, 1.41 s | 1.4 MB | 327 | 31 MB | n/a |
| docx-editor.dev | 1.20 s | 1.20 s, 1.58 s, 971 ms | 5.0 MB | 200 | 31 MB | n/a |
| folio | 1.12 s | 2.28 s, 1.08 s, 1.12 s | 2.1 MB | 78 | 21 MB | n/a |
| WordCraft | 1.68 s | 1.68 s, 1.55 s, 2.74 s | 22 MB | 19 | 3.1 MB | n/a |
| Word Online viewer | 769 ms (frame load) | 769 ms, 584 ms, 785 ms | 1.6 MB | 66 | n/a | n/a |
| Google viewer | 20.8 s (frame load) | 20.9 s, 808 ms, 20.8 s | 1.1 MB | 27 | n/a | n/a |
| Apryse WebViewer | 3.48 s | 3.48 s, 3.12 s, 5.28 s | 7.0 MB | 158 | 21 MB | n/a |
| Nutrient | 4.08 s | 4.17 s, 3.33 s, 4.08 s | 24 MB | 98 | 21 MB | n/a |
<!-- browser:end -->

**Server routes (`/r/`) with plain HTTP, rich sample** ([`results/server.json`](results/server.json))

<!-- server:start -->
Measured 2026-11-16: curl, a new connection (so DNS, TLS and connecting are in every total) and a never-seen ?n= per request, 5 runs, median; from Darwin arm64; machine load (1-minute average) median 9.3, highest 9.6, on 12 cores. Document: showcase.docx (47,871 B).

| Engine (`/r/`) | First request | of which init · render | Warm (median) | of which render | Each warm request | Sent |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Docxodus | 1.47 s | 165 ms · 843 ms | 566 ms | 328 ms | 1.26 s, 598 ms, 566 ms, 566 ms, 468 ms | 61 KB |
| folio | 1.98 s | 434 ms · 365 ms | 374 ms | 183 ms | 517 ms, 371 ms, 784 ms, 374 ms, 344 ms | 204 KB |
| docx-editor.dev | 1.21 s | 117 ms · 866 ms | 763 ms | 564 ms | 744 ms, 654 ms, 1.35 s, 791 ms, 763 ms | 238 KB |
| Plate | 710 ms | 132 ms · 222 ms | 337 ms | 143 ms | 312 ms, 337 ms, 333 ms, 352 ms, 688 ms | 32 KB |
| docen | 955 ms | 365 ms · 107 ms | 305 ms | 41 ms | 288 ms, 786 ms, 318 ms, 197 ms, 305 ms | 43 KB |
| WordCraft | 886 ms | 271 ms · 305 ms | 223 ms | 21 ms | 1.09 s, 178 ms, 223 ms, 637 ms, 178 ms | 3 KB + a page image per page viewed |
| SuperDoc | 1.38 s | 540 ms · 636 ms | 664 ms | 494 ms | 668 ms, 547 ms, 1.67 s, 664 ms, 614 ms | 7 KB |
<!-- server:end -->

How each is measured:


- Server routes: `python3 scripts/measure_server.py all 5 --first-warm results/server.json`, run straight after a
  deploy (plain `curl`, a new connection and a never-seen `?n=` per request, `Server-Timing` parsed). The numbers
  on `/` are the first request to each engine after that deploy, then the median of the 5 warm requests. A route
  whose first request reports no init time had already been asked: it is marked as not a first request. This one is
  run by hand from the machine that deployed (no workflow can be "straight after a deploy"), and every total includes
  DNS, TLS and connecting, because each request is a new `curl`. The first-request column is ONE request per engine
  per deploy, not a median: two deploys on 2026-11-16 gave Docxodus 3.07 s and then 1.47 s. Val Town also runs more
  than one copy of the val, so a "warm" request sometimes lands on a copy that has not loaded the engine yet (its
  `init` is then not 0); the median of five absorbs it, and every request is in the raw file.
- What a server route costs the browser: `uv run --with playwright python -I scripts/measure_server_client.py all showcase,redline,lorem-500 3 --out results/server-client.json`
  opens each `/r/` route in the installed Chrome (fresh profile per run) and records the load event, first paint,
  JS heap, renderer memory, DOM nodes and bytes. The landing page shows them under the server tables.
- Lighthouse: `uv run --with playwright python -I scripts/measure_pagespeed.py https://viewers.benchmarks.law v/docxodus,r/docxodus 3 --out results/lighthouse.json`
  (PageSpeed Insights, through its own site because the keyless API quota is usually spent; median of the analyses).
- Where: the browser timings are made on a GitHub-hosted macOS runner by the
  [Measure workflow](.github/workflows/measure.yml) (push a branch named `measure/<anything>`), because a timing
  taken on a laptop that is doing other work is slower than the engine. Every run records the machine's load
  average, so the files show it.
  That runner is a 3-core virtual machine: slower than a recent laptop (about half the speed of the
  M-series Mac the earlier figures came from) and not idle (its load average sits around 2 to 8 on 3 cores, part
  of it Chrome itself). It is used because it runs none of our other work and anyone can repeat the run. Read the
  figures as that machine's; what carries to another machine is the order between engines, not the seconds.
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
  the [Re-measure workflow](.github/workflows/remeasure.yml) (on demand and Mondays 06:17 UTC; headed Chrome on a
  macOS runner, commits the file; the schedule runs only from the default branch). Engines not re-measured keep their previous entry.
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
