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
- [ ] 1.6 Server rendering: the routes that exist (one row per engine with a route)
- [ ] 1.7 No server route, and why (one row per engine without one)
  - [ ] OpenDoc: "possible, not built". Build it with `@casualoffice/opendoc-viewer`, or record the measured reason it cannot be built
  - [ ] BetterOffice: "possible, not built". Build it over `@betteroffice/docx`, or record the measured reason it cannot be built
  - [ ] After either is built: its row moves to 1.6, and the three samples tables, the transfer table, the first-and-warm table and the home page are updated
- [ ] 1.8 Figures to distrust (table)
- [ ] 1.9 What the browser pays for a server render (3 tables)
- [ ] 1.10 Lighthouse, PageSpeed (`/v/` and `/r/`, 3 samples)
- [ ] 1.11 Lighthouse, this computer: every engine and every sample, not some
- [ ] 1.12 First and warm server render table
- [ ] 1.13 Tests, Measuring, Development, License

## 2. Per-engine pages

- [ ] `/v/<id>` for all seventeen engines opens the three samples
- [ ] `/r/<id>` for every engine with a server route returns pages for the three samples

## 3. Cross-site consistency

- [x] 3.1 Same menu as editors.benchmarks.law, with the Blog link
- [ ] 3.2 Same engine names as the other sites
- [x] 3.3 Each engine links to its vendor note at `benchmarks.law/editors-trial/vendor-notes` (live 2026-11-21; the sections of the six new tools appear on benchmarks.law with its next deploy)

## Log

| Date | Part | What changed |
| --- | --- | --- |
| 2026-11-21 | all | Checklist created |
| 2026-11-21 | 3.3 | Each engine links to its vendor note |
