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

- [x] 1.1 Routes (`/v/<id>`, `/r/<id>`, parameters) Audited 2026-11-21: the five routes answer; `src` takes each of the three samples on every page
- [x] 1.2 Samples: showcase table (browser render, runs, heap, renderer memory, transfer, server render) Audited 2026-11-21: the rich-sample table is under Measuring: 17 browser rows and 9 server rows
- [x] 1.3 Samples: redline table Audited 2026-11-21: 17 rows
- [x] 1.4 Samples: 500 pages table Audited 2026-11-21: 17 rows
- [x] 1.5 Engines added on 2026-11-18 (react-docx, Univer, OpenDoc, BetterOffice, OnlyOffice) Audited 2026-11-21: five rows; OpenDoc and BetterOffice now have server routes and the section says so
- [x] 1.6 Server rendering: the routes that exist (nine, one row each)
- [x] 1.7 No server route, and why (one row per engine without one) Audited 2026-11-21: seven rows (six engines and cite-check); the README now says why the two hosted viewers are not in it
  - [x] OpenDoc: built. `/r/opendoc` runs `@casualoffice/opendoc-viewer@0.1.0-alpha.1` on the server and sends one PNG per page; an older build than the browser page, and the route says so
  - [x] BetterOffice: built. `/r/betteroffice` runs `@betteroffice/docx`'s layout and its own painter on a canvas of ours that writes SVG (the package publishes no other surface)
  - [x] Both rows moved to 1.6; the three samples tables, the transfer tables, the first-and-warm table and the home page carry their measurements (live 2026-11-21, checked in Chrome on the three samples)
  - [x] Lighthouse for `/r/opendoc` and `/r/betteroffice` (PageSpeed and this computer) Done 2026-11-21: PageSpeed (5 analyses each; one of OpenDoc's desktop analyses on the 500 pages failed at Google and the row says so) and this computer
- [x] 1.8 Figures to distrust (table) Audited 2026-11-21: eleven rows, each read against the table it cites
- [x] 1.9 What the browser pays for a server render (3 tables) Audited 2026-11-21: three tables of eleven rows: nine routes and the two hosted viewers. OpenDoc and BetterOffice were timed from the Mac, the other seven from the cloud machine, and each row says which; re-timing the two on the cloud machine costs money and was not approved
- [x] 1.10 Lighthouse, PageSpeed (`/v/` and `/r/`, 3 samples) Audited 2026-11-21: 17 browser pages and 9 server routes, rich sample and 500 pages; `/r/opendoc` and `/r/betteroffice` added 2026-11-21
- [x] 1.11 Lighthouse on our computer: all 17 browser pages and 9 server routes, rich sample and 500 pages, live 2026-11-21 (seen in Chrome). No score on the 500 pages for docen (Lighthouse stopped while waiting for the page) and for the docx-editor.dev server route (it refuses that file)
- [x] 1.12 First and warm server render table Audited 2026-11-21: nine rows
- [x] 1.13 Tests, Measuring, Development, License Audited 2026-11-21: the commands named exist and the tests pass

## 2. Per-engine pages

- [x] `/v/<id>` for all seventeen engines opens the three samples Checked 2026-11-21: 51 requests, all answered; the measuring pass rendered them (the rows that failed say so)
- [x] `/r/<id>` for every engine with a server route returns pages for the three samples Checked 2026-11-21: nine routes return pages for the rich sample and the redline; the 500 pages are in the measured tables (docx-editor.dev's route refuses them, as its row says)

## 3. Cross-site consistency

- [x] 3.1 Same menu as editors.benchmarks.law, with the Blog link
- [x] 3.2 Same engine names as the other sites The README tables now use the sites' names for the two embed viewers (2026-11-21)
- [x] 3.3 Each engine links to its vendor note at `benchmarks.law/editors-trial/vendor-notes`, the six new tools included since benchmarks.law published their sections (et-v0.10.6, 2026-11-21)

## Log

| Date | Part | What changed |
| --- | --- | --- |
| 2026-11-21 | all | Checklist created |
| 2026-11-21 | 3.3 | Each engine links to its vendor note |
| 2026-11-21 | 1.6, 1.7 | Server routes for OpenDoc and BetterOffice, built and measured |
| 2026-11-21 | 1.11 | Lighthouse on our computer published for every page and route |
| 2026-11-21 | vendor notes | benchmarks.law has the six new sections; their links are on |
| 2026-11-21 | 1, 2, 3.2 | Audited against the live site; PageSpeed for the two new server routes |
