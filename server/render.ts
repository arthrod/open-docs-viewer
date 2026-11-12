/**
 * Docxodus (.NET → WebAssembly) on this server: its own DOCX → HTML converter,
 * in its Paginated mode, with headers, footers, footnotes and endnotes.
 *
 * Docxodus paginates by measuring laid-out text (its PaginationEngine, or the
 * export-browser package, which lays out in a frame). Deno has no layout
 * engine, so the split is: the server does the conversion (the .NET part,
 * the heavy one); the browser runs Docxodus's own paginateHtml once, from
 * this Val's origin (client/dx-boot.js), to flow it into page boxes.
 *
 * Shared viewer chrome CSS and the /v/<engine> page shell also live here.
 */
import type { Engine } from "./engines.ts";
import { ENGINES, OPEN_DOCS } from "./engines.ts";
import { NAVBAR_CSS, viewNavBar } from "./navbar.ts";

/** Docxodus's paginator bundle (scripts/build-dx-paginate.sh), pinned and SRI-checked. */
export const DX_PAGINATE_URL =
  "https://cdn.jsdelivr.net/gh/arthrod/open-docs-viewer@e94b27d479e1547371b4ddf091e72a789b44035f/client/dx-paginate.js";
const DX_PAGINATE_SRI = "sha384-cmn0uJ/FPb43+fQ/t0y+Nn5VfllCoYsrqqksCs9jxnjk9gDcDrXpkfwSG0r8HpFP";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FRANKLIN_WOFF2 =
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/libre-franklin@5.3.0/files/libre-franklin-latin-wght-normal.woff2";
const MONO_WOFF2 =
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/roboto-mono@5.3.0/files/roboto-mono-latin-wght-normal.woff2";

