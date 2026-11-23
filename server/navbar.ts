/**
 * Shared open-docs navbar: wordmark, od-bar chrome, engine picker, MENU panel.
 * Markup and CSS follow NAVBAR_SPEC (open-docs od-int reference).
 */
import type { Engine } from "./engines.ts";
import { OPEN_DOCS } from "./engines.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ARENA = "https://arena.benchmarks.law";
const SOURCE = "https://www.val.town/x/arthrod/open-docs-viewer";

/** Engines with GET /r/:slug server-rendered output. */
export const SERVER_RENDER_SLUGS = new Set([
  "docxodus",
  "folio",
  "wordcraft",
  "docen",
  "eigenpal",
  "plate",
  "superdoc",
  "opendoc",
  "betteroffice",
  "office-open",
  "fidus-writer",
  "docs-plus",
]);

export const WORDMARK_HTML = `<a class="wm" href="/" title="All engines and results">
      <span class="logo"><span class="del">CHILL</span><span class="ins">NEUROTIC</span></span><span class="dot">.</span>DOCX<span class="dot">.</span>BENCH
    </a>`;

const siteLinks = () =>
  `<a href="${OPEN_DOCS}/#editors">Editors</a>
    <a href="/">Viewers</a>
    <a href="/#measurements">Measurements</a>
    <a href="${ARENA}" target="_blank" rel="noopener">Arena →</a>
    <a href="https://editors.benchmarks.law/blog" target="_blank" rel="noopener">Blog →</a>
    <a href="${SOURCE}" target="_blank" rel="noopener">Source →</a>`;

const siteLinksMenu = () =>
  `<a href="${OPEN_DOCS}/#editors">Editors</a>
        <a href="/">Viewers</a>
        <a href="/#measurements">Measurements</a>
        <a href="${ARENA}" target="_blank" rel="noopener">Arena →</a>
        <a href="https://editors.benchmarks.law/blog" target="_blank" rel="noopener">Blog →</a>
        <a href="${SOURCE}" target="_blank" rel="noopener">Source →</a>
        <a href="https://arthur.law/contact" target="_blank" rel="noopener">Contact →</a>`;

const menuBtn = `<button class="od-btn od-menu-btn" id="od-more" type="button" title="Menu" aria-label="Menu" aria-expanded="false" aria-controls="od-menu">
        <span class="od-burger" aria-hidden="true"><i></i><i></i><i></i></span><span class="od-menu-lbl">MENU</span>
      </button>`;

const engineOption = (e: Engine, current: string) =>
  `<option value="${e.slug}"${e.slug === current ? " selected" : ""}>${esc(e.name)}</option>`;

export function engineSwitcher(engines: Engine[], current: string, src: URL): string {
  const open = engines.filter((e) => !e.proprietary);
  const prop = engines.filter((e) => e.proprietary);
  const opts = `<optgroup label="Open-source">${open.map((e) => engineOption(e, current)).join("")}</optgroup>` +
    `<optgroup label="Proprietary viewers">${prop.map((e) => engineOption(e, current)).join("")}</optgroup>`;
  return `<label class="od-switch od-engine-pick" title="Switch engine">
      <img class="od-pick-icon" src="/client/numpad.svg" alt="" width="16" height="16" />
      <select id="od-switch" aria-label="Engine" data-src="${esc(src.href)}">${opts}</select>
    </label>`;
}

/** "/ Made by" menu section from the registry's makers (LinkedIn when verified, else GitHub). */
function madeBy(e: Engine): string {
  const ms = e.makers ?? [];
  if (!ms.length) return "";
  return `
        <hr />
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Made by</div>
        ${ms.map((m) => `<a href="${esc(m.linkedin ?? m.github ?? "#")}" target="_blank" rel="noopener">${esc(m.name)} →<small>${m.kind === "company" ? "Company" : "Developer"} · ${m.linkedin ? "LinkedIn" : "GitHub"}</small></a>`).join("\n        ")}`;
}

/**
 * Browser | Server: the two ways this site renders the same document with the
 * same engine. `where` is the page being shown. An engine with no /r/ route
 * shows "Server" struck out and not a link. A vendor's embed viewer (Microsoft,
 * Google) is the other way round: nothing renders in the visitor's browser, the
 * vendor's servers do it, so "Server" is the current side and "Browser" is the
 * one struck out.
 */
