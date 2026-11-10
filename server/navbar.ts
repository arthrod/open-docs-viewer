/**
 * Shared open-docs navbar: wordmark, od-bar chrome, engine picker, MENU panel.
 * Markup and CSS follow NAVBAR_SPEC (open-docs od-int reference).
 */
import type { Engine } from "./engines.ts";
import { OPEN_DOCS } from "./engines.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ARENA = "https://editors-arena.val.run";
const SOURCE = "https://www.val.town/x/arthrod/open-docs-viewer";

/** Engines with GET /r/:slug server-rendered output. */
export const SERVER_RENDER_SLUGS = new Set([
  "docxodus",
  "folio",
  "wordcraft",
  "docen",
  "eigenpal",
  "plate",
]);

export const WORDMARK_HTML = `<a class="wm" href="/" title="All engines and results">
      <span class="logo"><span class="del">CHILL</span><span class="ins">NEUROTIC</span></span><span class="dot">.</span>DOCX<span class="dot">.</span>BENCH
    </a>`;

const siteLinks = () =>
  `<a href="${OPEN_DOCS}/#editors">Editors</a>
    <a href="${OPEN_DOCS}/#viewers">Viewers</a>
    <a href="/#measurements">Measurements</a>
    <a href="${ARENA}" target="_blank" rel="noopener">Arena →</a>
    <a href="${SOURCE}" target="_blank" rel="noopener">Source →</a>`;

const siteLinksMenu = () =>
  `<a role="menuitem" href="${OPEN_DOCS}/#editors">Editors</a>
        <a role="menuitem" href="${OPEN_DOCS}/#viewers">Viewers</a>
        <a role="menuitem" href="/#measurements">Measurements</a>
        <a role="menuitem" href="${ARENA}" target="_blank" rel="noopener">Arena →</a>
        <a role="menuitem" href="${SOURCE}" target="_blank" rel="noopener">Source →</a>`;

const menuBtn = `<button class="od-btn od-menu-btn" id="od-more" type="button" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded="false" aria-controls="od-menu">
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

function viewerMenu(e: Engine, src: URL): string {
  const srcQ = `?src=${encodeURIComponent(src.href)}`;
  const server = SERVER_RENDER_SLUGS.has(e.slug)
    ? `<a role="menuitem" href="/r/${e.slug}${srcQ}">This engine's server results →</a>`
    : "";
  return `      <div class="od-menu" id="od-menu" role="menu" hidden>
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Engine</div>
        <div class="od-menu-note"><span class="chip${e.proprietary ? " is-prop" : ""}">${e.proprietary ? "proprietary" : "open source"} · view-only</span><small>${esc(e.readOnly)}</small></div>
        <button role="menuitem" type="button" id="od-remeasure" hidden title="Read JS heap, bytes and files loaded again, as the page is now">Re-measure now</button>
        <hr />
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Site</div>
        <a role="menuitem" href="/">All engines &amp; results</a>
        ${server}
        <a role="menuitem" href="${OPEN_DOCS}/" target="_blank" rel="noopener">open-docs editors →</a>
        <a role="menuitem" href="${ARENA}" target="_blank" rel="noopener">Editors arena →</a>
        <a role="menuitem" href="${SOURCE}" target="_blank" rel="noopener">Source →</a>
      </div>`;
}

export function viewNavBar(e: Engine, engines: Engine[], src: URL): string {
  return `  <header class="site-nav od-bar odv-chrome">
    ${WORDMARK_HTML}
    <span class="crumb">/ viewer</span>
    <span class="od-spacer"></span>
    ${engineSwitcher(engines, e.slug, src)}
    <span id="od-loading-detail" class="od-status-chip" role="status" aria-live="polite">Loading…</span>
    <div class="od-menu-wrap">
      ${menuBtn}
${viewerMenu(e, src)}
    </div>
  </header>`;
}

function landingMenu(): string {
  return `      <div class="od-menu" id="od-menu" role="menu" hidden>
        <div class="od-menu-label"><span class="sq" aria-hidden="true"></span> / Site</div>
        ${siteLinksMenu()}
      </div>`;
}

export function landingNavBar(): string {
  return `<header class="site-nav od-bar">
  ${WORDMARK_HTML}
  <span class="crumb">/ viewer</span>
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
.od-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font-mono);font-size:11px;font-weight:400;letter-spacing:.04em;
  text-transform:uppercase;line-height:1.2;height:32px;padding:0 10px;border-radius:0;border:1px solid var(--ink);background:var(--surface);color:var(--ink);
  cursor:pointer;white-space:nowrap;text-decoration:none}
.od-btn:hover:not([disabled]){background:var(--mark);color:var(--ink)}
.od-btn:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.od-menu-btn[aria-expanded="true"]{background:var(--mark);color:var(--ink);border-color:var(--ink)}
.od-menu-btn{flex:none}
.od-burger{display:inline-flex;flex-direction:column;justify-content:space-between;width:14px;height:11px;flex:none}
.od-burger i{display:block;height:1px;background:currentColor;width:100%}
.od-menu-wrap{position:relative;flex:none}
.od-menu{position:absolute;right:0;top:40px;min-width:290px;max-height:calc(100dvh - 64px);overflow:auto;background:var(--surface);border:1px solid var(--ink);
  border-radius:0;box-shadow:var(--shadow-offset);padding:6px;display:flex;flex-direction:column;z-index:50}
.od-menu[hidden]{display:none}
.od-menu>button,.od-menu>a{font-family:var(--font-sans);font-size:14px;letter-spacing:-0.01em;text-transform:none;text-align:left;padding:8px 10px;border:0;background:none;
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
  .od-status-chip{display:none}
  .od-menu-btn .od-menu-lbl{display:none}
  .od-menu-btn{width:32px;padding:0;justify-content:center}
  .od-engine-pick{display:inline-flex;position:relative;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--ink);background:var(--surface)}
  .od-engine-pick .od-pick-icon{display:block}
  .od-engine-pick::after{display:none}
  .od-engine-pick select{position:absolute;inset:0;width:100%;height:100%;min-width:0;max-width:none;opacity:0;padding:0}
  .od-engine-pick:hover{background:var(--mark)}
  .od-land-nav{display:none}
}
@media(max-width:640px){
  .od-bar{gap:6px;padding:6px 8px}
  .od-menu-wrap{position:static}
  .od-menu{position:absolute;left:8px;right:8px;top:100%;min-width:0;width:auto}
}
`;