/** benchmarks.law v2 tokens and components, scoped for this app (no global element selectors). */
export const VIEWER_DS_CSS = `
@font-face{font-family:'Libre Franklin';font-style:normal;font-weight:100 900;font-display:swap;src:url('${FRANKLIN_WOFF2}') format('woff2')}
@font-face{font-family:'Roboto Mono';font-style:normal;font-weight:100 700;font-display:swap;src:url('${MONO_WOFF2}') format('woff2')}
:root{
  --bg:#fafaf8;--surface:#ffffff;--hover:#f2f2ee;--row-hover:#fcfcf6;--code-bg:#f1f1ee;
  --ink:#0a0a0a;--ink-prose:#1e1e1e;--ink-soft:#2a2a2a;--ink-body:#333333;--ink-quiet:#444444;
  --muted:#6b6b6b;--link-rule:#b5b5b0;--faint:#e8e8e5;--mark:#ffd400;--mark-text:var(--ink);
  --del:#b4232f;--ins:#2a6fdb;--green-ink:#166b43;
  --shadow-offset:7px 7px 0 #ffd400;
  --page-max:1180px;--px:clamp(20px,5vw,56px);
  --font-sans:"Libre Franklin",system-ui,-apple-system,sans-serif;
  --font-mono:"Roboto Mono",ui-monospace,monospace;
  --t-fast:.15s ease;--t:.18s ease;
}
.bl.odv,.odv-chrome-wrap{background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:17px;line-height:1.6;letter-spacing:-0.01em;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.bl.odv *,.bl.odv *::before,.bl.odv *::after,.odv-chrome,.odv-chrome *,.odv-chrome *::before,.odv-chrome *::after,#od-stage > .verr{box-sizing:border-box}
.bl.odv ::selection,.odv-chrome-wrap ::selection{background:var(--mark);color:var(--mark-text)}
.wrap{max-width:var(--page-max);margin-inline:auto;padding-inline:var(--px)}
.odv a{color:inherit}
.odv a:focus-visible,.odv button:focus-visible,.odv-chrome button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
${NAVBAR_CSS}
.odv-chrome .chip{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);
  border:1px solid var(--ink);padding:3px 9px;display:inline-block;background:var(--surface)}
.odv-chrome .chip.is-prop{background:var(--mark);border-color:var(--ink)}
.odv-chrome .note{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);
  overflow:hidden;text-overflow:ellipsis;max-width:28ch}
.btn{font-family:var(--font-mono);font-size:13px;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;display:inline-flex;
  align-items:center;gap:9px;padding:12px 18px;cursor:pointer;border-radius:0}
.btn-primary{background:var(--ink);color:var(--bg);border:1px solid var(--ink);transition:transform var(--t),background var(--t),color var(--t)}
.btn-primary:hover{background:var(--mark);color:var(--mark-text);transform:translateY(-2px)}
.btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--ink);transition:transform var(--t),background var(--t),color var(--t)}
.btn-ghost:hover{background:var(--mark);color:var(--mark-text);transform:translateY(-2px)}
.hero{padding:44px 0 40px}
.hero h1{font-weight:700;font-size:clamp(34px,5.4vw,52px);line-height:1.05;letter-spacing:-0.025em;margin:0 0 22px;max-width:22ch}
.hero .lede{font-size:clamp(17px,1.6vw,19px);color:var(--ink-soft);max-width:62ch;margin:0 0 28px;line-height:1.62}
.sec-label{display:flex;align-items:center;gap:12px;font-family:var(--font-mono);font-size:12px;font-weight:400;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.sec-label .sq{width:9px;height:9px;background:var(--mark);display:inline-block;flex:none}
.odv-section{margin:44px 0 0}
.odv-section .fine{font-size:15px;color:var(--ink-body);max-width:72ch;margin:0 0 18px;line-height:1.6}
.odv-section .fine code{font-family:var(--font-mono);font-size:13px;background:var(--code-bg);padding:.1em .35em}
.odv-section .fine a{text-decoration:underline;text-decoration-color:var(--link-rule);text-underline-offset:3px}
.odv-section .fine a:hover{text-decoration-color:var(--ink);background:color-mix(in srgb,var(--mark) 40%,transparent)}
.stats{list-style:none;padding:0;margin:0 0 40px;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--faint);border:1px solid var(--faint)}
.stat{background:var(--bg);padding:20px 22px;display:flex;flex-direction:column;gap:6px}
.stat b{font-size:clamp(26px,3vw,36px);font-weight:700;letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums}
.stat span{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);line-height:1.4}
.stats.is-kpi{border-color:var(--ink)}
.stats.is-kpi .stat{background:var(--surface)}
.table-wrap{overflow-x:auto;border:1px solid var(--ink);background:var(--surface);margin:0 0 8px}
.tbl{border-collapse:collapse;width:100%;font-size:14px;line-height:1.45;font-variant-numeric:tabular-nums}
.tbl th{font-family:var(--font-mono);font-weight:600;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);text-align:left;
  padding:10px 12px;border-bottom:1px solid var(--ink);background:var(--bg);white-space:nowrap;vertical-align:bottom}
.tbl td{padding:9px 12px;border-bottom:1px solid var(--faint);vertical-align:top;color:var(--ink-prose)}
.tbl td.n,.tbl th.n{text-align:right}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr:hover td{background:var(--row-hover)}
.tbl td a{font-weight:600;text-decoration:none;background-image:linear-gradient(var(--mark),var(--mark));background-size:0% 42%;background-position:0 88%;
  background-repeat:no-repeat;transition:background-size .25s ease;padding-bottom:1px}
.tbl td a:hover{background-size:100% 42%}
.tbl .ro{font-family:var(--font-mono);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-top:4px;line-height:1.35}
.tbl tr.odv-sep th{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:none;color:var(--ink);background:color-mix(in srgb,var(--mark) 35%,var(--bg));
  border-bottom:1px solid var(--ink);padding:12px}
.odv-bar{display:block;height:10px;border:1px solid var(--ink);background:var(--bg);margin-top:2px}
.odv-bar > i{display:block;height:100%;background:var(--ink);min-width:1px}
.odv-form{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 14px;align-items:flex-end}
.odv-form .fld{flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:6px}
.odv-form label{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.odv-form input[type=url],.odv-form select{font-family:var(--font-sans);font-size:15px;padding:12px 14px;border:1px solid var(--ink);border-radius:0;background:var(--surface);color:var(--ink);width:100%}
.odv-form select{font-family:var(--font-mono);font-size:12px;letter-spacing:.03em;text-transform:uppercase}
.odv-form .fld:has(select){flex:0 1 240px}
.odv-foot{margin:52px 0 44px;padding-top:22px;border-top:1px solid var(--ink);font-family:var(--font-mono);font-size:11px;letter-spacing:.05em;
  text-transform:uppercase;color:var(--muted);line-height:1.6}
.odv-foot a{text-decoration:underline;text-decoration-color:var(--link-rule);text-underline-offset:2px}
.site-foot{background:var(--ink);color:#8c8c88;border-top:1px solid #222;padding:28px var(--px) 36px;font-family:var(--font-mono);font-size:11px;
  letter-spacing:.05em;text-transform:uppercase}
.site-foot a{color:#c9c9c4;text-decoration:none;border-bottom:1px solid #333;padding-bottom:1px}
.site-foot a:hover{color:var(--mark);border-color:var(--mark)}
html.odv-view,html.odv-view body{margin:0;height:100%}
html.odv-view body{display:flex;flex-direction:column;height:100dvh;background:var(--bg);color:var(--ink)}
.odv-chrome{flex:none}
#od-stage{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--surface)}
#od-stage > *{height:100%}
#od-stage > .verr{margin:24px;padding:16px 18px;background:var(--surface);color:var(--del);border:1px solid var(--ink);
  font-family:var(--font-mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap}
@media(max-width:720px){.hide-sm{display:none!important}.stats{grid-template-columns:repeat(2,1fr)}.odv-chrome .note{display:none}}
@media(max-width:640px){.odv-form .fld:has(select){flex:1 1 100%}}
`;

