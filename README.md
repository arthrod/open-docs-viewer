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
Server routes: timed with curl, as their own rows say in the file.

**Redline (`redline.docx`)**

Measured 2026-11-18: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs (6 for OnlyOffice and BetterOffice, measured in both passes of the day; OpenDoc in the second only), median; from a Hugging Face Jobs cpu-upgrade machine (8 vCPU, 32 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 6.5, highest 24.6, on 64 cores.

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 1.05 s | 974 ms, 1.21 s, 1.05 s | 9.8 MB | 473 MB | 676 KB | no server route |
| Docxodus | 2.19 s | 1.77 s, 2.19 s, 3.23 s | 8.0 MB | 536 MB | 7.2 MB | 1.31 s (888 ms rendering), 73 KB |
| SuperDoc | 3.79 s | 3.79 s, 3.75 s, 4.50 s | 21 MB | 629 MB | 7.8 MB | 832 ms (594 ms rendering), 18 KB |
| Plate | 1.44 s | 1.37 s, 1.44 s, 2.64 s | 11 MB | 437 MB | 1.1 MB | 664 ms (265 ms rendering), 38 KB |
| docen | 1.55 s | 1.48 s, 1.55 s, 1.67 s | 20 MB | 549 MB | 1.4 MB | 708 ms (144 ms rendering), 56 KB, 4 pages |
| docx-editor.dev | 1.08 s | 1.08 s, 872 ms, 1.10 s | 31 MB | 501 MB | 5.0 MB | 827 ms (587 ms rendering), 327 KB, 3 pages |
| folio | 1.58 s | 1.58 s, 1.27 s, 1.73 s | 25 MB | 456 MB | 2.2 MB | 387 ms (198 ms rendering), 251 KB, 3 pages |
| WordCraft | 3.18 s | 3.18 s, 3.00 s, 3.56 s | 3.7 MB | 829 MB | 22 MB | 248 ms (26 ms laying out), 3 KB + a page image per page viewed, 3 pages |
| Word Online viewer | 620 ms (frame load) | 590 ms, 620 ms, 1.21 s | n/a | 949 MB | 1.5 MB | rendered on Microsoft's servers |
| Google viewer | 11.1 s (frame load) | 1.05 s, failed, 21.1 s (failed: Google Docs viewer did not load within 60s) | n/a | 591 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 2.70 s | 2.70 s, 2.60 s, 8.00 s | 22 MB | 659 MB | 7.0 MB | no server route |
| Nutrient | 6.69 s | 5.37 s, 6.69 s, 9.26 s | 23 MB | 589 MB | 24 MB | no server route |
| react-docx | 3.04 s | failed, 2.95 s, 3.13 s (failed: react-docx could not open the first document: Failed to fetch dynamically imported module: https://viewers.benchmarks.law/eo1/vendor/npm/@extend-ai/react-docx@0) | 16 MB | 502 MB | 7.4 MB | no server route |
| Univer | 1.67 s | 1.53 s, failed, 1.81 s (failed: not rendered within 240s) | 32 MB | 490 MB | 2.3 MB | no server route |
| OpenDoc | 2.71 s | failed, 2.57 s, 2.84 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/opendoc?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-d) | 12 MB | 646 MB | 20 MB | no server route |
| BetterOffice | 2.47 s | 2.37 s, 2.36 s, failed, 4.48 s, 2.57 s, failed (failed: not rendered within 240s) | 17 MB | 642 MB | 12 MB | no server route |
| OnlyOffice (CryptPad build) | 3.51 s | 3.01 s, 2.98 s, 4.01 s, failed, 4.04 s, failed (failed: not rendered within 240s) | 51 MB | 703 MB | 18 MB | no server route |

**500 pages (`lorem-500.docx`)**

Measured 2026-11-18: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs (6 for OnlyOffice and BetterOffice, measured in both passes of the day; OpenDoc in the second only), median; from a Hugging Face Jobs cpu-upgrade machine (8 vCPU, 32 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 8.3, highest 45.5, on 64 cores.

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 27.8 s | 28.2 s, 27.8 s, 27.5 s | 1256 MB | 6079 MB | 1.0 MB | no server route |
| Docxodus | 11.6 s | 11.6 s, 12.6 s, 10.8 s | 15 MB | 1072 MB | 7.4 MB | 3.38 s (2.88 s rendering), 2.1 MB |
| SuperDoc | 13.5 s | 12.9 s, 13.5 s, 13.8 s | 30 MB | 970 MB | 8.2 MB | 5.58 s (5.16 s rendering), 1.6 MB |
| Plate | 56.0 s | 56.0 s, 58.8 s, 53.3 s | 64 MB | 589 MB | 1.5 MB | 1.32 s (705 ms rendering), 2.0 MB |
| docen | 6.43 s | 6.72 s, 5.92 s, 6.43 s | 168 MB | 3675 MB | 1.8 MB | 1.52 s (1.19 s rendering), 4.8 MB, 623 pages |
| docx-editor.dev | 2.62 s | 2.16 s, 2.79 s, 2.62 s | 91 MB | 612 MB | 5.4 MB | **failed**: this document is too large for this engine's server render (its text and structure unpack to 1.8 MB; the limit is 1.0 MB): larger ones end the server process. O |
| folio | 4.21 s | 4.21 s, 4.33 s, 3.92 s | 52 MB | 1026 MB | 2.5 MB | 5.74 s (4.63 s rendering), 29 MB, 500 pages |
| WordCraft | 5.06 s | 5.06 s, 5.04 s, 6.64 s | 3.6 MB | 995 MB | 22 MB | 1.59 s (1.16 s laying out), 365 KB + a page image per page viewed, 550 pages |
| Word Online viewer | 1.65 s (frame load) | 1.87 s, 1.54 s, 1.65 s | n/a | 733 MB | 1.1 MB | rendered on Microsoft's servers |
| Google viewer | 1.13 s (frame load) | 9.64 s, 1.13 s, 1.05 s | n/a | 604 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 3.77 s | 3.21 s, 3.77 s, 4.17 s | 26 MB | 1066 MB | 7.4 MB | no server route |
| Nutrient | 16.4 s | 16.4 s, 15.7 s, 17.6 s | 26 MB | 666 MB | 25 MB | no server route |
| react-docx | 9.67 s | 9.67 s, 9.08 s, 20.7 s | 171 MB | 923 MB | 7.3 MB | no server route |
| Univer | 16.9 s | 16.9 s, 16.2 s, 28.8 s | 1757 MB | 2353 MB | 3.0 MB | no server route |
| OpenDoc | 5.08 s | failed, 4.84 s, 5.32 s (failed: not rendered within 240s) | 13 MB | 914 MB | 21 MB | no server route |
| BetterOffice | 6.45 s | 6.45 s, 6.41 s, 7.53 s, 6.28 s, failed, 6.86 s (failed: not rendered within 240s) | 23 MB | 1230 MB | 11 MB | no server route |
| OnlyOffice (CryptPad build) | 5.21 s | 4.49 s, 5.60 s, 5.62 s, 11.2 s, 4.83 s, 4.75 s | 174 MB | 898 MB | 19 MB | no server route |
<!-- samples:end -->

Tracked changes on the server routes: Docxodus is asked for them
(`renderTrackedChanges: true`); Plate's import (mammoth) has no revision model, so
the document goes through open-docs' `lib/revisions.ts` first (inserted words
underlined, deleted words struck), exactly as its editor adapter does. SuperDoc's
projection is asked for its `redline` review mode (`<ins>` and `<del>`). The other
four are handed the original bytes. What each engine draws in the browser is
listed in the [open-docs README](https://github.com/arthrod/open-docs#tracked-changes-what-each-engine-draws).

## Engines added on 2026-11-18

Five engines were added to both sites and open the samples here, view-only where the engine has
such a mode. They are in the browser tables since the measuring pass of the same day.

| Engine | View-only here | Notes |
| --- | --- | --- |
| [react-docx](https://viewers.benchmarks.law/v/react-docx) | its `read-only` mode | Rust WASM reader, DOM pages |
| [BetterOffice](https://viewers.benchmarks.law/v/betteroffice) | `readOnly` (no toolbar or rulers) | Rust WASM engines in a Worker |
| [OpenDoc](https://viewers.benchmarks.law/v/opendoc) | its review mode "viewing" | its own application, a snapshot of 2026-11-05, in a frame |
| [OnlyOffice (CryptPad build)](https://viewers.benchmarks.law/v/onlyoffice) | `mode: "view"` | no document server: x2t converter in WASM; AGPL-3.0, [source and offer](https://github.com/arthrod/open-docs/tree/main/editors/onlyoffice) |
| [Univer](https://viewers.benchmarks.law/v/univer) | none: still editable | **text only**. Univer's open-source packages have no .docx reader, so this site's reader hands it the text and headings; layout, pictures and tracked changes are not Univer's rendering of the file |

The first four start a Worker from their own files or reach into a frame of them, which a browser
allows only from the page's own origin. Their files are therefore passed through this site under
`/eo1/vendor/…` (`server/pass-through.ts`) instead of being linked from the editors site, so each
of their files costs this site a request as well. For these engines the "requests passed through"
count of the measuring script is expected to be non-zero.

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
  with six already waiting the answer is `503` with `Retry-After`. A render that has not ended after two minutes
  gives its turn back (`503`), so one that waits on something that never answers cannot hold the rest for ever.
  Before the queue, 24 simultaneous `curl` requests for the 500-page sample got five `"socket hang up"` answers
  and five folio pages cut off at 4 MB of 30 (seen once, by hand; that output was not kept). After it, 32
  simultaneous requests all got whole pages (`results/raw/2026-11-16-burst-32-after-queue.txt`). What the queue
  bounds is the renders of one process: Val Town runs several processes, and the document is fetched (up to
  25 MB each) before a request asks for its turn, so simultaneous fetches are not bounded by it.
  WordCraft's page images draw from a layout that is already kept without a turn; a layout that is not kept is
  made in a turn, one per document however many of its pages are asked for together.
- docx-editor.dev's route refuses a document whose `word/document.xml` is over 1 MB as the zip's directory
  declares it (`server/docx-size.ts`), with HTTP 422: its exporter ends the process on the 500-page sample
  (1.8 MB). Only 20 KB (renders) and 1.8 MB (ends the process) were tried, so the limit is a guard between the
  two, not a measured capacity. It is a guard for honest documents: a crafted zip can declare less than it holds
  (see "Not covered" above).

Two Deno workarounds, each scoped to one engine and commented in place:
`server/plate.ts` restores the `__proto__` setter mammoth needs (what `--unsafe-proto` does);
`server/docen.ts` supplies a 2D-canvas `measureText` because Deno's `OffscreenCanvas` has no 2D context.

### What the browser pays for a server render

<!-- server-client:start -->
Measured 2026-11-18: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Hugging Face Jobs cpu-upgrade machine (8 vCPU, 32 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 37.0, highest 50.8, on 64 cores. Loaded = navigation start to the end of the load event (server render and download included).

**Rich sample (`showcase.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 1.89 s | 1.92 s, 655 ms, 1.89 s | 1.72 s | 2.3 MB | 366 MB | 927 | 59 KB |
| folio | 1.00 s | 1.33 s, 456 ms, 1.00 s | 988 ms | 1.5 MB | 360 MB | 480 | 154 KB |
| docx-editor.dev | 1.10 s | 1.10 s, 851 ms, 1.18 s | 1.17 s | 1.1 MB | 376 MB | 1,048 | 1.3 MB |
| Plate | 678 ms | 466 ms, 678 ms, 700 ms | 716 ms | 1.6 MB | 343 MB | 462 | 14 KB |
| docen | 769 ms | 769 ms, 290 ms, 870 ms | 712 ms | 993 KB | 371 MB | 303 | 1.1 MB |
| WordCraft | 1.19 s | 1.08 s, 1.46 s, 1.19 s | 592 ms | 1.5 MB | 352 MB | 40 | 176 KB |
| SuperDoc | 1.32 s | 1.32 s, 773 ms, 1.53 s | 1.35 s | 1.6 MB | 343 MB | 233 | 3 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 562 ms | 648 ms, 562 ms, 468 ms | n/a | n/a | 881 MB | n/a | 1.7 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 942 ms | 1.04 s, 942 ms, 913 ms | n/a | n/a | 586 MB | n/a | 1.1 MB |

**Redline (`redline.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 1.53 s | 1.06 s, 1.53 s, 1.75 s | 1.37 s | 2.2 MB | 366 MB | 1,237 | 61 KB |
| folio | 474 ms | 803 ms, 474 ms, 427 ms | 464 ms | 1.5 MB | 357 MB | 663 | 159 KB |
| docx-editor.dev | 1.01 s | 1.01 s, 1.39 s, 812 ms | 1.10 s | 1.1 MB | 380 MB | 1,266 | 1.3 MB |
| Plate | 405 ms | 647 ms, 400 ms, 405 ms | 440 ms | 1.6 MB | 344 MB | 722 | 14 KB |
| docen | 356 ms | 359 ms, 326 ms, 356 ms | 292 ms | 993 KB | 371 MB | 449 | 1.1 MB |
| WordCraft | 644 ms | 644 ms, 474 ms, 1.11 s | 272 ms | 1.5 MB | 353 MB | 40 | 210 KB |
| SuperDoc | 773 ms | 838 ms, 682 ms, 773 ms | 804 ms | 1.6 MB | 344 MB | 351 | 4 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 620 ms | 590 ms, 620 ms, 1.21 s | n/a | n/a | 949 MB | n/a | 1.5 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 11.1 s | 1.05 s, failed, 21.1 s | n/a | n/a | 591 MB | n/a | 1.1 MB |

**500 pages (`lorem-500.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus | 10.1 s | 13.0 s, 10.1 s, 9.74 s | 3.48 s | 13 MB | 931 MB | 45,317 | 575 KB |
| folio | 7.36 s | 7.93 s, 6.76 s, 7.36 s | 5.10 s | 1.0 MB | 604 MB | 93,499 | 1.7 MB |
| docx-editor.dev | **failed**: HTTP 422 | failed, failed, failed | | | | | |
| Plate | 1.48 s | 2.17 s, 1.12 s, 1.48 s | 1.29 s | 1.1 MB | 404 MB | 15,417 | 508 KB |
| docen | 5.51 s | 5.74 s, 4.61 s, 5.51 s | 1.76 s | 1001 KB | 1557 MB | 36,968 | 1.1 MB |
| WordCraft | 3.26 s | 4.14 s, 3.26 s, 1.48 s | 976 ms | 1.6 MB | 359 MB | 1,134 | 389 KB |
| SuperDoc | 6.30 s | 6.30 s, 6.28 s, 6.40 s | 6.14 s | 1.1 MB | 402 MB | 6,527 | 446 KB |
| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 1.65 s | 1.87 s, 1.54 s, 1.65 s | n/a | n/a | 733 MB | n/a | 1.1 MB |
| Google viewer (rendered on Google's servers; `/v/` frame load) | 1.13 s | 9.64 s, 1.13 s, 1.05 s | n/a | n/a | 604 MB | n/a | 1.1 MB |
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
| WordCraft | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] TypeError: Failed to fetch at Module.__wbg_init (https://editors.benchmarks.law/ | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| SuperDoc | 58 · 49 | 3.21 s · 17.5 s | 415 ms · 942 ms | 0.137 · 0.05 | 482 ms · 1.68 s | 1.37 s · 5.01 s | 94 | 100 | 90 | 52/60/58/49/63 · 49/48/47/58/60 |
| canvas-editor | 98 · 94 | 223 ms · 781 ms | 61 ms · 248 ms | 0.079 · 0.033 | 223 ms · 781 ms | 749 ms · 3.23 s | 94 | 100 | 80 | 99/97/fail/98/98 · 91/99/fail/95/94 (desktop: PageSpeed gave no result within 240 s: the page never finished loading for it; mobile: PageSpeed gave no result within 240 s: the page never finished loading for it) |
| Apryse WebViewer | 73 · 72 | 215 ms · 763 ms | 555 ms · 897 ms | 0.005 · 0.049 | 215 ms · 763 ms | 2.16 s · 7.74 s | 100 | 96 | 90 | 73/74/fail/77/66 · 72/72/fail/72/66 (desktop: PageSpeed refused the address: Unable to resolve https://viewers.benchmarks.law/v/apryse. Try checking the URL for validity.; mobile: PageSpeed refused the address: Unable to resolve https://viewers.benchmarks.law/v/apryse. Try checking the URL for validity.) |
| Nutrient | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] PSPDFKitError: download 'https://cdn.cloud.pspdfkit.com/pspdfkit-web@1.25.0/nutr | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| Word Online viewer | 96 · 96 | 218 ms · 772 ms | 0 ms · 0 ms | 0.086 · 0 | 218 ms · 772 ms | 1.57 s · 4.99 s | 100 | 73 | 90 | 96/97/99/93/96 · 95/96/99/97/95 |
| Google viewer | 98 · 97 | 220 ms · 789 ms | 61 ms · 109 ms | 0.003 · 0 | 220 ms · 789 ms | 1.31 s · 3.66 s | 100 | 58 | 90 | 93/99/fail/98/99 · 94/98/fail/100/96 (desktop: PageSpeed gave no result within 240 s: the page never finished loading for it; mobile: PageSpeed gave no result within 240 s: the page never finished loading for it) |

**Server-rendered pages (`/r/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 100 · 99 | 531 ms · 1.85 s | 3 ms · 4 ms | 0 · 0.008 | 258 ms · 912 ms | 755 ms · 1.87 s | 90 | 100 | 91 | 100/100/fail/100/100 · 97/100/fail/100/99 (desktop: PageSpeed gave no result within 240 s: the page never finished loading for it; mobile: PageSpeed gave no result within 240 s: the page never finished loading for it) |
| folio | 100 · 98 | 575 ms · 2.42 s | 0 ms · 0 ms | 0 · 0 | 288 ms · 953 ms | 516 ms · 1.42 s | 70 | 100 | 82 | 100/100/99/100/100 · 98/99/98/98/98 |
| docx-editor.dev | 95 · 80 | 1.44 s · 5.12 s | 0 ms · 0 ms | 0.005 · 0.008 | 559 ms · 1.84 s | 848 ms · 2.52 s | 92 | 100 | 90 | 99/95/94/98/94 · 80/76/79/88/93 |
| Plate | 100 · 100 | 247 ms · 781 ms | 0 ms · 0 ms | 0 · 0 | 247 ms · 781 ms | 362 ms · 901 ms | 96 | 100 | 91 | 100/100/100/100/100 · 100/100/100/100/100 |
| docen | 97 · 95 | 1.32 s · 2.90 s | 0 ms · 0 ms | 0 · 0 | 247 ms · 794 ms | 368 ms · 893 ms | 97 | 100 | 90 | 96/97/97/100/96 · 97/77/84/98/95 |
| WordCraft | 100 · 98 | 390 ms · 2.28 s | 0 ms · 0 ms | 0 · 0 | 234 ms · 784 ms | 290 ms · 829 ms | 97 | 100 | 91 | 100/100/100/100/100 · 100/98/98/99/98 |
| SuperDoc | 100 · 100 | 213 ms · 768 ms | 0 ms · 0 ms | 0 · 0 | 213 ms · 768 ms | 479 ms · 1.47 s | 98 | 100 | 90 | 100/100/100/100/100 · 100/100/100/100/100 |

**Browser pages (`/v/`), 500 pages (`lorem-500.docx`)**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| folio | 37 · 34 | 5.08 s · 16.9 s | 6.35 s · 5.43 s | 0.002 · 0 | 445 ms · 1.66 s | 5.56 s · 14.4 s | 96 | 96 | 91 | 36/37/40/36/37 · 34/34/35/34/35 |
| docx-editor.dev | 41 · 64 | 5.05 s · 1.66 s | 950 ms · 1.39 s | 0.002 · 0 | 450 ms · 1.66 s | 3.33 s · 12.5 s | 100 | 100 | 90 | 40/41/45/37/41 · 65/60/66/60/64 |
| Plate | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| docen | 42 · 58 | 2.42 s · 764 ms | 676 ms · 853 ms | 0.288 · 0.327 | 214 ms · 764 ms | 2.42 s · 6.70 s | 82 | 88 | 90 | 40/43/42/36/44 · 51/60/59/58/57 |
| WordCraft | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] TypeError: Failed to fetch at Module.__wbg_init (https://editors.benchmarks.law/ | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| SuperDoc | 58 · 51 | 3.46 s · 19.6 s | 396 ms · 808 ms | 0.137 · 0.05 | 452 ms · 1.66 s | 1.33 s · 5.32 s | 100 | 100 | 90 | 53/58/59/61/53 · 61/51/48/57/48 |
| canvas-editor | **no result**: PageSpeed gave no result within 240 s: the page never finished loading for it | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| Apryse WebViewer | 66 · 75 | 217 ms · 766 ms | 1.10 s · 760 ms | 0.002 · 0 | 217 ms · 766 ms | 2.35 s · 7.04 s | 100 | 96 | 90 | 65/75/66/69/66 · 76/68/75/80/72 |
| Nutrient | **no result**: the engine failed on Google's machine, so there is no score: [open-docs-viewer] PSPDFKitError: download 'https://cdn.cloud.pspdfkit.com/pspdfkit-web@1.25.0/nutr | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| Word Online viewer | 95 · 98 | 221 ms · 774 ms | 0 ms · 0 ms | 0.003 · 0 | 221 ms · 774 ms | 2.01 s · 4.36 s | 100 | 73 | 90 | 93/100/96/95/93 · 98/98/96/100/97 |
| Google viewer | 96 · 95 | 220 ms · 774 ms | 165 ms · 156 ms | 0.002 · 0 | 220 ms · 774 ms | 1.28 s · 3.50 s | 100 | 58 | 90 | 84/100/91/96/98 · 100/100/95/95/95 |

**Server-rendered pages (`/r/`), 500 pages**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 34 · 28 | 5.93 s · 9.43 s | 9.43 s · 10.1 s | 0 · 0 | 985 ms · 3.58 s | 11.5 s · 31.8 s | 91 | 100 | 90 | fail/fail/35/fail/34 · 28/fail/28/28/fail (desktop: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.; mobile: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.) |
| folio | 55 · 49 | 5.14 s · 11.1 s | 125 ms · 286 ms | 0 · 0 | 4.88 s · 10.1 s | 6.36 s · 13.5 s | 74 | n/a | 80 | 55/55/38/57/fail · 49/53/37/29/54 (desktop: PROTOCOL_TIMEOUT: Waiting for DevTools protocol response has exceeded the allotted time. (Method: Runtime.evaluate)) |
| docx-editor.dev (measured 2026-11-16: PageSpeed Insights (pagespeed.web.dev), Lighthouse 13.6.0 on Google's servers, 2 analyses per page and form factor, median of those that gave a result) | **no result**: NOT_HTML: The page provided is not HTML (served as MIME type text/plain). | | | | | | | | | fail/fail · fail/fail |
| Plate | 98 · 81 | 791 ms · 3.53 s | 12 ms · 43 ms | 0 · 0 | 791 ms · 3.53 s | 1.23 s · 4.79 s | 97 | 100 | 90 | 99/98/94/96/98 · 82/81/81/80/84 |
| docen | 61 · 31 | 1.58 s · 7.67 s | 979 ms · 1.67 s | 0 · 0 | 1.09 s · 4.91 s | 1.65 s · 9.75 s | 97 | 100 | 90 | 60/62/fail/63/61 · fail/fail/31/fail/fail (desktop: PROTOCOL_TIMEOUT: Waiting for DevTools protocol response has exceeded the allotted time. (Method: Runtime.evaluate); mobile: PROTOCOL_TIMEOUT: Waiting for DevTools protocol response has exceeded the allotted time. (Method: Runtime.evaluate)) |
| WordCraft | 100 · 86 | 539 ms · 4.12 s | 0 ms · 0 ms | 0 · 0 | 275 ms · 841 ms | 732 ms · 3.98 s | 97 | 100 | 91 | 100/97/100/100/100 · 87/95/85/80/86 |
| SuperDoc | 89 · 77 | 870 ms · 3.28 s | 0 ms · 6 ms | 0 · 0 | 870 ms · 3.28 s | 4.23 s · 13.1 s | 100 | 100 | 90 | 89/89/fail/90/fail · 78/77/77/77/fail (desktop: FAILED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested. Make sure you are testing the correct URL and that the server is properl; mobile: PageSpeed refused the address: Unable to resolve https://viewers.benchmarks.law/r/superdoc?src=https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolv) |
<!-- lighthouse:end -->

Read the Lighthouse tables with care:

- **WordCraft and Nutrient have no browser score.** On Google's machine their engines (22 and 24 MB over the network: "Downloaded" in the main table) do not
  download and the page shows its error box, which paints fast: the scores published before 2026-11-16 (WordCraft
  100) were of that failure page. The script now reads the page's own console error from the report and records
  such an analysis as a failure. Why the download fails there is not known; it works in a browser and with `curl`.
- **A score is a median of five analyses**, and the last column lists each one; `fail` is an analysis that gave
  no result, with the reason in the data file.
- **PageSpeed sometimes refuses an address** ("Unable to resolve …") that it analyses a minute later, most often a
  server route that takes seconds to send its first byte.
- **The 500-page server routes were analysed one at a time.** Analysed four at a time (as before 2026-11-16),
  simultaneous renders ended the server process and PageSpeed got error answers; see "one render at a time" below.
- **Microsoft's viewer sends pages ten at a time** as the reader scrolls (seen in its network requests on
  2026-11-16: the first answer holds pages 1 to 10 of the 500), so its scores and its "frame load"
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
Measured 2026-11-18: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs (6 for OnlyOffice and BetterOffice, measured in both passes of the day; OpenDoc in the second only), median; from a Hugging Face Jobs cpu-upgrade machine (8 vCPU, 32 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 9.7, highest 15.1, on 64 cores. Document: showcase.docx (47,871 B) with a never-seen ?n= per run.

| Engine | Cold render (`/v/`) | Each run | Downloaded | Requests | JS heap | Renderer memory |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| canvas-editor | 882 ms | 1.15 s, 842 ms, 882 ms | 644 KB | 29 | 9.7 MB | 466 MB |
| Docxodus | 1.87 s | 1.86 s, 1.87 s, 1.88 s | 7.1 MB | 61 | 7.7 MB | 536 MB |
| SuperDoc | 4.30 s | 4.35 s, 4.30 s, 3.67 s | 7.8 MB | 26 | 19 MB | 610 MB |
| Plate | 1.51 s | 3.43 s, 1.51 s, 1.18 s | 1.1 MB | 435 | 11 MB | 431 MB |
| docen | 1.53 s | 2.55 s, 1.53 s, 1.51 s | 1.4 MB | 329 | 31 MB | 549 MB |
| docx-editor.dev | 992 ms | 1.64 s, 944 ms, 992 ms | 5.0 MB | 205 | 32 MB | 499 MB |
| folio | 1.31 s | 2.11 s, 1.29 s, 1.31 s | 2.1 MB | 82 | 21 MB | 445 MB |
| WordCraft | 2.93 s | 2.93 s, 3.01 s, 2.85 s | 22 MB | 23 | 3.6 MB | 842 MB |
| Word Online viewer | 562 ms (frame load) | 648 ms, 562 ms, 468 ms | 1.7 MB | 71 | n/a | 881 MB |
| Google viewer | 942 ms (frame load) | 1.04 s, 942 ms, 913 ms | 1.1 MB | 32 | n/a | 586 MB |
| Apryse WebViewer | 2.74 s | 4.62 s, 2.69 s, 2.74 s | 7.0 MB | 163 | 21 MB | 653 MB |
| Nutrient | 5.67 s | 6.06 s, 5.60 s, 5.67 s | 24 MB | 103 | 24 MB | 585 MB |
| react-docx | 3.10 s | 3.10 s, 3.24 s, 3.00 s | 7.4 MB | 38 | 17 MB | 513 MB |
| Univer | 1.63 s | 1.70 s, 1.63 s, 1.49 s | 2.3 MB | 374 | 31 MB | 485 MB |
| OpenDoc | 2.96 s | 8.63 s, 2.96 s, 2.51 s | 20 MB | 378 | 18 MB | 667 MB |
| BetterOffice | 2.51 s | failed, 2.40 s, 2.09 s, 3.61 s, 2.51 s, 2.67 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/betteroffice?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fo) | 12 MB | 249 | 12 MB | 607 MB |
| OnlyOffice (CryptPad build) | 3.53 s | failed, 2.89 s, failed, 4.02 s, 3.53 s, failed (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/onlyoffice?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fope) | 18 MB | 80 | 72 MB | 690 MB |
<!-- browser:end -->

**Server routes (`/r/`) with plain HTTP, rich sample** ([`results/server.json`](results/server.json))

<!-- server:start -->
Measured 2026-11-17: curl, a new connection (so DNS, TLS and connecting are in every total) and a never-seen ?n= per request, 5 runs, median; from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores. Document: showcase.docx (47,871 B).

| Engine (`/r/`) | First request | of which init · render | Warm (median) | of which render | Each warm request | Sent |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Docxodus | 1.73 s | 189 ms · 890 ms | 471 ms | 282 ms | 1.13 s, 494 ms, 443 ms, 463 ms, 479 ms (1 reached a process that had not loaded the engine: not in the median) | 61 KB |
| folio | 1.33 s | 347 ms · 332 ms | 399 ms | 212 ms | 1.31 s, 441 ms, 375 ms, 356 ms, 423 ms (1 reached a process that had not loaded the engine: not in the median) | 204 KB |
| docx-editor.dev | 1.25 s | 119 ms · 866 ms | 710 ms | 503 ms | 739 ms, 1.25 s, 718 ms, 683 ms, 702 ms (1 reached a process that had not loaded the engine: not in the median) | 238 KB |
| Plate | 718 ms | 135 ms · 212 ms | 306 ms | 146 ms | 1.10 s, 361 ms, 271 ms, 313 ms, 300 ms (1 reached a process that had not loaded the engine: not in the median) | 32 KB |
| docen | 660 ms | 343 ms · 126 ms | 193 ms | 39 ms | 728 ms, 195 ms, 191 ms, 183 ms, 263 ms (1 reached a process that had not loaded the engine: not in the median) | 43 KB |
| WordCraft | 476 ms | 187 ms · 126 ms | 221 ms | 23 ms | 171 ms, 191 ms, 375 ms, 221 ms, 256 ms | 3 KB + a page image per page viewed |
| SuperDoc | 1.39 s | 516 ms · 619 ms | 604 ms | 436 ms | 651 ms, 568 ms, 598 ms, 604 ms, 687 ms | 7 KB |
<!-- server:end -->

How each is measured:


- Server routes: `python3 scripts/measure_server.py all 5 --first-warm results/server.json`, run straight after a
  deploy (plain `curl`, a new connection and a never-seen `?n=` per request, `Server-Timing` parsed). The numbers
  on `/` are the first request to each engine after that deploy, then the median of the 5 warm requests. A route
  whose first request reports no init time had already been asked: it is marked as not a first request. This one is
  run by hand from the machine that deployed (no workflow can be "straight after a deploy"), and every total includes
  DNS, TLS and connecting, because each request is a new `curl`. The first-request column is ONE request per engine
  per deploy, not a median: six deploys on 2026-11-16 and 17 gave Docxodus 3.07 s, 1.47 s, 2.23 s, 1.84 s, 2.78 s and 1.73 s
  (`git log -p results/server.json`). Val Town also runs more than one copy of the val, so a "warm" request
  sometimes lands on a copy that has not loaded the engine yet (its `init` is then 100 ms or more, not 0 to 2):
  such a request is listed with the others, counted in its row, and left out of the warm medians; every request
  is in the raw file.
- What a server route costs the browser: `uv run --with playwright python -I scripts/measure_server_client.py all showcase,redline,lorem-500 3 --out results/server-client.json`
  opens each `/r/` route in the installed Chrome (fresh profile per run) and records the load event, first paint,
  JS heap, renderer memory, DOM nodes and bytes. The landing page shows them under the server tables.
- Lighthouse: `uv run --with playwright python -I scripts/measure_pagespeed.py https://viewers.benchmarks.law v/docxodus,r/docxodus 3 --out results/lighthouse.json`
  (PageSpeed Insights, through its own site because the keyless API quota is usually spent; median of the analyses).
- Where: since 2026-11-18 the browser timings are made on a Hugging Face Jobs machine (`cpu-upgrade`: 8 vCPU,
  32 GB, Linux, no GPU, so Chrome draws in software; headed under Xvfb) by open-docs'
  [`scripts/hf_job.sh`](https://github.com/arthrod/open-docs/blob/main/scripts/hf_job.sh), 3 runs per engine and
  document. It runs none of our other work and anyone can rent the same machine. The load average and core count
  in each heading are the shared host's (64 cores), not our 8 vCPU: the load reached 45 during the browser runs, and
  how much of that slowed our Chrome cannot be told from inside the job. These figures do not continue the
  earlier series, which came from a GitHub-hosted macOS runner (3 cores, 5 runs; the files of 2026-11-16 and
  2026-11-17 in `results/raw/`, and the [Measure workflow](.github/workflows/measure.yml) that still makes
  them). Read the figures as that machine's; what carries to another machine is the order between engines, not
  the seconds.
- That pass, honestly: OpenDoc failed all 9 starts of the first pass, because its adapter handed it a document
  before its engine was ready (fixed in open-docs the same day); its rows are from a second pass, and the failed
  runs stay in the raw files. OnlyOffice and BetterOffice were measured in both passes (6 runs). The second pass
  was a separate job on the same machine type, and its load-average readings do not continue the first job's, so
  it ran on another host of that type (64 cores, 493 GB). A third job that evening, meant to take every row on one
  host, was not used: its host's load reached 102 during the browser runs, and it saved no new 500-page file. 14 of the 171
  runs behind the tables did not render, 5 of them OnlyOffice's (of its 18) and 4 BetterOffice's (of 18): mostly
  "not rendered within 240 s" or the page answering an error status. Each row's runs column shows them, and the
  raw files give the reason.
  The first-and-warm server table and the Lighthouse tables were not taken again.
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