const VENDOR: Record<string, string> = { "word-online": "Microsoft", "google-viewer": "Google" };
export function renderToggle(slug: string, src: URL, where: "browser" | "server", frame = false): string {
  const q = `?src=${encodeURIComponent(src.href)}`;
  const side = (label: string, href: string, title: string, on: boolean) =>
    on
      ? `<span class="on" aria-current="page" title="${title}">${label}</span>`
      : `<a href="${href}" title="${title}">${label}</a>`;
  if (frame) {
    const who = VENDOR[slug] ?? "the vendor";
    return `<span class="od-seg" role="group" aria-label="Where the document is rendered">` +
      `<span class="off" aria-disabled="true" title="Nothing is rendered in your browser: this viewer has no browser engine">Browser<span class="od-sr"> (not available: nothing is rendered in your browser)</span></span>` +
      `<span class="on" aria-current="page" title="Rendered on ${who}'s servers, not this site's; the frame shows their finished pages">Server</span></span>`;
  }
  const browser = side("Browser", `/v/${slug}${q}`, "Rendered in your browser by the engine", where === "browser");
  const server = SERVER_RENDER_SLUGS.has(slug)
    ? side("Server", `/r/${slug}${q}`, "Rendered on this server; the browser gets finished pages", where === "server")
    : `<span class="off" aria-disabled="true" title="This engine has no server route on this site">Server<span class="od-sr"> (not available: this engine has no server route on this site)</span></span>`;
  return `<span class="od-seg" role="group" aria-label="Where the document is rendered">${browser}${server}</span>`;
}

/**
 * A server-rendered page is the engine's output and nothing else, so the way
 * back to the browser render is one fixed control in the corner, styled inline
 * (the page's CSP allows no script and no stylesheet of ours). It goes before
 * the document's closing body tag, in whatever case the engine wrote it, and
 * is left off a printed page, where it would cover the last lines.
 */
export function serverToggle(html: string, slug: string, src: URL): string {
  const seg =
    "display:inline-flex;align-items:center;height:30px;padding:0 10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;";
  const bar = `<style>@media print{nav[data-odv-toggle]{display:none!important}}</style>` +
    `<nav data-odv-toggle aria-label="Where the document is rendered" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;display:inline-flex;border:1px solid #0a0a0a;background:#fff;box-shadow:4px 4px 0 #ffd400">` +
    `<a href="/v/${encodeURIComponent(slug)}?src=${encodeURIComponent(src.href)}" title="Rendered in your browser by the engine" style="${seg}color:#0a0a0a">Browser</a>` +
    `<span aria-current="page" title="Rendered on this server; the browser gets finished pages" style="${seg}background:#0a0a0a;color:#fff">Server</span></nav>`;
  // The last closing body tag, found in one pass: a lookahead for "no later one" re-reads the rest
  // of the page at every candidate, which took seconds on a 29 MB page that names the tag often.
  let at = -1;
  for (const m of html.matchAll(/<\/body\s*>/gi)) at = m.index;
  return at < 0 ? html + bar : html.slice(0, at) + bar + html.slice(at);
}

function viewerMenu(e: Engine, src: URL): string {
  const srcQ = `?src=${encodeURIComponent(src.href)}`;
  const server = SERVER_RENDER_SLUGS.has(e.slug)
    ? `<a href="/r/${e.slug}${srcQ}">Server render of this document →<small>the engine runs on this server; the browser only gets the finished pages</small></a>`
    : "";
  return `      <div class="od-menu" id="od-menu" hidden>
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Engine</div>
        <div class="od-menu-note"><span class="chip${e.proprietary ? " is-prop" : ""}">${e.proprietary ? "proprietary" : "open source"} · ${e.editable ? "still editable" : "view-only"}</span><small>${esc(e.readOnly)}</small></div>
        <button type="button" id="od-remeasure" hidden title="Read JS heap, bytes and files loaded again, as the page is now">Re-measure now</button>${madeBy(e)}
        <hr />
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Site</div>
        ${server}
        ${e.vendorNote ? `<a href="${esc(e.vendorNote)}" target="_blank" rel="noopener">About ${esc(e.name)}: pros, cons, every benchmark →</a>` : ""}
        <a href="/">All engines &amp; results</a>
        <a href="${OPEN_DOCS}/" target="_blank" rel="noopener">open-docs editors →</a>
        <a href="${ARENA}" target="_blank" rel="noopener">Editors arena →</a>
        <a href="${SOURCE}" target="_blank" rel="noopener">Source →</a>
        <a href="https://arthur.law/contact" target="_blank" rel="noopener">Contact →</a>
      </div>`;
}