// deno-lint-ignore no-explicit-any
let dx: Promise<any> | undefined;

export async function docxodusHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  dx ??= import("npm:docxodus@15.1.0/core").then(async (m) => (await m.initialize(), m)).catch((e) => {
    dx = undefined; // a failed init is retried on the next request
    throw e;
  });
  const m = await dx;
  const t1 = performance.now();
  const converted: string = await m.convertDocxToHtml(bytes, {
    paginationMode: m.PaginationMode.Paginated,
    renderHeadersAndFooters: true,
    renderFootnotesAndEndnotes: true,
  });
  // Shipped as JSON data (never executed); "<" escaped so nothing in it can close the element.
  const data = JSON.stringify(converted).replace(/</g, "\\u003c");
  const srvCss = `
:root{--bg:#fafaf8;--surface:#fff;--ink:#0a0a0a}
html,body.odv-srv{margin:0;min-height:100%;background:var(--bg);font-family:"Libre Franklin",system-ui,sans-serif}
body.odv-srv{padding:24px 0}
#viewer{display:flex;flex-direction:column;align-items:center}
`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Docxodus · server-converted, paginated here</title>
<style>${srvCss}</style>
<script type="application/json" id="dx-html">${data}</script>
<link rel="modulepreload" href="${DX_PAGINATE_URL}" integrity="${DX_PAGINATE_SRI}" crossorigin="anonymous" />
<script type="module" src="/client/dx-boot.js"></script>
</head><body class="odv-srv"><div id="viewer"></div></body></html>`;
  return { html, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1), scriptSrc: `'self' ${DX_PAGINATE_URL}`, paginatedIn: "browser" as const };
}

/** /v/<engine> page shell around each adapter (engine markup stays inside #od-stage). */
export function viewPage(
  e: Engine,
  shell: { head?: string; body: string; entry: string; importMap?: Record<string, string> },
  src: URL,
  absolutize: (html: string) => string,
): string {
  const imports = Object.fromEntries(
    Object.entries(shell.importMap ?? {}).map(([k, v]) => [k, v.startsWith("/") ? OPEN_DOCS + v : v]),
  );
  const importMap = Object.keys(imports).length
    ? `<script type="importmap">${JSON.stringify({ imports })}</script>`
    : "";
  const config = { slug: e.slug, name: e.name, src: src.href, frame: e.frame, docUrl: `/api/doc?src=${encodeURIComponent(src.href)}`, openDocs: OPEN_DOCS };
  return `<!DOCTYPE html>
<html lang="en" class="odv-view"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(e.name)} · open-docs viewer</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230a0a0a'/><rect x='8' y='6' width='16' height='20' fill='%23ffd400'/></svg>" />
${importMap}
<link rel="preconnect" href="${OPEN_DOCS}" crossorigin />
${absolutize(shell.head ?? "")}
<style>${VIEWER_DS_CSS}</style>
<script type="module" src="${OPEN_DOCS}/lib/boot.ts"></script>
</head>
<body class="odv-chrome-wrap">
${viewNavBar(e, ENGINES, src)}
  <main id="od-stage">${shell.body}</main>
  <script>window.__OD_VIEW = ${JSON.stringify(config).replace(/</g, "\\u003c")};</script>
  <script type="module" src="/client/nav.ts"></script>
  <script type="module" src="/client/view.ts"></script>
  <script type="module" src="${OPEN_DOCS}${shell.entry}"></script>
</body></html>`;
}
