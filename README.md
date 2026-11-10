# open-docs viewer

[![Val Town](https://img.shields.io/badge/Val%20Town-open--docs--viewer-334155)](https://www.val.town/x/arthrod/open-docs-viewer)
[![Live](https://img.shields.io/badge/live-open--docs--viewer.val.run-2557d6)](https://open-docs-viewer.val.run)
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
- Browser pages: `val.run` sits behind Cloudflare, which blocks headless browsers. The browser-side numbers were
  taken in a real Chrome; nothing here tries to get around that block.

## Development

```sh
vt clone arthrod/open-docs-viewer && cd open-docs-viewer
vt watch            # edit locally, deploys on save
```

Engines' browser code is not copied: shells are imported from the open-docs val and adapters load from
`open-docs.val.run`.

## License

MIT, like open-docs. Each engine keeps its own license (Apryse and Nutrient are proprietary and run in evaluation
mode).
