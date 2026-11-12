/** The landing page: every engine, the cold measurements, a URL form. */
import type { Engine } from "./engines.ts";
import {
  type Results,
  SERVER_MEASURED_AT,
  SERVER_RESULTS,
  landingStatItems,
  statStripHtml,
} from "./results.ts";
import { landingNavBar } from "./navbar.ts";
import { VIEWER_DS_CSS } from "./render.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ms = (n: number | null | undefined) =>
  n == null ? "n/a" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
const mb = (n: number | null | undefined) =>
  n == null ? "n/a" : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function landingPage(engines: Engine[], results: Results, defaultSrc: string): string {
  const link = (e: Engine) => `/v/${e.slug}?src=${encodeURIComponent(defaultSrc)}`;
  const max = Math.max(1, ...engines.map((e) => results.engines[e.slug]?.renderedMs ?? 0));
  const row = (e: Engine) => {
    const r = results.engines[e.slug];
    const runs = r?.runs ?? [];
    const failed = runs.filter((x) => x == null).length;
    return `<tr>
      <td><a href="${link(e)}">${esc(e.name)}</a><div class="ro">${esc(e.readOnly)}</div></td>
      <td class="n"><b>${ms(r?.renderedMs)}</b></td>
      <td class="n hide-sm">${runs.length ? runs.map((x) => (x == null ? "fail" : ms(x))).join(" · ") : "n/a"}</td>
      <td class="n">${mb(r?.bytes)}</td>
      <td class="n hide-sm">${r?.requests ?? "n/a"}</td>
      <td class="n">${mb(r?.heapBytes)}</td>
      <td class="n hide-sm">${runs.length ? `${runs.length - failed}/${runs.length}` : "n/a"}</td>
      <td class="n hide-sm"><span class="odv-bar"><i style="width:${r?.renderedMs ? ((100 * r.renderedMs) / max).toFixed(1) : 0}%"></i></span></td>
    </tr>`;
  };
  const head = `<thead><tr><th>Engine</th><th class="n">Cold render</th><th class="n hide-sm">Each run</th><th class="n">Downloaded</th>
    <th class="n hide-sm">Requests</th><th class="n">JS heap</th><th class="n hide-sm">OK</th><th class="n hide-sm">Bar</th></tr></thead>`;
  const open = engines.filter((e) => !e.proprietary), prop = engines.filter((e) => e.proprietary);
  const options = engines.map((e) => `<option value="${e.slug}">${esc(e.name)}${e.proprietary ? " (proprietary)" : ""}</option>`).join("");
  const stats = statStripHtml(landingStatItems(engines.length, open.length, SERVER_RESULTS.length, results));

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>open-docs viewer · every .docx renderer, same document, same harness</title>
<meta name="description" content="View-only pages for eight open-source and four proprietary .docx renderers, fed the same public document URL and measured cold the same way." />
<style>${VIEWER_DS_CSS}</style>
<script type="module" src="/client/nav.ts"></script></head><body>
<div class="bl odv">
${landingNavBar()}
<div class="wrap">
<header class="hero">
  <h1>Every .docx renderer, the same document, the same harness.</h1>
  <p class="lede">Twelve engines as <strong>view-only</strong> pages that all take one input: a public .docx URL. Microsoft's and Google's
  viewers fetch it and render on their own servers; for the eight open-source engines and Apryse and Nutrient,
  this val's Deno server fetches it and the browser renders it in the engine's own read-only mode. Every page is
  measured cold by the same script. The editable versions live at <a href="https://open-docs.val.run">open-docs</a>.</p>
  <form class="odv-form" action="/go" method="get" onsubmit="event.preventDefault(); const f=new FormData(this); location.href='/v/'+f.get('engine')+'?src='+encodeURIComponent(f.get('src'));">
    <div class="fld"><label for="odv-src">Public .docx URL</label><input id="odv-src" name="src" type="url" required value="${esc(defaultSrc)}" /></div>
    <div class="fld"><label for="odv-engine">Engine</label><select id="odv-engine" name="engine" aria-label="Engine">${options}</select></div>
    <button class="btn btn-primary" type="submit">View</button>
  </form>
  <p class="fine">The URL goes to the engine you pick: to Microsoft or Google for theirs, to this val's server otherwise. Use only documents you are happy to publish.</p>
</header>

${stats}

<section class="odv-section">
  <div class="sec-label"><span class="sq"></span><span>/ Server render</span></div>
  <p class="fine">Six engines also run <strong>on the Val</strong>: the Deno server fetches the document, the engine lays it out and paints it, and the
browser receives finished pages. No engine code runs in your browser. Measured with plain HTTP: ${esc(SERVER_MEASURED_AT)}.
<strong>First</strong>: the first request to each engine after a deploy (engine download plus compile counted as init; only the first row also paid the isolate boot).
<strong>Warm</strong>: median of 5. Server time for SuperDoc and canvas-editor is not offered: both need a real browser (canvas measuring, DOM painting).</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">First</th><th class="n hide-sm">init · render</th><th class="n">Warm</th><th class="n hide-sm">render</th><th class="n">Sent</th><th>How</th></tr></thead><tbody>
${SERVER_RESULTS.map((r) => `<tr><td><a href="/r/${r.slug}?src=${encodeURIComponent(defaultSrc)}">${esc(r.name)}</a><div class="ro">${
    r.output === "images" ? "page images" : r.output === "pages" ? "positioned pages" : r.output === "browser-paginated" ? "pages; breaks computed in the browser" : "flowing HTML"
  }</div></td>
<td class="n"><b>${ms(r.firstMs)}</b></td><td class="n hide-sm">${ms(r.firstInitMs)} · ${ms(r.firstRenderMs)}</td><td class="n"><b>${ms(r.warmMs)}</b></td><td class="n hide-sm">${ms(r.warmRenderMs)}</td>
<td class="n">${mb(r.bytes)}</td><td class="ro">${esc(r.how)}</td></tr>`).join("")}
</tbody></table></div>
</section>

<section class="odv-section" id="measurements">
  <div class="sec-label"><span class="sq"></span><span>/ Cold browser</span></div>
  <p class="fine">${
    results.measuredAt
      ? `Measured ${esc(results.measuredAt)} · ${esc(results.environment)} · document: <code>${esc(results.document)}</code>.`
      : "Not measured yet."
  }
<strong>Cold render</strong>: navigation start to the document on screen (the page's own signal, the document's title as text, or a rendered page image, whichever comes first), median of the runs.
<strong>Downloaded</strong>: every request in every frame, headers plus bodies. <strong>JS heap</strong>: the page plus every out-of-process frame.
Each run is a fresh browser and a document URL no engine has seen, so no vendor cache can answer it.
<strong>Refreshing</strong>: the table is <a href="https://github.com/arthrod/open-docs-viewer/blob/main/results/browser.json">results/browser.json</a>, re-measured by the
<a href="https://github.com/arthrod/open-docs-viewer/actions/workflows/remeasure.yml">Re-measure workflow</a> (on demand and weekly) or <code>scripts/remeasure.sh</code>, and read here within 5 minutes.
Each engine page also has <strong>Re-measure now</strong> for your own browser, as the page is at that moment.</p>
  <div class="table-wrap"><table class="tbl">${head}<tbody>${open.map(row).join("")}</tbody>
<tbody><tr class="odv-sep"><th colspan="8">Proprietary · view-only by nature. Microsoft and Google render on their servers; Apryse and Nutrient run unlicensed in evaluation mode (watermarked).</th></tr>${prop.map(row).join("")}</tbody></table></div>
</section>

<footer class="odv-foot">Source: <a href="https://www.val.town/x/arthrod/open-docs-viewer">val.town/x/arthrod/open-docs-viewer</a> · engines from <a href="https://github.com/arthrod/open-docs">github.com/arthrod/open-docs</a> · fixture: <a href="https://huggingface.co/datasets/arthrod/open-docs-fixtures">huggingface.co/datasets/arthrod/open-docs-fixtures</a></footer>
</div>
<footer class="site-foot"><div class="wrap" style="padding:0">open-docs viewer · method page for comparing .docx renderers</div></footer>
</div></body></html>`;
}
