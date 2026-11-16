# open-docs viewer

[![Val Town](https://img.shields.io/badge/Val%20Town-open--docs--viewer-334155)](https://www.val.town/x/arthrod/open-docs-viewer)
[![Live](https://img.shields.io/badge/live-viewers.benchmarks.law-2557d6)](https://viewers.benchmarks.law)
[![GitHub](https://img.shields.io/badge/github-arthrod%2Fopen--docs--viewer-181717)](https://github.com/arthrod/open-docs-viewer)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Engines](https://img.shields.io/badge/engines-arthrod%2Fopen--docs-0f172a)](https://github.com/arthrod/open-docs)

Every `.docx` renderer from the [open-docs](https://github.com/arthrod/open-docs) bench, **view-only**, fed the
same public document URL, and measured the same way. Twelve engines render in the browser. Six of them also
render **on this Val's server**, the way Microsoft's and Google's viewers do: the server fetches the document,
lays it out, paints it, and the browser receives finished pages.

## Routes

| Route | What |
| --- | --- |
| `GET /` | the engines, the measurements, a URL form |
| `GET /v/<engine>?src=<url>` | view-only page: the engine runs in the browser, in its own read-only mode |
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
| SuperDoc | 2.42 s | 2.47 s, 2.42 s, 2.21 s | 15 MB | 552 MB | 8 MB | no server route |
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
| SuperDoc | 5.81 s | 5.71 s, 5.81 s, 6.63 s | 36 MB | 1106 MB | 8 MB | no server route |
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
underlined, deleted words struck), exactly as its editor adapter does. The other
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

Not offered, deliberately: **SuperDoc** (its layout measures text through a browser canvas and paints into the DOM;
its SDK wraps a native binary), **canvas-editor** (DOM and canvas throughout), **Apryse** and **Nutrient** (their
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

## Measuring

- Server routes: `python3 scripts/measure_server.py docxodus,folio,eigenpal,plate,docen,wordcraft 5`
  (plain `curl`, a never-seen `?n=` per request, `Server-Timing` parsed). The numbers on `/` are the first
  request to each engine after a deploy, then the median of 5 warm requests.
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
