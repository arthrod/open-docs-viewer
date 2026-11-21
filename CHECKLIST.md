# Reports checklist: viewers.benchmarks.law (open-docs-viewer)

Every report this repository publishes, with its parts. Tick a part only when
it has been updated **and** seen on the live site. The same file exists in
`open-docs`, `editors-arena` and `editors_trial`.

Legend: `[x]` done and checked live · `[~]` in progress · `[ ]` not done ·
`[!]` blocked, with the reason beside it.

## The engines this site covers

The seventeen engines of editors.benchmarks.law in read-only mode. A part that
lists engines is complete only when all seventeen are in it, or the part says
why one is missing.

## 1. Home page and README

- [ ] 1.1 Routes (`/v/<id>`, `/r/<id>`, parameters)
- [ ] 1.2 Samples: showcase table (browser render, runs, heap, renderer memory, transfer, server render)
- [ ] 1.3 Samples: redline table
- [ ] 1.4 Samples: 500 pages table
- [ ] 1.5 Engines added on 2026-11-18 (react-docx, Univer, OpenDoc, BetterOffice, OnlyOffice)
- [x] 1.6 Server rendering: the routes that exist (nine, one row each)
- [ ] 1.7 No server route, and why (one row per engine without one)
  - [x] OpenDoc: built. `/r/opendoc` runs `@casualoffice/opendoc-viewer@0.1.0-alpha.1` on the server and sends one PNG per page; an older build than the browser page, and the route says so
  - [x] BetterOffice: built. `/r/betteroffice` runs `@betteroffice/docx`'s layout and its own painter on a canvas of ours that writes SVG (the package publishes no other surface)
  - [x] Both rows moved to 1.6; the three samples tables, the transfer tables, the first-and-warm table and the home page carry their measurements (live 2026-11-21, checked in Chrome on the three samples)
  - [ ] Lighthouse for `/r/opendoc` and `/r/betteroffice` (PageSpeed and this computer)
- [ ] 1.8 Figures to distrust (table)
- [ ] 1.9 What the browser pays for a server render (3 tables)
- [ ] 1.10 Lighthouse, PageSpeed (`/v/` and `/r/`, 3 samples)
- [x] 1.11 Lighthouse on our computer: all 17 browser pages and 9 server routes, rich sample and 500 pages, live 2026-11-21 (seen in Chrome). No score on the 500 pages for docen (Lighthouse stopped while waiting for the page) and for the docx-editor.dev server route (it refuses that file)
- [ ] 1.12 First and warm server render table
- [ ] 1.13 Tests, Measuring, Development, License

## 2. Per-engine pages

- [ ] `/v/<id>` for all seventeen engines opens the three samples
- [ ] `/r/<id>` for every engine with a server route returns pages for the three samples

## 3. Cross-site consistency

- [x] 3.1 Same menu as editors.benchmarks.law, with the Blog link
- [ ] 3.2 Same engine names as the other sites
- [~] 3.3 Each engine links to its vendor note at `benchmarks.law/editors-trial/vendor-notes` (live 2026-11-21 for the engines whose section is published; the six new tools get their link when benchmarks.law has their sections, through `VENDOR_NOTE_PENDING` in the open-docs registry)

## Log

| Date | Part | What changed |
| --- | --- | --- |
| 2026-11-21 | all | Checklist created |
| 2026-11-21 | 3.3 | Each engine links to its vendor note |
| 2026-11-21 | 1.6, 1.7 | Server routes for OpenDoc and BetterOffice, built and measured |
| 2026-11-21 | 1.11 | Lighthouse on our computer published for every page and route |