export function viewNavBar(e: Engine, engines: Engine[], src: URL): string {
  return `  <header class="site-nav od-bar odv-chrome">
    ${WORDMARK_HTML}
    <span class="crumb">/ viewers</span>
    <span class="od-spacer"></span>
    ${engineSwitcher(engines, e.slug, src)}
    ${renderToggle(e.slug, src, "browser", e.frame)}
    <span id="od-loading-detail" class="od-status-chip" role="status" aria-live="polite">Loading…</span>
    <div class="od-menu-wrap">
      ${menuBtn}
${viewerMenu(e, src)}
    </div>
  </header>`;
}

function landingMenu(): string {
  return `      <div class="od-menu" id="od-menu" hidden>
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Site</div>
        ${siteLinksMenu()}
      </div>`;
}

export function landingNavBar(): string {
  return `<header class="site-nav od-bar">
  ${WORDMARK_HTML}
  <span class="crumb">/ viewers</span>
  <span class="od-spacer"></span>
  <nav class="od-land-nav" aria-label="Site">${siteLinks()}</nav>
  <div class="od-menu-wrap">
    ${menuBtn}
${landingMenu()}
  </div>
</header>`;
}

/** Bar chrome CSS (wordmark, picker, menu). Merged into VIEWER_DS_CSS in render.ts. */
export const NAVBAR_CSS = `
body{margin:0}
.site-nav .wm{display:inline-flex;align-items:center;gap:6px;flex:none;font-family:var(--font-mono);font-weight:700;font-size:13px;line-height:1.4;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink);text-decoration:none;white-space:nowrap}
.site-nav .wm:hover .ins{background-image:linear-gradient(var(--mark),var(--mark));background-repeat:no-repeat;background-size:100% .55em;background-position:0 78%}
.site-nav .wm:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.site-nav .logo{display:inline-flex;align-items:center;gap:6px}
.site-nav .wm .dot{color:color-mix(in srgb,var(--ink) 35%,transparent)}
.site-nav .del{color:var(--del);text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:var(--del)}
.site-nav .ins{color:var(--ins);text-decoration:underline double;text-decoration-color:var(--ins);text-underline-offset:3px}
.site-nav .crumb{font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;flex:none}
.od-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:10px 14px;flex:none;flex-wrap:nowrap;min-height:52px;padding:8px clamp(12px,3vw,var(--px));
  background:color-mix(in srgb,var(--bg) 88%,transparent);-webkit-backdrop-filter:saturate(140%) blur(10px);backdrop-filter:saturate(140%) blur(10px);
  border-bottom:1px solid var(--ink)}
.od-spacer{flex:1;min-width:4px}
.od-switch{position:relative;display:inline-flex;align-items:center;flex:none;min-width:0}
.od-switch::after{content:"↓";position:absolute;right:8px;pointer-events:none;font-family:var(--font-mono);font-size:11px;color:var(--muted)}
.od-switch select{font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--ink);max-width:180px;height:32px;padding:0 28px 0 10px;
  border:1px solid var(--ink);border-radius:0;background:var(--surface);appearance:none;cursor:pointer}
.od-switch select:hover{background:var(--hover)}
.od-switch select:focus,.od-switch select:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.od-engine-pick .od-pick-icon{display:none;pointer-events:none}
.od-seg{display:inline-flex;flex:none;height:32px;border:1px solid var(--ink);background:var(--surface)}
.od-seg>*{display:inline-flex;align-items:center;padding:0 10px;font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink);text-decoration:none;white-space:nowrap}
.od-seg>*+*{border-left:1px solid var(--ink)}
.od-seg>.on{background:var(--ink);color:var(--surface)}
.od-seg>a:hover{background:var(--mark)}
.od-seg>a:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.od-seg>.off{color:var(--muted);text-decoration:line-through;cursor:not-allowed}
.od-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.od-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font-mono);font-size:11px;font-weight:400;letter-spacing:.04em;
  text-transform:uppercase;line-height:1.2;height:32px;padding:0 10px;border-radius:0;border:1px solid var(--ink);background:var(--surface);color:var(--ink);
  cursor:pointer;white-space:nowrap;text-decoration:none}
.od-btn:hover:not([disabled]){background:var(--mark);color:var(--ink)}
.od-btn:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.od-menu-btn[aria-expanded="true"]{background:var(--mark);color:var(--ink);border-color:var(--ink)}
.od-menu-btn{flex:none}
.od-burger{display:inline-flex;flex-direction:column;justify-content:space-between;width:14px;height:11px;flex:none}
.od-burger i{display:block;height:1px;background:currentColor;width:100%}
.od-menu-wrap{position:relative;flex:none;display:flex;align-items:center}
.od-menu{position:absolute;right:0;top:40px;min-width:290px;max-height:calc(100dvh - 64px);overflow:auto;background:var(--surface);border:1px solid var(--ink);
  border-radius:0;box-shadow:var(--shadow-offset);padding:6px;display:flex;flex-direction:column;z-index:50}
.od-menu[hidden]{display:none}
.od-menu>button:not([hidden]),.od-menu>a{font-family:var(--font-sans);font-size:14px;letter-spacing:-0.01em;text-transform:none;text-align:left;padding:8px 10px;border:0;background:none;
  border-radius:0;color:var(--ink);text-decoration:none;cursor:pointer;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.od-menu>button:hover,.od-menu>a:hover{background:var(--mark)}
.od-menu>button:focus-visible,.od-menu>a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.od-menu small{flex-basis:100%;margin-top:-2px;font-size:12px;color:var(--muted)}
.od-menu-label{display:flex;align-items:center;gap:8px;padding:8px 10px 2px;font-family:var(--font-mono);font-size:11px;font-weight:400;letter-spacing:.08em;
  text-transform:uppercase;color:var(--muted)}
.od-menu-label .sq{width:9px;height:9px;background:var(--mark);display:inline-block;flex:none}
.od-menu hr{border:0;border-top:1px solid var(--faint);margin:4px 2px}
.od-menu-note{font-size:12.5px;color:var(--ink-quiet);padding:4px 10px 8px;max-width:290px;line-height:1.45}
.od-menu-note .chip{margin-bottom:6px;display:inline-block}
.od-menu-note small{display:block;font-size:12px}
.od-status-chip{font-family:var(--font-mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-variant-numeric:tabular-nums;
  flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36ch}
.od-land-nav{margin-left:auto;display:flex;align-items:center;gap:18px;flex-wrap:nowrap;flex:none}
.od-land-nav>a{font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-decoration:none;
  border-bottom:2px solid transparent;padding-bottom:2px;white-space:nowrap}
.od-land-nav>a:hover{color:var(--ink);border-bottom-color:var(--mark)}
@media(max-width:1180px){.od-bar .crumb{display:none}}
@media(max-width:760px){
  /* On a phone the status takes a row of its own under the bar: hidden, a failed load and the
     result of "Re-measure now" (which closes the menu) were shown nowhere. */
  .od-bar{flex-wrap:wrap}
  .od-status-chip{order:1;flex:0 0 100%;max-width:none;white-space:normal;overflow:visible;overflow-wrap:anywhere}
  .od-seg{display:none} /* no room beside the wordmark on a phone: the Menu's first Site item is the same link */
  .od-menu-btn .od-menu-lbl{display:none}
  .od-menu-btn{width:32px;padding:0;justify-content:center}
  .od-engine-pick{display:inline-flex;position:relative;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--ink);background:var(--surface)}
  .od-engine-pick .od-pick-icon{display:block}
  .od-engine-pick::after{display:none}
  .od-engine-pick select{position:absolute;inset:0;width:100%;height:100%;min-width:0;max-width:none;opacity:0;padding:0}
  .od-engine-pick:focus-within{outline:2px solid var(--ink);outline-offset:3px}
  .od-engine-pick:hover{background:var(--mark)}
  .od-land-nav{display:none}
}
@media(max-width:640px){
  .od-bar{gap:6px;padding:6px 8px}
  .od-menu-wrap{position:static}
  .od-menu{position:absolute;left:8px;right:8px;top:100%;min-width:0;width:auto}
}
`;

/** Where the landing's form goes when its script did not run (`GET /go?engine=&src=`), or null when it names no engine or document. */
export function goTarget(engine: string | undefined, src: string | undefined, engines: Engine[]): string | null {
  if (!engine || !src || !engines.some((e) => e.slug === engine)) return null;
  return `/v/${engine}?src=${encodeURIComponent(src)}`;
}
