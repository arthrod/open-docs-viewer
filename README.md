# open-docs viewer

[![Val Town](https://img.shields.io/badge/Val%20Town-open--docs--viewer-334155)](https://www.val.town/x/arthrod/open-docs-viewer)
[![Live](https://img.shields.io/badge/live-viewers.benchmarks.law-2557d6)](https://viewers.benchmarks.law)
[![GitHub](https://img.shields.io/badge/github-arthrod%2Fopen--docs--viewer-181717)](https://github.com/arthrod/open-docs-viewer)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Engines](https://img.shields.io/badge/engines-arthrod%2Fopen--docs-0f172a)](https://github.com/arthrod/open-docs)

Every `.docx` renderer from the [open-docs](https://github.com/arthrod/open-docs) bench, **view-only**, fed the
same public document URL, and measured the same way. Seventeen engines (eighteen rows on the landing page: cite-check is an application on canvas-editor, not an engine of its own): fifteen render in the browser (ten from the start, five added on
2026-11-18). The other two, Microsoft's and Google's viewers, render on the vendor's own
servers and are shown here in a frame: nothing of theirs renders client-side. Nine of the fifteen also
render **on this Val's server**, the way those two do: the server fetches the document,
lays it out, paints it, and the browser receives finished pages. The other six have only the
browser page, each for a reason [given below](#no-server-route-and-why).

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

Measured 2026-11-21: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 51.7, highest 102.0, on 64 cores.

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 1.02 s | failed, 1.02 s, failed (failed: not rendered within 240s) | 5.9 MB | 472 MB | 676 KB | no server route: it measures and paints on a browser canvas |
| Docxodus | 2.14 s | 2.14 s, 2.13 s, failed (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/docxodus?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-) | 7.6 MB | 535 MB | 7.2 MB | 604 ms (373 ms rendering), 73 KB |
| SuperDoc | 4.59 s | 4.35 s, 4.84 s, 4.59 s | 13 MB | 627 MB | 7.8 MB | 892 ms (697 ms rendering), 18 KB |
| Plate | 1.58 s | 1.52 s, 1.58 s, 1.64 s | 11 MB | 437 MB | 1.1 MB | 428 ms (195 ms rendering), 38 KB |
| docen | 2.29 s | 2.78 s, 1.79 s, failed (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/docen?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-doc) | 19 MB | 552 MB | 1.4 MB | 238 ms (41 ms rendering), 56 KB, 4 pages |
| docx-editor.dev | 2.22 s | 2.17 s, 2.27 s, failed (failed: not rendered within 240s) | 22 MB | 496 MB | 5.0 MB | 828 ms (591 ms rendering), 327 KB, 3 pages |
| folio | 2.20 s | 1.68 s, 2.20 s, 2.57 s | 16 MB | 456 MB | 2.2 MB | 446 ms (208 ms rendering), 251 KB, 3 pages |
| WordCraft | 3.34 s | 3.27 s, 3.34 s, 3.41 s | 3.3 MB | 826 MB | 22 MB | 243 ms (31 ms laying out), 3 KB + a page image per page viewed, 3 pages |
| Microsoft Word viewer | 582 ms (frame load) | 547 ms, 582 ms, 620 ms | n/a | 963 MB | 1.6 MB | rendered on Microsoft's servers |
| Google Docs viewer | 1.15 s (frame load) | 1.38 s, 1.09 s, 1.15 s | n/a | 585 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 3.36 s | failed, 3.10 s, 3.63 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/apryse?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-do) | 17 MB | 657 MB | 7.0 MB | no server route: Apryse renders on a server with a native SDK |
| Nutrient | 7.12 s | 7.12 s, 6.65 s, 7.18 s | 18 MB | 589 MB | 24 MB | no server route: Nutrient renders on a server with a Docker service |
| react-docx | 2.26 s | 3.02 s, 2.26 s, 2.05 s | 12 MB | 500 MB | 7.4 MB | no server route: it breaks pages by measuring text in the browser |
| Univer | 1.77 s | 1.60 s, 1.77 s, 1.78 s | 24 MB | 488 MB | 2.3 MB | no server route: no .docx reader, and its layout measures text on a canvas |
| OpenDoc | 3.10 s | 3.05 s, 3.10 s, 3.15 s | 12 MB | 698 MB | 20 MB | 204 ms (22 ms laying out), 3 KB + a page image per page viewed, 3 pages (timed from Darwin arm64, not from a Hugging Face Jobs cpu-xl machine as the other rows) |
| BetterOffice | 2.68 s | 3.44 s, 2.68 s, 2.63 s | 11 MB | 652 MB | 12 MB | 275 ms (91 ms laying out), 2 KB + a page image per page viewed, 3 pages (timed from Darwin arm64, not from a Hugging Face Jobs cpu-xl machine as the other rows) |
| OnlyOffice (CryptPad build) | 3.50 s | 3.23 s, 3.74 s, 3.50 s | 45 MB | 699 MB | 18 MB | no server route: its converter is built without the renderer, and drawing needs the editor in a browser |
| GenOffice (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.7, on 12 cores) | 1.52 s | 1.49 s, 1.52 s, 2.94 s | 18 MB | 517 MB | 5.4 MB | no server route: it is a desktop application's window, drawn in a browser |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 5.4, highest 5.5, on 12 cores) | 1.64 s | 2.52 s, 1.29 s, 1.64 s | 6.5 MB | 771 MB | 441 KB | 289 ms (56 ms rendering), 9 KB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.7, on 12 cores) | 1.30 s | 1.44 s, 1.08 s, 1.30 s | 5.2 MB | 349 MB | 933 KB | 323 ms (101 ms rendering), 28 KB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 5.4, highest 5.5, on 12 cores) | 1.39 s | 1.33 s, 41.9 s, 1.39 s | 9.6 MB | 394 MB | 961 KB | 312 ms (73 ms rendering), 17 KB |

**500 pages (`lorem-500.docx`)**

Measured 2026-11-21: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 47.3, highest 100.0, on 64 cores.

| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| canvas-editor | 43.4 s | 30.7 s, 43.4 s, 47.5 s | 679 MB | 6248 MB | 1.0 MB | no server route: it measures and paints on a browser canvas |
| Docxodus | 16.1 s | failed, 15.1 s, 17.0 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/docxodus?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-) | 8.3 MB | 1076 MB | 7.5 MB | 3.19 s (2.86 s rendering), 2.1 MB |
| SuperDoc | 21.0 s | 21.0 s, 18.4 s, 24.8 s | 16 MB | 1007 MB | 8.2 MB | 6.12 s (5.59 s rendering), 1.6 MB |
| Plate | 97.9 s | failed, 85.4 s, 110.5 s (failed: not rendered within 240s) | 64 MB | 594 MB | 1.5 MB | 963 ms (646 ms rendering), 2.0 MB |
| docen | 9.13 s | failed, 8.34 s, 9.91 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/docen?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-doc) | 127 MB | 3809 MB | 1.8 MB | 971 ms (550 ms rendering), 4.8 MB, 623 pages |
| docx-editor.dev | 6.65 s | failed, 6.73 s, 6.57 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/eigenpal?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-) | 120 MB | 690 MB | 5.4 MB | **failed**: this document is too large for this engine's server render (its text and structure unpack to 1.8 MB; the limit is 1.0 MB): larger ones end the server process. O |
| folio | 5.34 s | failed, 5.67 s, 5.00 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/folio?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2Fopen-doc) | 43 MB | 1007 MB | 2.5 MB | 3.80 s (3.03 s rendering), 29 MB, 500 pages |
| WordCraft | 6.95 s | 6.29 s, 6.95 s, 7.68 s | 3.3 MB | 885 MB | 22 MB | 923 ms (671 ms laying out), 367 KB + a page image per page viewed, 550 pages |
| Microsoft Word viewer | 1.65 s (frame load) | 1.42 s, 1.86 s, 1.65 s | n/a | 687 MB | 1.1 MB | rendered on Microsoft's servers |
| Google Docs viewer | 4.83 s (frame load) | failed, 8.36 s, 1.30 s (failed: Error: Page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://viewers.benchmarks.law/v/google-viewer?src=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Farthrod%2F) | n/a | 605 MB | 1.1 MB | rendered on Google's servers |
| Apryse WebViewer | 5.47 s | 3.58 s, 5.47 s, 8.07 s | 23 MB | 971 MB | 7.4 MB | no server route: Apryse renders on a server with a native SDK |
| Nutrient | 20.7 s | 16.7 s, 20.7 s, 21.0 s | 19 MB | 666 MB | 25 MB | no server route: Nutrient renders on a server with a Docker service |
| react-docx | 14.7 s | 11.2 s, 18.4 s, 14.7 s | 98 MB | 906 MB | 7.3 MB | no server route: it breaks pages by measuring text in the browser |
| Univer | 27.5 s | 23.9 s, 33.6 s, 27.5 s | 879 MB | 2357 MB | 3.0 MB | no server route: no .docx reader, and its layout measures text on a canvas |
| OpenDoc | 6.40 s | 4.87 s, 6.40 s, 6.60 s | 12 MB | 901 MB | 21 MB | 1.57 s (1.33 s laying out), 331 KB + a page image per page viewed, 500 pages (timed from Darwin arm64, not from a Hugging Face Jobs cpu-xl machine as the other rows) |
| BetterOffice | 8.98 s | 8.25 s, 8.98 s, 9.92 s | 17 MB | 1235 MB | 11 MB | 3.97 s (3.68 s laying out), 143 KB + a page image per page viewed, 500 pages (timed from Darwin arm64, not from a Hugging Face Jobs cpu-xl machine as the other rows) |
| OnlyOffice (CryptPad build) | 14.4 s | 13.5 s, 14.4 s, 15.9 s | 128 MB | 908 MB | 19 MB | no server route: its converter is built without the renderer, and drawing needs the editor in a browser |
| GenOffice (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.3, highest 3.8, on 12 cores) | 1.68 s | 1.71 s, 1.60 s, 1.68 s | 39 MB | 1120 MB | 5.7 MB | no server route: it is a desktop application's window, drawn in a browser |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.3, highest 3.8, on 12 cores) | 1.62 s | 1.62 s, 1.28 s, 1.70 s | 5.3 MB | 1028 MB | 819 KB | 513 ms (131 ms rendering), 1.6 MB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.3, highest 3.8, on 12 cores) | 1.13 s | 1.04 s, 1.13 s, 1.38 s | 6.7 MB | 438 MB | 1.2 MB | 632 ms (222 ms rendering), 1.6 MB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.3, highest 3.8, on 12 cores) | 1.39 s | 1.49 s, 1.39 s, 1.38 s | 13 MB | 558 MB | 1.3 MB | 715 ms (316 ms rendering), 1.6 MB |
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
such a mode. They are in the browser tables since the measuring pass of the same day, in the
Lighthouse tables since 2026-11-20, and in the [arena](https://arena.benchmarks.law) since
2026-11-20. OpenDoc and BetterOffice have a server route since 2026-11-21; the other three have none: see [why](#no-server-route-and-why).

| Engine | View-only here | Notes |
| --- | --- | --- |
| [react-docx](https://viewers.benchmarks.law/v/react-docx) | its `read-only` mode | Rust WASM reader, DOM pages |
| [BetterOffice](https://viewers.benchmarks.law/v/betteroffice) | `readOnly` (no toolbar or rulers) | Rust WASM engines in a Worker |
| [OpenDoc](https://viewers.benchmarks.law/v/opendoc) | its review mode "viewing" | its own application, a snapshot of 2026-11-05, in a frame |
| [OnlyOffice (CryptPad build)](https://viewers.benchmarks.law/v/onlyoffice) | `mode: "view"` | no document server: x2t converter in WASM; AGPL-3.0, [source and offer](https://github.com/arthrod/open-docs/tree/main/editors/onlyoffice) |
| [GenOffice](https://viewers.benchmarks.law/v/genoffice) | none: its demo build has no read-only mode, so it is still editable here | the editors trial's demo build of its Docs application, in a frame |
| [office-open](https://viewers.benchmarks.law/v/office-open) | nothing to edit | a library with no editor: an outline of what its parser read |
| [Fidus Writer](https://viewers.benchmarks.law/v/fidus-writer) | none: its demo build has no read-only mode, so it is still editable here | the editors trial's demo build of its document library, in a frame |
| [docs.plus](https://viewers.benchmarks.law/v/docs-plus) | none: its demo build has no read-only mode, so it is still editable here | the editors trial's demo build of its editor, in a frame |
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
| `opendoc` | OpenDoc | `@casualoffice/opendoc-viewer` 0.1.0-alpha.1: OpenDoc's own reader, pagination and rasteriser in wasm, SHA-256-checked. It is an older build than the application the browser page shows, and it draws a redline as the accepted text. Fonts are fetched from the engine's repository at the commit the package was published from (the package names them and does not ship them). `/r/opendoc/page` rasterises a page when the browser asks for its image | PNG page images, one request per page viewed |
| `betteroffice` | BetterOffice | `@betteroffice/docx` 0.5.1: its headless layout, its display list and its own painter. The painter only draws on a browser canvas, so it draws on a canvas of ours that writes SVG ([`server/svg-canvas.ts`](server/svg-canvas.ts)); the text it sends as canvas text (list markers, small capitals, leaders) is outlined from its bundled fonts. The route uses entry points the package does not document, pinned to this version. `/r/betteroffice/page` draws a page when asked | SVG page images, one request per page viewed |
| `office-open` | office-open | `@office-open/docx` 0.15.3 `parseDocument`, drawn as an outline by the same code as its browser page (copied from the editors trial). The library has no renderer, so there is no layout | HTML, no pages |
| `fidus-writer` | Fidus Writer | `@fiduswriter/document` 0.3.40: its `DocxConvert` importer, then its own schema's `toDOM` rules run by ProseMirror's DOMSerializer into a linkedom document (a few rules build on the global `document`, which is linkedom's for the length of the call) | HTML, one flowing page |
| `docs-plus` | docs.plus | docs.plus's own server conversion code at `a9b0c69` (`importDocx`: mammoth into its Tiptap document), bundled alone into `server/docs-plus-lib.js`, then its render schema run by ProseMirror's DOMSerializer. Its logger and metrics are replaced by stand-ins | HTML, one flowing page |

### No server route, and why

A server route runs the engine inside this Val: Deno, with WebAssembly and JavaScript, and no DOM, no canvas, no
native binaries and no subprocesses. Seven engines have only the browser page (eight rows below: cite-check is an
application on canvas-editor). For each of them a route would mean
faking a browser or running native code. OpenDoc and BetterOffice were on this list as "possible, not built"
until 2026-11-21; both now have a route (above). office-open, Fidus Writer and docs.plus, added to the editors
site that day, got their routes the same day; GenOffice, a desktop application's window, needs a browser. The Microsoft Word viewer and the Google Docs viewer are not
in the list: each always renders on its owner's servers, and there is no engine of theirs to run here. The
landing page shows the same list, and every "Server render" cell above that has no figure says its reason in
short ([`server/no-server.json`](server/no-server.json) is the one source).

<!-- no-server:start -->
| Engine | Kind | Why there is no server route |
| --- | --- | --- |
| canvas-editor | needs a browser | canvas-editor measures every character with a canvas 2D context and paints each page on a `<canvas>` it creates in the DOM. The package has no headless entry, so running it here would mean faking a browser. |
| cite-check | needs a browser | cite-check is an application built on canvas-editor, and draws through it: the same reason as canvas-editor. |
| Apryse WebViewer | needs native code | WebViewer is Apryse's browser product. Its server rendering is a native SDK and a Docker service (WebViewer Server); a Val runs neither native binaries nor subprocesses. |
| Nutrient | needs native code | The Web SDK converts the .docx in the browser with a .NET engine in WebAssembly that it fetches from its own workers. Nutrient's server rendering is Document Engine, a Docker service; a Val runs neither native binaries nor subprocesses. |
| react-docx | needs a browser | `@extend-ai/react-docx@0.15.0` exports browser entries only (`.`, `./vanilla`, `./internal`). Its Rust parser in WebAssembly needs no DOM, but pagination measures text with a canvas `measureText` and with laid-out elements (`getBoundingClientRect`), and its page-image renderer throws "DOCX thumbnails require a browser environment". A route could send the parsed text, but the page breaks would be ours, not its. |
| Univer | needs a browser | Univer's open-source packages cannot read a .docx (import and export are in its separately licensed Server SDK), so even in the browser this site hands it text and headings. Its layout (`@univerjs/engine-render@1.5.2`) takes text measurements from a canvas 2D context and has none without `document` or `OffscreenCanvas`. |
| OnlyOffice (CryptPad build) | needs a browser | CryptPad compiles x2t to WebAssembly with OnlyOffice's `doctrenderer` replaced by an empty stub, so it converts between formats but cannot lay out or draw: x2t sends PDF and HTML output through that renderer. Pages are drawn by the editor's JavaScript (sdkjs) on a browser canvas. OnlyOffice's own server rendering is the native Document Server or Document Builder, which a Val cannot run. |
| GenOffice | needs a browser | GenOffice's Docs application is an Electron renderer: a React application that lays out its pages in the DOM, shown on editors.benchmarks.law with a stand-in for the desktop it expects. It has no headless entry, so running it here would mean faking a browser. |
<!-- no-server:end -->

The reasons for the five engines added on 2026-11-18 were read from their published packages and sources on
2026-11-20 (file listings, type declarations, build files); OpenDoc's and BetterOffice's packages were then run
(2026-11-21) and each has a route; the reasons for the other three were read and not run. Also not offered: SuperDoc's **paginated** view
(its layout measures text through a browser canvas and paints into the DOM; its SDK wraps a native binary), which
is why its route sends the engine's unpaginated HTML.

Known gaps, stated rather than hidden:

- docen: headers and footers are not painted (`x-unpainted`), and its paginator puts the sample on 4 pages where
  the others use 3.
- Docxodus paginates by measuring laid-out text (its `PaginationEngine`; its `export-browser` package lays out in a
  frame). Deno has no layout engine, so the server does the conversion and the page runs Docxodus's `paginateHtml`
  once (`x-paginated-in: browser`; `Server-Timing` does not include it, ~65 ms in Chrome on the sample). That
  bundle is too large for a Val file: it is loaded from jsDelivr at a pinned commit of this repo, SRI-checked, and
  the page's CSP allows only that script and this Val's own (`scripts/build-dx-paginate.sh` rebuilds it).
- The page images of WordCraft, OpenDoc (PNG) and BetterOffice (SVG) are not in the page: the page is each page's size plus one image URL per page
  (`loading="lazy"`, no script), and a page is rasterised (WordCraft: about 0.2 s, about 200 KB; 330 KB for a dense screen)
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
  uses its own bundled faces, BetterOffice its own font package, and OpenDoc's route loads Carlito, Liberation Serif
  and Liberation Mono before the first layout.

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
  Page images (WordCraft, OpenDoc, BetterOffice) draw from a layout that is already kept without a turn; a layout that is not kept is
  made in a turn, one per document however many of its pages are asked for together.
- docx-editor.dev's route refuses a document whose `word/document.xml` is over 1 MB as the zip's directory
  declares it (`server/docx-size.ts`), with HTTP 422: its exporter ends the process on the 500-page sample
  (1.8 MB). Only 20 KB (renders) and 1.8 MB (ends the process) were tried, so the limit is a guard between the
  two, not a measured capacity. It is a guard for honest documents: a crafted zip can declare less than it holds
  (see "Not covered" above).

Two Deno workarounds, each scoped to one engine and commented in place:
`server/plate.ts` restores the `__proto__` setter mammoth needs (what `--unsafe-proto` does);
`server/docen.ts` supplies a 2D-canvas `measureText` because Deno's `OffscreenCanvas` has no 2D context.

### Figures to distrust

Every figure that stood far from its neighbours, or that the method cannot really measure, was looked at again
on 2026-11-20, by hand in Chrome on a Mac and with the measuring scripts. The two faults of the measuring were
then corrected and every browser table was taken again that night (the pass of 2026-11-20, on a `cpu-xl`
machine: see "Where" under Measuring). Each row below says what was found and what the new pass shows.

| Figure in the tables | Verdict | What was seen |
| --- | --- | --- |
| **canvas-editor, 500 pages: 1,256 MB of JS heap** (the tables of 2026-11-18) | **Was wrong by about 80%; corrected** | The heap was read 1.5 s after the page renders, before Chrome had collected the garbage of the conversion. The new pass forces a collection first: 679 MB in each of its three runs, 1,216 to 1,232 MB before the collection. |
| **JS heap, every engine** | **Was read too early; corrected** | The same reading, so any engine that converts the file in JavaScript was overstated by its garbage. `scripts/measure.py` and `scripts/measure_server_client.py` (the `/r/` tables) now force a collection first (`heapBytes`) and keep the old reading as `heapBytesBeforeGc`. In the new pass every run that rendered was collected (none carries `heapNotCollected`). Had one failed, it would be left out of the median while any run of the row was collected, and counted in the row. |
| **canvas-editor, 500 pages: 6,248 MB of renderer memory** | **This machine, not the engine** | With no GPU, Chrome keeps each of the 661 page canvases in the renderer's own memory. On a Mac with a GPU the same page read 2,410 MiB (2026-11-20). docen (3,809 MB) and Univer (2,357 MB) draw on canvases too. Compare these only with each other. |
| **Cold render on the 500 pages** | **Not "the document is ready" for two engines** | It ends two frames after the adapter's `load()` returns. docx-editor.dev's used to return at once (2.62 s on 2026-11-18, nearly all page start-up); its adapter now waits for the layout, and the new pass reads 6.65 s. docen answers after 9 s; on the editors site it then holds the main thread for minutes (not checked in its read-only mode here). OnlyOffice reports ready and goes on paginating to 500 pages after it. |
| **Univer, every row** | **Not a .docx figure** | Univer never reads the file: this site's reader hands it text and headings. Its heap on the 500 pages is 879 MB after a collection in each of the three runs (1,759 to 1,764 MB before it, which is what the tables of 2026-11-18 showed), and it is what Univer does with that text. |
| **OnlyOffice and BetterOffice: 5 and 4 failed runs of 18** (2026-11-18) | **Did not come back** | In the new pass OnlyOffice failed once in 9 runs ("Fonts are not loaded", on the showcase) and BetterOffice never. Why they failed so often on 2026-11-18 was not found. |
| **Rows that stand on fewer than three runs** | **Weak** | 14 of the 153 browser runs of the new pass did not render: 9 times the page answered an error status (most likely this site's rate limit, met by one machine loading engine after engine; the status itself was not recorded), 4 times nothing rendered within 240 s, once OnlyOffice reported its fonts missing. Twelve rows therefore stand on two runs, whose median is their mean, and canvas-editor's redline row on one. The Google Docs viewer's 4.83 s on the 500 pages is such a mean, of 8.36 s and 1.30 s. Each row's runs column shows it. |
| **Lighthouse, OnlyOffice and OpenDoc** | **Scores the wrong frame** | Both run their whole application in a frame inside the page. Lighthouse's blocking time and paint figures are the top page's, so their scores say little about the engine, as for Microsoft's and Google's viewers. |
| **Lighthouse, mobile LCP of 13 to 40 s beside desktop LCP of 3 to 7 s** | **Real, and about the phone** | Docxodus, folio, docx-editor.dev and SuperDoc: the emulated phone has a quarter of the CPU and slow 4G (about 1.6 Mbit/s), and these engines download 2 to 8 MB before they paint a page: Docxodus's 7.1 MB alone takes about 36 s on that line. |
| **cite-check** | **Not measured** | It is in the engine list (an application on canvas-editor), so the landing page gives it a row in every table; no pass has measured it. Its rows say so. |
| **Sizes** | **Mislabelled** | Every "MB" in these tables is a mebibyte (1,048,576 bytes). "Downloaded" is bytes over the network (compressed); the editors site's "Loaded" is decoded bytes, so the two do not compare. |

### What the browser pays for a server render

<!-- server-client:start -->
Measured 2026-11-21: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from Darwin arm64; machine load (1-minute average) median 9.1, highest 11.0, on 12 cores. Loaded = navigation start to the end of the load event (server render and download included).

**Rich sample (`showcase.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 1.32 s | 1.03 s, 1.43 s, 1.32 s | 1.18 s | 1.6 MB | 365 MB | 927 | 60 KB |
| folio (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 591 ms | 591 ms, 707 ms, 490 ms | 532 ms | 956 KB | 360 MB | 480 | 156 KB |
| docx-editor.dev (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 988 ms | 807 ms, 1.03 s, 988 ms | 1.08 s | 1.0 MB | 375 MB | 1,048 | 1.3 MB |
| Plate (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 388 ms | 310 ms, 388 ms, 575 ms | 444 ms | 1022 KB | 343 MB | 462 | 14 KB |
| docen (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 388 ms | 418 ms, 381 ms, 388 ms | 340 ms | 948 KB | 372 MB | 303 | 1.1 MB |
| WordCraft (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 598 ms | 710 ms, 598 ms, 586 ms | 280 ms | 957 KB | 358 MB | 40 | 175 KB |
| SuperDoc (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 839 ms | 675 ms, 839 ms, 904 ms | 884 ms | 1016 KB | 343 MB | 233 | 3 KB |
| OpenDoc | 442 ms | 442 ms, 439 ms, 461 ms | 280 ms | 959 KB | 284 MB | 40 | 378 KB |
| BetterOffice | 541 ms | 765 ms, 541 ms, 534 ms | 436 ms | 959 KB | 296 MB | 5,068 | 76 KB |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 362 ms | 362 ms, 244 ms, 619 ms | 420 ms | 1019 KB | 279 MB | 175 | 4 KB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 408 ms | 611 ms, 313 ms, 408 ms | 460 ms | 1.0 MB | 277 MB | 182 | 11 KB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 283 ms | 631 ms, 283 ms, 270 ms | 348 ms | 1.0 MB | 286 MB | 228 | 11 KB |
| Microsoft Word viewer (rendered on Microsoft's servers; `/v/` frame load) | 792 ms | 1.26 s, 745 ms, 792 ms | n/a | n/a | 864 MB | n/a | 1.7 MB |
| Google Docs viewer (rendered on Google's servers; `/v/` frame load) | 1.20 s | 1.20 s, 1.36 s, 1.13 s | n/a | n/a | 589 MB | n/a | 1.1 MB |

**Redline (`redline.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 945 ms | 1.09 s, 857 ms, 945 ms | 620 ms | 1.6 MB | 365 MB | 1,237 | 61 KB |
| folio (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 523 ms | 437 ms, 566 ms, 523 ms | 532 ms | 956 KB | 362 MB | 663 | 159 KB |
| docx-editor.dev (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 871 ms | 798 ms, 871 ms, 898 ms | 944 ms | 1.0 MB | 376 MB | 1,266 | 1.3 MB |
| Plate (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 363 ms | 326 ms, 434 ms, 363 ms | 412 ms | 1022 KB | 343 MB | 722 | 14 KB |
| docen (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 430 ms | 430 ms, 479 ms, 309 ms | 284 ms | 948 KB | 371 MB | 449 | 1.1 MB |
| WordCraft (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 641 ms | 641 ms, 666 ms, 608 ms | 296 ms | 957 KB | 354 MB | 40 | 210 KB |
| SuperDoc (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 913 ms | 913 ms, 1.04 s, 835 ms | 956 ms | 1016 KB | 342 MB | 351 | 4 KB |
| OpenDoc | 423 ms | 306 ms, 472 ms, 423 ms | 308 ms | 959 KB | 284 MB | 40 | 404 KB |
| BetterOffice | 513 ms | 513 ms, 457 ms, 570 ms | 380 ms | 959 KB | 300 MB | 6,661 | 86 KB |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 294 ms | 308 ms, 294 ms, 248 ms | 352 ms | 1019 KB | 280 MB | 179 | 4 KB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 331 ms | 445 ms, 331 ms, 301 ms | 388 ms | 1.0 MB | 277 MB | 193 | 11 KB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 433 ms | 433 ms, 438 ms, 286 ms | 496 ms | 1.0 MB | 287 MB | 235 | 11 KB |
| Microsoft Word viewer (rendered on Microsoft's servers; `/v/` frame load) | 582 ms | 547 ms, 582 ms, 620 ms | n/a | n/a | 963 MB | n/a | 1.6 MB |
| Google Docs viewer (rendered on Google's servers; `/v/` frame load) | 1.15 s | 1.38 s, 1.09 s, 1.15 s | n/a | n/a | 585 MB | n/a | 1.1 MB |

**500 pages (`lorem-500.docx`)**

| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Docxodus (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 16.4 s | 16.4 s, 15.5 s, 17.7 s | 3.32 s | 2.6 MB | 847 MB | 32,490 | 575 KB |
| folio (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 8.48 s | 8.48 s, 7.77 s, 8.54 s | 5.08 s | 961 KB | 604 MB | 93,499 | 1.7 MB |
| docx-editor.dev (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | **failed**: HTTP 422 | failed, failed, failed | | | | | |
| Plate (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 1.49 s | 1.43 s, 1.49 s, 1.64 s | 1.19 s | 1017 KB | 404 MB | 15,417 | 508 KB |
| docen (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 7.25 s | 7.37 s, 6.72 s, 7.25 s | 2.03 s | 965 KB | 1779 MB | 36,968 | 1.1 MB |
| WordCraft (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 2.08 s | 2.25 s, 2.01 s, 2.08 s | 1.62 s | 972 KB | 360 MB | 1,134 | 388 KB |
| SuperDoc (measured 2026-11-21: from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 41.2, highest 46.5, on 64 cores) | 5.99 s | 5.99 s, 6.11 s, 5.57 s | 5.78 s | 1016 KB | 400 MB | 6,527 | 446 KB |
| OpenDoc | 1.87 s | 1.83 s, 1.93 s, 1.87 s | 1.62 s | 959 KB | 291 MB | 1,034 | 1.1 MB |
| BetterOffice | 4.32 s | 4.32 s, 4.02 s, 4.57 s | 4.02 s | 959 KB | 328 MB | 18,509 | 66 KB |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 498 ms | 771 ms, 400 ms, 498 ms | 468 ms | 1015 KB | 345 MB | 6,194 | 450 KB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 509 ms | 509 ms, 466 ms, 564 ms | 504 ms | 1020 KB | 339 MB | 6,181 | 449 KB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.1, highest 3.8, on 12 cores) | 698 ms | 1.34 s, 698 ms, 679 ms | 648 ms | 1020 KB | 340 MB | 6,177 | 445 KB |
| Microsoft Word viewer (rendered on Microsoft's servers; `/v/` frame load) | 1.65 s | 1.42 s, 1.86 s, 1.65 s | n/a | n/a | 687 MB | n/a | 1.1 MB |
| Google Docs viewer (rendered on Google's servers; `/v/` frame load) | 4.83 s | failed, 8.36 s, 1.30 s | n/a | n/a | 605 MB | n/a | 1.1 MB |
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
| Microsoft Word viewer | 96 · 96 | 218 ms · 772 ms | 0 ms · 0 ms | 0.086 · 0 | 218 ms · 772 ms | 1.57 s · 4.99 s | 100 | 73 | 90 | 96/97/99/93/96 · 95/96/99/97/95 |
| Google Docs viewer | 98 · 97 | 220 ms · 789 ms | 61 ms · 109 ms | 0.003 · 0 | 220 ms · 789 ms | 1.31 s · 3.66 s | 100 | 58 | 90 | 93/99/fail/98/99 · 94/98/fail/100/96 (desktop: PageSpeed gave no result within 240 s: the page never finished loading for it; mobile: PageSpeed gave no result within 240 s: the page never finished loading for it) |
| react-docx (measured 2026-11-20) | 57 · 62 | 6.22 s · 37.7 s | 403 ms · 371 ms | 0.001 · 0 | 218 ms · 764 ms | 1.26 s · 5.08 s | 96 | 100 | 91 | 57/97/68/46/56 · 63/56/63/62/59 |
| Univer (measured 2026-11-20) | 85 · 83 | 447 ms · 1.66 s | 260 ms · 388 ms | 0.006 · 0.003 | 447 ms · 1.66 s | 2.27 s · 7.38 s | 83 | 100 | 90 | 85/89/90/73/77 · 86/83/90/78/80 |
| OpenDoc (measured 2026-11-20) | 66 · 69 | 227 ms · 773 ms | 382 ms · 939 ms | 0.195 · 0.054 | 227 ms · 773 ms | 3.06 s · 12.2 s | 100 | 100 | 90 | 64/75/67/56/66 · 69/71/71/64/66 |
| BetterOffice (measured 2026-11-20) | 92 · 71 | 1.27 s · 6.51 s | 96 ms · 129 ms | 0.001 · 0 | 413 ms · 1.51 s | 1.82 s · 5.67 s | 100 | 100 | 90 | 92/94/92/90/96 · 69/72/71/69/74 |
| OnlyOffice (CryptPad build) (measured 2026-11-20) | 100 · 100 | 217 ms · 771 ms | 0 ms · 0 ms | 0.002 · 0 | 217 ms · 771 ms | 417 ms · 1.36 s | 100 | 96 | 90 | 100/100/100/100/100 · 100/100/100/100/100 |
| GenOffice (measured 2026-11-21) | 74 · 71 | 218 ms · 774 ms | 324 ms · 772 ms | 0.149 · 0.103 | 218 ms · 774 ms | 2.67 s · 7.71 s | 100 | 96 | 90 | 74/71/79/63/82 · 71/68/71/69/74 |
| office-open (measured 2026-11-21) | 71 · 57 | 215 ms · 768 ms | 1.02 s · 1.46 s | 0.001 · 0.349 | 215 ms · 768 ms | 1.20 s · 2.68 s | 100 | 100 | 90 | 77/71/70/70/72 · 66/57/57/57/57 |
| Fidus Writer (measured 2026-11-21) | 98 · 94 | 213 ms · 767 ms | 32 ms · 286 ms | 0.008 · 0.026 | 213 ms · 767 ms | 1.12 s · 2.30 s | 100 | 100 | 90 | 96/98/100/99/93 · 93/96/90/94/100 |
| docs.plus (measured 2026-11-21) | 98 · 90 | 214 ms · 766 ms | 72 ms · 352 ms | 0.001 · 0 | 214 ms · 766 ms | 1.33 s · 3.51 s | 100 | 100 | 90 | 98/91/99/97/99 · 89/90/82/91/98 |

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
| OpenDoc (measured 2026-11-21) | 100 · 87 | 557 ms · 4.05 s | 0 ms · 0 ms | 0 · 0 | 242 ms · 788 ms | 365 ms · 920 ms | 97 | 100 | 91 | 100/100/100/100/100 · 87/87/87/87/94 |
| BetterOffice (measured 2026-11-21) | 100 · 100 | 303 ms · 1.22 s | 0 ms · 0 ms | 0 · 0 | 229 ms · 778 ms | 304 ms · 1.04 s | 97 | 100 | 91 | fail/100/100/100/100 · fail/100/100/100/100 (desktop: PageSpeed refused the address: Unable to resolve https://viewers.benchmarks.law/r/betteroffice. Try checking the URL for validity.; mobile: PageSpeed refused the address: Unable to resolve https://viewers.benchmarks.law/r/betteroffice. Try checking the URL for validity.) |
| office-open (measured 2026-11-21) | 100 · 100 | 213 ms · 762 ms | 0 ms · 0 ms | 0 · 0 | 213 ms · 762 ms | 241 ms · 763 ms | 97 | 100 | 90 | 100/100/100/100/100 · 100/100/100/100/100 |
| Fidus Writer (measured 2026-11-21) | 100 · 100 | 211 ms · 766 ms | 0 ms · 0 ms | 0 · 0 | 211 ms · 766 ms | 275 ms · 766 ms | 89 | 100 | 82 | 100/100/100/100/100 · 100/100/100/100/100 |
| docs.plus (measured 2026-11-21) | 100 · 100 | 213 ms · 761 ms | 0 ms · 0 ms | 0 · 0 | 213 ms · 761 ms | 273 ms · 761 ms | 91 | 100 | 82 | 100/100/100/100/100 · 100/100/100/100/100 |

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
| Microsoft Word viewer | 95 · 98 | 221 ms · 774 ms | 0 ms · 0 ms | 0.003 · 0 | 221 ms · 774 ms | 2.01 s · 4.36 s | 100 | 73 | 90 | 93/100/96/95/93 · 98/98/96/100/97 |
| Google Docs viewer | 96 · 95 | 220 ms · 774 ms | 165 ms · 156 ms | 0.002 · 0 | 220 ms · 774 ms | 1.28 s · 3.50 s | 100 | 58 | 90 | 84/100/91/96/98 · 100/100/95/95/95 |
| react-docx (measured 2026-11-20) | 39 · 36 | 6.63 s · 39.7 s | 2.43 s · 2.81 s | 0.001 · 0 | 215 ms · 774 ms | 2.85 s · 11.3 s | 96 | 100 | 90 | 38/40/39/43/36 · 36/41/36/41/35 |
| Univer (measured 2026-11-20) | n/a · 59 | n/a · 1.68 s | n/a · 10.4 s | n/a · 0.003 | n/a · 1.68 s | n/a · 16.8 s | n/a | n/a | n/a | fail/fail/fail/fail/fail · fail/59/fail/fail/fail (desktop: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.; mobile: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.) |
| OpenDoc (measured 2026-11-20) | 51 · 60 | 217 ms · 789 ms | 8.73 s · 16.4 s | 0.192 · 0.054 | 217 ms · 789 ms | 7.48 s · 30.5 s | 100 | 100 | 90 | 51/51/51/fail/51 · 60/fail/60/fail/fail (desktop: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.; mobile: PAGE_HUNG: Lighthouse was unable to reliably load the URL you requested because the page stopped responding.) |
| BetterOffice (measured 2026-11-20) | 90 · 69 | 1.58 s · 8.59 s | 0 ms · 0 ms | 0.001 · 0 | 423 ms · 1.51 s | 2.17 s · 6.25 s | 100 | 100 | 90 | 90/91/85/90/92 · 67/71/65/69/72 |
| OnlyOffice (CryptPad build) (measured 2026-11-20) | 100 · 100 | 216 ms · 768 ms | 0 ms · 0 ms | 0.002 · 0 | 216 ms · 768 ms | 597 ms · 1.03 s | 100 | 96 | 90 | 100/100/100/100/100 · 100/100/100/100/98 |
| GenOffice (measured 2026-11-21) | **no result**: PageSpeed refused the address: Oops! Something went wrong. | | | | | | | | | fail/fail/fail/fail/fail · fail/fail/fail/fail/fail |
| office-open (measured 2026-11-21) | 68 · 56 | 213 ms · 765 ms | 1.05 s · 1.30 s | 0.001 · 0.349 | 213 ms · 765 ms | 1.77 s · 4.18 s | 100 | 100 | 90 | 68/68/68/71/68 · 56/58/53/58/56 |
| Fidus Writer (measured 2026-11-21) | 91 · 79 | 213 ms · 765 ms | 220 ms · 694 ms | 0.007 · 0.026 | 213 ms · 765 ms | 1.50 s · 4.89 s | 100 | 100 | 90 | 81/91/91/94/73 · 77/94/79/89/72 |
| docs.plus (measured 2026-11-21) | 67 · 69 | 212 ms · 762 ms | 1.36 s · 1.96 s | 0.001 · 0 | 212 ms · 762 ms | 1.93 s · 5.65 s | 100 | 100 | 90 | 67/69/67/67/68 · 69/71/67/69/66 |

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
| OpenDoc (measured 2026-11-21) | 92 · 75 | 946 ms · 7.99 s | 0 ms · 0 ms | 0 · 0 | 310 ms · 872 ms | 3.31 s · 4.19 s | 97 | 100 | 91 | 90/99/88/94/fail · fail/75/80/75/65 (desktop: FAILED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested. Make sure you are testing the correct URL and that the server is properl; mobile: FAILED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested. Make sure you are testing the correct URL and that the server is properl) |
| BetterOffice (measured 2026-11-21) | 91 · 90 | 366 ms · 1.18 s | 0 ms · 76 ms | 0 · 0 | 242 ms · 800 ms | 4.60 s · 12.5 s | 97 | 100 | 83 | 78/91/94/91/93 · 82/93/90/93/78 |
| office-open (measured 2026-11-21) | 99 · 85 | 807 ms · 3.32 s | 0 ms · 0 ms | 0 · 0 | 807 ms · 3.32 s | 892 ms · 3.32 s | 100 | 100 | 90 | 99/99/98/98/99 · 86/85/85/86/83 |
| Fidus Writer (measured 2026-11-21) | 99 · 86 | 799 ms · 3.29 s | 0 ms · 10 ms | 0 · 0 | 799 ms · 3.29 s | 913 ms · 3.29 s | 97 | 100 | 90 | 99/97/99/99/99 · 86/82/85/86/86 |
| docs.plus (measured 2026-11-21) | 98 · 86 | 876 ms · 3.26 s | 0 ms · 0 ms | 0 · 0 | 876 ms · 3.26 s | 1.20 s · 3.26 s | 100 | 100 | 90 | 98/98/98/95/97 · 86/86/85/86/86 |
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

#### Lighthouse on our computer

On Google's machines WordCraft and Nutrient do not start (their engines do not download there, and why is not
known), so they have no browser score above. The same Lighthouse release also runs here, on a computer that has a
graphics card, which Google's machines do not, and on every page, not only on those two (`scripts/measure_lighthouse_local.py` in the
[open-docs](https://github.com/arthrod/open-docs) repository, with `--out results/lighthouse-local.json`).
The price is that these figures depend on this computer and on what else it was doing: the heading gives its
load and Lighthouse's own reading of how fast its processor was during the analyses. Compare rows within these
tables, not with PageSpeed's.

<!-- lighthouse-local:start -->
Measured 2026-11-21: Lighthouse 13.6.0 run on a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card), Google Chrome 158.0.8127.36, headless, 3 analyses per page and form factor, median of those that gave a result; Lighthouse's CPU benchmark index median 4094, lowest 3542; machine load (1-minute average) median 6.4, highest 18.4, on 12 cores. Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.

**Browser pages (`/v/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 60 · 41 | 6.63 s · 38.6 s | 249 ms · 1.29 s | 0.001 · 0 | 337 ms · 901 ms | 2.58 s · 9.88 s | 95 | 100 | 91 | 58/60/61 · 41/41/41 |
| folio | 82 · 58 | 2.55 s · 13.4 s | 68 ms · 421 ms | 0.003 · 0 | 594 ms · 1.78 s | 1.93 s · 6.43 s | 92 | 100 | 82 | 82/82/85 · 58/58/58 |
| docx-editor.dev | 73 · 51 | 4.91 s · 27.9 s | 22 ms · 598 ms | 0.001 · 0 | 609 ms · 1.79 s | 2.03 s · 8.12 s | 100 | 100 | 90 | 73/72/73 · 51/51/51 |
| Plate | 93 · 75 | 1.72 s · 7.84 s | 0 ms · 97 ms | 0.002 · 0 | 317 ms · 837 ms | 382 ms · 1.62 s | 98 | 100 | 91 | 94/93/93 · 75/75/75 |
| docen (measured 2026-11-21: Lighthouse's CPU benchmark index median 4309, lowest 4240; machine load (1-minute average) median 2.9, highest 5.7, on 12 cores) | 87 · 85 | 2.08 s · 864 ms | 20 ms · 435 ms | 0.006 · 0.04 | 379 ms · 864 ms | 1.77 s · 4.85 s | 82 | 88 | 90 | 84/87/88 · 84/85/86 |
| WordCraft | 83 · 67 | 329 ms · 874 ms | 223 ms · 1.07 s | 0.003 · 0.02 | 329 ms · 874 ms | 8.53 s · 47.3 s | 94 | 96 | 90 | 83/82/83 · 67/68/67 |
| SuperDoc | 74 · 57 | 3.22 s · 17.3 s | 41 ms · 352 ms | 0.129 · 0.046 | 628 ms · 1.86 s | 1.95 s · 8.99 s | 94 | 100 | 90 | 74/72/75 · 57/57/98 |
| canvas-editor | 99 · 96 | 330 ms · 885 ms | 0 ms · 188 ms | 0.075 · 0.056 | 330 ms · 885 ms | 704 ms · 3.02 s | 94 | 100 | 80 | 99/99/100 · 96/100/96 |
| Apryse WebViewer (measured 2026-11-21: Lighthouse's CPU benchmark index median 4309, lowest 4240; machine load (1-minute average) median 2.9, highest 5.7, on 12 cores) | 96 · 73 | 328 ms · 845 ms | 18 ms · 681 ms | 0.009 · 0.086 | 328 ms · 845 ms | 2.05 s · 8.86 s | 100 | 96 | 90 | 96/100/96 · 73/71/77 |
| Nutrient | 62 · 57 | 2.41 s · 12.1 s | 66 ms · 426 ms | 0.582 · 0.02 | 312 ms · 862 ms | 1.73 s · 7.39 s | 100 | 100 | 91 | 62/62/63 · 57/57/57 |
| Microsoft Word viewer | 100 · 99 | 321 ms · 889 ms | 0 ms · 0 ms | 0.003 · 0.039 | 321 ms · 889 ms | 835 ms · 2.55 s | 100 | 73 | 90 | 100/100/98 · 99/100/99 |
| Google Docs viewer | 82 · 80 | 366 ms · 913 ms | 0 ms · 0 ms | 0.364 · 0.455 | 366 ms · 913 ms | 1.04 s · 2.80 s | 100 | 77 | 90 | 82/82/82 · 80/98/80 |
| react-docx | 75 · 64 | 6.34 s · 37.6 s | 14 ms · 390 ms | 0.001 · 0 | 240 ms · 771 ms | 1.15 s · 3.67 s | 96 | 100 | 91 | 74/75/75 · 64/65/63 |
| Univer | 97 · 90 | 512 ms · 1.63 s | 0 ms · 185 ms | 0.014 · 0.003 | 512 ms · 1.63 s | 1.78 s · 6.36 s | 83 | 100 | 90 | 97/97/98 · 90/91/90 |
| OpenDoc | 83 · 72 | 326 ms · 851 ms | 54 ms · 724 ms | 0.202 · 0.057 | 326 ms · 851 ms | 3.16 s · 13.9 s | 100 | 100 | 90 | 83/83/82 · 72/72/70 |
| BetterOffice (measured 2026-11-21: Lighthouse's CPU benchmark index median 4175, lowest 3849; machine load (1-minute average) median 9.4, highest 22.6, on 12 cores) | 95 · 76 | 1.39 s · 6.12 s | 0 ms · 0 ms | 0.001 · 0 | 588 ms · 1.65 s | 1.47 s · 3.57 s | 100 | 100 | 90 | 93/95/95 · 75/76/99 |
| OnlyOffice (CryptPad build) | 84 · 62 | 269 ms · 806 ms | 200 ms · 1.70 s | 0.047 · 0.077 | 269 ms · 806 ms | 5.72 s · 26.9 s | 96 | 96 | 90 | 79/84/100 · 63/62/62 |
| GenOffice (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 89 · 81 | 241 ms · 774 ms | 8 ms · 433 ms | 0.149 · 0.103 | 241 ms · 774 ms | 2.24 s · 6.25 s | 100 | 96 | 90 | 89/89/90 · 82/79/81 |
| office-open (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 98 · 62 | 301 ms · 849 ms | 134 ms · 930 ms | 0.001 · 0.348 | 301 ms · 849 ms | 843 ms · 2.00 s | 100 | 100 | 90 | 98/96/98 · 62/62/62 |
| Fidus Writer (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 100 · 100 | 233 ms · 775 ms | 0 ms · 66 ms | 0.007 · 0.03 | 233 ms · 775 ms | 704 ms · 1.73 s | 100 | 100 | 90 | 100/100/100 · 100/100/100 |
| docs.plus (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 100 · 99 | 300 ms · 836 ms | 0 ms · 111 ms | 0.001 · 0 | 300 ms · 836 ms | 1.10 s · 2.98 s | 100 | 100 | 90 | 99/100/100 · 98/99/99 |

**Server-rendered pages (`/r/`), rich sample**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 99 · 99 | 636 ms · 1.97 s | 0 ms · 14 ms | 0 · 0 | 379 ms · 1.01 s | 1.16 s · 1.71 s | 90 | 96 | 83 | 99/99/99 · 99/99/99 |
| folio | 96 · 100 | 1.17 s · 1.11 s | 0 ms · 0 ms | 0 · 0 | 831 ms · 1.11 s | 1.12 s · 1.11 s | 70 | 96 | 75 | 96/98/96 · 100/100/100 |
| docx-editor.dev | 88 · 97 | 1.95 s · 2.17 s | 0 ms · 0 ms | 0.005 · 0 | 1.12 s · 2.17 s | 1.33 s · 2.17 s | 92 | 96 | 82 | 84/95/88 · 96/97/97 |
| Plate | 100 · 100 | 552 ms · 926 ms | 0 ms · 0 ms | 0 · 0 | 552 ms · 926 ms | 665 ms · 926 ms | 96 | 96 | 83 | 100/100/100 · 100/100/100 |
| docen | 98 · 100 | 1.15 s · 882 ms | 0 ms · 0 ms | 0 · 0 | 553 ms · 882 ms | 711 ms · 882 ms | 97 | 96 | 82 | 98/98/96 · 100/100/100 |
| WordCraft | 100 · 98 | 427 ms · 2.30 s | 0 ms · 0 ms | 0 · 0 | 270 ms · 975 ms | 577 ms · 1.19 s | 97 | 96 | 83 | 99/100/100 · 99/98/98 |
| SuperDoc | 97 · 100 | 918 ms · 1.03 s | 0 ms · 0 ms | 0 · 0 | 918 ms · 1.03 s | 1.30 s · 1.25 s | 98 | 96 | 82 | 97/97/97 · 100/100/100 |
| OpenDoc (measured 2026-11-21: Lighthouse's CPU benchmark index median 4309, lowest 4240; machine load (1-minute average) median 2.9, highest 5.7, on 12 cores) | 100 · 87 | 590 ms · 4.10 s | 0 ms · 0 ms | 0 · 0 | 275 ms · 805 ms | 457 ms · 808 ms | 97 | 96 | 83 | 100/100/100 · 87/87/87 |
| BetterOffice (measured 2026-11-21: Lighthouse's CPU benchmark index median 4206, lowest 4146; machine load (1-minute average) median 2.4, highest 2.8, on 12 cores) | 100 · 100 | 358 ms · 1.25 s | 0 ms · 0 ms | 0 · 0 | 281 ms · 802 ms | 825 ms · 804 ms | 97 | 96 | 83 | 100/100/100 · 100/100/100 |
| office-open (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 100 · 100 | 356 ms · 905 ms | 0 ms · 0 ms | 0 · 0 | 356 ms · 905 ms | 363 ms · 905 ms | 97 | 96 | 82 | 100/100/100 · 100/100/100 |
| Fidus Writer (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 100 · 100 | 384 ms · 879 ms | 0 ms · 0 ms | 0 · 0 | 384 ms · 879 ms | 396 ms · 879 ms | 89 | 96 | 75 | 100/100/100 · 100/100/100 |
| docs.plus (measured 2026-11-21: Lighthouse's CPU benchmark index median 4274, lowest 4215; machine load (1-minute average) median 2.5, highest 4.3, on 12 cores) | 100 · 100 | 356 ms · 887 ms | 0 ms · 35 ms | 0 · 0 | 356 ms · 887 ms | 377 ms · 887 ms | 91 | 96 | 75 | 100/100/100 · 100/100/100 |

The 500-page tables: Measured 2026-11-21: Lighthouse 13.6.0 run on a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card), Google Chrome 158.0.8127.36, headless, 3 analyses per page and form factor, median of those that gave a result; Lighthouse's CPU benchmark index median 4105, lowest 3427; machine load (1-minute average) median 5.1, highest 22.9, on 12 cores. Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.

**Browser pages (`/v/`), 500 pages (`lorem-500.docx`)**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus | 35 · 35 | 7.44 s · 40.6 s | 3.35 s · 10.3 s | 0.001 · 0 | 429 ms · 943 ms | 7.52 s · 21.9 s | 96 | 100 | 90 | 35/36/35 · 35/35/35 |
| folio | 47 · 37 | 3.12 s · 16.5 s | 1.17 s · 4.70 s | 0.002 · 0 | 601 ms · 1.78 s | 2.52 s · 7.57 s | 96 | 100 | 91 | 46/47/49 · 37/37/36 |
| docx-editor.dev | 72 · 66 | 5.15 s · 1.86 s | 83 ms · 1.12 s | 0.001 · 0 | 608 ms · 1.86 s | 2.15 s · 9.34 s | 100 | 100 | 90 | 72/72/71 · 67/65/66 |
| Plate | 37 · 35 | 11.9 s · 19.6 s | 11.7 s · 17.4 s | 0.001 · 0 | 319 ms · 847 ms | 3.11 s · 16.9 s | 100 | 100 | 90 | 37/38/37 · 35/35/35 |
| docen (measured 2026-11-21: Lighthouse's CPU benchmark index median 4240, lowest 4190; machine load (1-minute average) median 2.2, highest 3.6, on 12 cores) | **no result**: Lighthouse stopped while waiting for the page and wrote no report | | | | | | | | | fail/fail/fail · fail/fail/fail |
| WordCraft (measured 2026-11-21: Lighthouse's CPU benchmark index median 4240, lowest 4190; machine load (1-minute average) median 2.2, highest 3.6, on 12 cores) | 60 · 60 | 309 ms · 850 ms | 2.52 s · 9.97 s | 0.002 · 0.02 | 309 ms · 850 ms | 7.77 s · 38.1 s | 94 | 96 | 90 | 100/60/60 · 60/60/60 |
| SuperDoc (measured 2026-11-21: Lighthouse's CPU benchmark index median 4240, lowest 4190; machine load (1-minute average) median 2.2, highest 3.6, on 12 cores) | 75 · 64 | 3.43 s · 19.5 s | 34 ms · 329 ms | 0.129 · 0 | 565 ms · 1.81 s | 1.35 s · 4.61 s | 94 | 100 | 90 | 75/76/75 · 64/64/60 |
| canvas-editor (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 60 · 60 | 332 ms · 932 ms | 5.05 s · 10.4 s | 0.07 · 0.008 | 332 ms · 932 ms | 3.93 s · 21.5 s | 94 | 100 | 80 | 60/60/60 · 60/60/60 |
| Apryse WebViewer | 95 · 70 | 337 ms · 880 ms | 19 ms · 794 ms | 0.009 · 0.086 | 337 ms · 880 ms | 2.42 s · 10.1 s | 100 | 96 | 90 | 95/95/93 · 71/70/70 |
| Nutrient | 97 · 83 | 317 ms · 876 ms | 65 ms · 398 ms | 0.002 · 0.02 | 317 ms · 876 ms | 1.86 s · 7.21 s | 100 | 100 | 90 | 97/96/97 · 83/83/84 |
| Microsoft Word viewer | 98 · 98 | 372 ms · 910 ms | 0 ms · 0 ms | 0.087 · 0.039 | 372 ms · 910 ms | 1.23 s · 3.87 s | 100 | 73 | 90 | 98/98/97 · 98/98/99 |
| Google Docs viewer | 78 · 98 | 375 ms · 870 ms | 0 ms · 32 ms | 0.364 · 0.085 | 375 ms · 870 ms | 2.16 s · 2.68 s | 100 | 77 | 90 | 78/82/77 · 98/98/98 |
| react-docx | 42 · 37 | 6.63 s · 39.7 s | 1.21 s · 5.70 s | 0.001 · 0 | 232 ms · 772 ms | 2.17 s · 8.18 s | 96 | 100 | 90 | 42/42/42 · 37/37/37 |
| Univer | 60 · 59 | 511 ms · 1.61 s | 3.60 s · 10.6 s | 0.006 · 0.003 | 511 ms · 1.61 s | 6.61 s · 17.6 s | 83 | 100 | 90 | 60/60/60 · 59/59/59 |
| OpenDoc | 52 · 60 | 314 ms · 849 ms | 1.77 s · 14.2 s | 0.19 · 0.045 | 314 ms · 849 ms | 4.25 s · 19.2 s | 100 | 100 | 90 | 52/52/52 · 60/60/60 |
| BetterOffice | 93 · 72 | 1.57 s · 8.17 s | 0 ms · 0 ms | 0.001 · 0 | 552 ms · 1.65 s | 1.28 s · 4.30 s | 100 | 100 | 90 | 92/93/94 · 72/73/70 |
| OnlyOffice (CryptPad build) (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 65 · 59 | 263 ms · 791 ms | 658 ms · 3.53 s | 0.046 · 0.075 | 263 ms · 791 ms | 7.01 s · 31.0 s | 96 | 96 | 90 | 65/65/65 · 59/59/59 |
| GenOffice (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 56 · 59 | 247 ms · 788 ms | 7.93 s · 12.2 s | 0.149 · 0.101 | 247 ms · 788 ms | 3.36 s · 9.23 s | 100 | 96 | 90 | 55/56/56 · 59/59/57 |
| office-open (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 84 · 55 | 319 ms · 848 ms | 358 ms · 1.93 s | 0.001 · 0.348 | 319 ms · 848 ms | 1.17 s · 2.52 s | 100 | 100 | 90 | 77/84/93 · 56/55/55 |
| Fidus Writer (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 99 · 94 | 262 ms · 772 ms | 0 ms · 264 ms | 0.007 · 0.03 | 262 ms · 772 ms | 1.18 s · 2.85 s | 100 | 100 | 90 | 99/100/99 · 94/96/93 |
| docs.plus (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 85 · 71 | 287 ms · 837 ms | 328 ms · 2.07 s | 0.001 · 0 | 287 ms · 837 ms | 1.13 s · 3.23 s | 100 | 100 | 90 | 87/85/85 · 71/71/71 |

**Server-rendered pages (`/r/`), 500 pages**

| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Docxodus (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 47 · 29 | 2.51 s · 10.5 s | 1.47 s · 6.06 s | 0 · 0 | 749 ms · 3.59 s | 4.06 s · 11.4 s | 91 | 96 | 82 | 48/47/47 · 29/29/29 |
| folio (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 59 · 55 | 4.19 s · 11.8 s | 0 ms · 78 ms | 0 · 0 | 3.90 s · 10.8 s | 4.65 s · 10.8 s | 74 | n/a | 73 | 59/58/59 · 55/55/55 |
| docx-editor.dev (measured 2026-11-21: Lighthouse's CPU benchmark index median 4240, lowest 4190; machine load (1-minute average) median 2.2, highest 3.6, on 12 cores) | **no result**: ERRORED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested. Make sure you are testing the correct URL and that the server is proper | | | | | | | | | fail/fail/fail · fail/fail/fail |
| Plate | 92 · 79 | 1.32 s · 3.85 s | 0 ms · 74 ms | 0 · 0 | 1.32 s · 3.85 s | 1.46 s · 3.85 s | 97 | 96 | 82 | 85/92/92 · 79/80/79 |
| docen | 69 · 36 | 2.35 s · 7.70 s | 230 ms · 1.99 s | 0 · 0 | 1.79 s · 4.85 s | 2.23 s · 4.85 s | 97 | 96 | 82 | 69/71/66 · 36/36/36 |
| WordCraft | 99 · 87 | 560 ms · 3.65 s | 0 ms · 2 ms | 0 · 0 | 246 ms · 833 ms | 1.16 s · 1.80 s | 97 | 96 | 83 | 93/100/99 · 86/87/98 |
| SuperDoc | 62 · 61 | 3.40 s · 5.58 s | 0 ms · 0 ms | 0 · 0 | 3.40 s · 5.58 s | 4.87 s · 9.37 s | 100 | 96 | 82 | 63/62/61 · 61/61/61 |
| OpenDoc (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 95 · 78 | 1.14 s · 5.67 s | 0 ms · 0 ms | 0 · 0 | 264 ms · 853 ms | 1.76 s · 3.08 s | 97 | 96 | 83 | 93/95/95 · 78/81/74 |
| BetterOffice (measured 2026-11-21: Lighthouse's CPU benchmark index median 4184, lowest 4094; machine load (1-minute average) median 2.6, highest 6.0, on 12 cores) | 93 · 95 | 311 ms · 1.07 s | 0 ms · 4 ms | 0 · 0 | 247 ms · 779 ms | 2.89 s · 6.00 s | 97 | 96 | 83 | 92/93/93 · 94/95/95 |
| office-open (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 97 · 85 | 978 ms · 3.34 s | 0 ms · 50 ms | 0 · 0 | 978 ms · 3.34 s | 978 ms · 3.34 s | 100 | 96 | 82 | 97/89/97 · 85/85/84 |
| Fidus Writer (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 97 · 86 | 1.04 s · 3.25 s | 0 ms · 6 ms | 0 · 0 | 1.04 s · 3.25 s | 1.04 s · 3.25 s | 97 | 96 | 82 | 94/98/97 · 86/85/86 |
| docs.plus (measured 2026-11-21: Lighthouse's CPU benchmark index median 4198, lowest 4110; machine load (1-minute average) median 2.7, highest 6.3, on 12 cores) | 96 · 83 | 1.07 s · 3.51 s | 0 ms · 109 ms | 0 · 0 | 1.07 s · 3.51 s | 1.10 s · 3.51 s | 100 | 96 | 82 | 93/96/96 · 70/83/84 |
<!-- lighthouse-local:end -->

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
Measured 2026-11-20: Google Chrome 158.0.8127.36 (installed, headed) via Playwright, fresh profile per run (cold cache), 3 runs, median; from a Hugging Face Jobs cpu-xl machine (16 vCPU, 124 GB, Linux x86-64, no GPU: Chrome draws in software; the load average and core count recorded with each run are the shared host's), Chrome under Xvfb with --no-sandbox --disable-dev-shm-usage; machine load (1-minute average) median 56.2, highest 94.5, on 64 cores. Document: showcase.docx (47,871 B) with a never-seen ?n= per run.

| Engine | Cold render (`/v/`) | Each run | Downloaded | Requests | JS heap | Renderer memory |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| canvas-editor | 1.33 s | 1.40 s, failed, 1.26 s (failed: not rendered within 240s) | 644 KB | 29 | 5.6 MB | 465 MB |
| Docxodus | 3.44 s | 3.44 s, 3.79 s, 2.45 s | 7.1 MB | 61 | 7.3 MB | 535 MB |
| SuperDoc | 5.60 s | 3.75 s, 6.09 s, 5.60 s | 7.8 MB | 26 | 12 MB | 609 MB |
| Plate | 2.46 s | 1.46 s, 5.16 s, 2.46 s | 1.1 MB | 436 | 10 MB | 434 MB |
| docen | 1.92 s | 1.67 s, 2.98 s, 1.92 s | 1.4 MB | 329 | 18 MB | 550 MB |
| docx-editor.dev | 2.24 s | 2.08 s, 2.75 s, 2.24 s | 5.0 MB | 206 | 22 MB | 503 MB |
| folio | 1.80 s | 1.52 s, 2.73 s, 1.80 s | 2.1 MB | 82 | 15 MB | 445 MB |
| WordCraft | 3.46 s | 3.16 s, 4.01 s, 3.46 s | 22 MB | 23 | 3.3 MB | 664 MB |
| Microsoft Word viewer | 792 ms (frame load) | 1.26 s, 745 ms, 792 ms | 1.7 MB | 74 | n/a | 864 MB |
| Google Docs viewer | 1.20 s (frame load) | 1.20 s, 1.36 s, 1.13 s | 1.1 MB | 32 | n/a | 589 MB |
| Apryse WebViewer | 3.83 s | 6.34 s, 2.69 s, 3.83 s | 7.0 MB | 163 | 17 MB | 657 MB |
| Nutrient | 8.44 s | 5.63 s, 17.3 s, 8.44 s | 24 MB | 103 | 18 MB | 585 MB |
| react-docx | 2.18 s | 1.78 s, 2.29 s, 2.18 s | 7.4 MB | 39 | 11 MB | 512 MB |
| Univer | 1.80 s | 1.45 s, 2.11 s, 1.80 s | 2.3 MB | 374 | 24 MB | 495 MB |
| OpenDoc | 2.90 s | 2.41 s, 3.75 s, 2.90 s | 20 MB | 379 | 12 MB | 670 MB |
| BetterOffice | 2.61 s | 2.08 s, 2.92 s, 2.61 s | 12 MB | 250 | 8.5 MB | 637 MB |
| OnlyOffice (CryptPad build) | 4.00 s | failed, 4.00 s, 4.01 s (failed: OnlyOffice: Fonts are not loaded.<br>Please contact your Document Server administrator.) | 18 MB | 81 | 44 MB | 691 MB |
| GenOffice (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.8, on 12 cores) | 1.74 s | 2.92 s, 1.74 s, 1.44 s | 5.3 MB | 36 | 17 MB | 495 MB |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.8, on 12 cores) | 1.55 s | 1.67 s, 1.55 s, 1.37 s | 409 KB | 26 | 6.4 MB | 768 MB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.8, on 12 cores) | 1.44 s | 1.79 s, 1.00 s, 1.44 s | 901 KB | 32 | 5.0 MB | 348 MB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 2.4, highest 2.8, on 12 cores) | 1.01 s | 1.54 s, 962 ms, 1.01 s | 929 KB | 26 | 9.6 MB | 391 MB |
<!-- browser:end -->

**Server routes (`/r/`) with plain HTTP, rich sample** ([`results/server.json`](results/server.json))

<!-- server:start -->
Measured 2026-11-21: curl, a new connection (so DNS, TLS and connecting are in every total) and a never-seen ?n= per request, 5 runs, median; from Darwin arm64; machine load (1-minute average) median 6.8, highest 7.0, on 12 cores. Document: showcase.docx (47,871 B).

| Engine (`/r/`) | First request | of which init · render | Warm (median) | of which render | Each warm request | Sent |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Docxodus (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 1.73 s | 189 ms · 890 ms | 471 ms | 282 ms | 1.13 s, 494 ms, 443 ms, 463 ms, 479 ms (1 reached a process that had not loaded the engine: not in the median) | 61 KB |
| folio (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 1.33 s | 347 ms · 332 ms | 399 ms | 212 ms | 1.31 s, 441 ms, 375 ms, 356 ms, 423 ms (1 reached a process that had not loaded the engine: not in the median) | 204 KB |
| docx-editor.dev (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 1.25 s | 119 ms · 866 ms | 710 ms | 503 ms | 739 ms, 1.25 s, 718 ms, 683 ms, 702 ms (1 reached a process that had not loaded the engine: not in the median) | 238 KB |
| Plate (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 718 ms | 135 ms · 212 ms | 306 ms | 146 ms | 1.10 s, 361 ms, 271 ms, 313 ms, 300 ms (1 reached a process that had not loaded the engine: not in the median) | 32 KB |
| docen (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 660 ms | 343 ms · 126 ms | 193 ms | 39 ms | 728 ms, 195 ms, 191 ms, 183 ms, 263 ms (1 reached a process that had not loaded the engine: not in the median) | 43 KB |
| WordCraft (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 476 ms | 187 ms · 126 ms | 221 ms | 23 ms | 171 ms, 191 ms, 375 ms, 221 ms, 256 ms | 3 KB + a page image per page viewed |
| SuperDoc (measured 2026-11-17: from Darwin arm64; machine load (1-minute average) median 5.8, highest 6.1, on 12 cores) | 1.39 s | 516 ms · 619 ms | 604 ms | 436 ms | 651 ms, 568 ms, 598 ms, 604 ms, 687 ms | 7 KB |
| OpenDoc | 934 ms | 179 ms · 151 ms | 220 ms | 24 ms | 257 ms, 210 ms, 389 ms, 220 ms, 202 ms | 3 KB + a page image per page viewed |
| BetterOffice | 914 ms | 319 ms · 446 ms | 279 ms | 85 ms | 368 ms, 261 ms, 230 ms, 318 ms, 297 ms (1 reached a process that had not loaded the engine: not in the median) | 2 KB + a page image per page viewed |
| office-open (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.2, highest 3.2, on 12 cores) | 425 ms | 127 ms · 154 ms | 257 ms | 66 ms | 300 ms, 283 ms, 237 ms, 254 ms, 257 ms | 9 KB |
| Fidus Writer (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.2, highest 3.2, on 12 cores) | 608 ms | 301 ms · 114 ms | 260 ms | 70 ms | 270 ms, 260 ms, 298 ms, 202 ms, 247 ms | 28 KB |
| docs.plus (measured 2026-11-21: a MacBook Pro (Apple M4 Pro, 12 cores, 24 GB, with its graphics card); machine load (1-minute average) median 3.2, highest 3.2, on 12 cores) | 593 ms | 43 ms · 313 ms | 268 ms | 75 ms | 243 ms, 270 ms, 268 ms, 273 ms, 229 ms | 16 KB |
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
- Where: the browser timings are made on a Hugging Face Jobs machine (Linux, no GPU, so Chrome draws in
  software; headed under Xvfb) by open-docs'
  [`scripts/hf_job.sh`](https://github.com/arthrod/open-docs/blob/main/scripts/hf_job.sh), 3 runs per engine and
  document. It runs none of our other work and anyone can rent the same machine. The load average and core count
  in each run are the shared host's (64 cores), not ours. The pass of 2026-11-20 ran on the `cpu-xl` type
  (16 vCPU, 124 GB); the one of 2026-11-18 on `cpu-upgrade` (8 vCPU, 32 GB), whose hosts were too busy all of
  2026-11-20 (load 100 to 440) for a single run to start. A run starts only while the host's load is under a
  limit, 100 for this pass: the load was between 3 and 102 during the browser runs (median about 50) and 39 to 47
  during the `/r/` runs, and how much of that slowed our Chrome cannot be told from inside the job. Several
  timings are slower than on 2026-11-18 although the machine is larger; the busier host is the likely reason,
  and each run in `results/raw/` carries its load. These figures do not continue the
  earlier series, which came from a GitHub-hosted macOS runner (3 cores, 5 runs; the files of 2026-11-16 and
  2026-11-17 in `results/raw/`, and the [Measure workflow](.github/workflows/measure.yml) that still makes
  them). Read the figures as that machine's; what carries to another machine is the order between engines, not
  the seconds.
- The pass of 2026-11-20 (files dated 2026-11-20 in `results/raw/`; it ran past midnight UTC, so two headings say
  2026-11-21): one job, one host, 3 runs per engine and document, every engine. 14 of its 153 browser runs did not
  render (see "Figures to distrust"); the three `/r/` runs of docx-editor.dev on the 500 pages answered HTTP 422,
  as designed. The files of 2026-11-18 stay in `results/raw/`, with the account of that day's two passes in
  their history.
  The first-and-warm server table was not taken again. The Lighthouse rows of the five engines added on
  2026-11-18 were taken on 2026-11-20 (PageSpeed runs on Google's machines, so the day's other figures do not
  bear on them); the other Lighthouse rows are still those of 2026-11-16.
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
