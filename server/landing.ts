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
import { SAMPLE_RESULTS, type Sample, type SampleResults, SAMPLES, sampleUrl, LIGHTHOUSE, type LighthouseResults, SERVER_CLIENT, type ServerClientResults } from "./samples.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ms = (n: number | null | undefined) =>
  n == null ? "n/a" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
const mb = (n: number | null | undefined) =>
  n == null ? "n/a" : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/**
 * The other documents (redline, 500 pages): one table per sample, the /v/
 * page (browser) and the /r/ route (server) side by side. A cell that failed
 * says so; nothing is left out because it looks bad.
 */
/** Who renders a vendor's embed viewer (the visitor's browser only shows their frame). */
const VENDOR: Record<string, string> = { "word-online": "Microsoft", "google-viewer": "Google" };

/**
 * The browser's side of a server render, on the rich sample: the seven /r/
 * routes, then the two vendor viewers, which are server renders too (their
 * row is the /v/ page that frames them).
 */
export function serverClientTable(engines: Engine[], results: Results, defaultSrc: string, client: ServerClientResults = SERVER_CLIENT): string {
  const doc = client.docs.showcase ?? {};
  const q = encodeURIComponent(defaultSrc);
  const rows = SERVER_RESULTS.map((r) => {
    const c = doc[r.slug];
    if (!c) return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a></td><td colspan="6" class="ro">not measured yet</td></tr>`;
    if (c.loadMs == null) return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a></td><td colspan="6"><span class="odv-fail">failed</span> <span class="ro">${esc(c.error ?? "")}</span></td></tr>`;
    return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a></td><td class="n"><b>${ms(c.loadMs)}</b></td><td class="n hide-sm">${ms(c.paintMs)}</td>
<td class="n">${mb(c.heapBytes)}</td><td class="n">${mb(c.rendererRss)}</td><td class="n hide-sm">${c.domNodes?.toLocaleString("en-US") ?? "n/a"}</td><td class="n hide-sm">${mb(c.bytes)}</td></tr>`;
  }).join("");
  const vendors = engines.filter((e) => e.frame).map((e) => {
    const b = results.engines[e.slug];
    return `<tr><td><a href="/v/${e.slug}?src=${q}">${esc(e.name)}</a><div class="ro">rendered on ${VENDOR[e.slug] ?? "the vendor"}'s servers; loaded = the frame's load event</div></td>
<td class="n"><b>${ms(b?.renderedMs)}</b></td><td class="n hide-sm">n/a</td><td class="n">${mb(b?.heapBytes)}</td><td class="n">n/a</td><td class="n hide-sm">n/a</td><td class="n hide-sm">${mb(b?.bytes)}</td></tr>`;
  }).join("");
  return `<p class="fine"><strong>What the browser pays for a server render.</strong> The same routes opened in Chrome, rich sample. Measured ${esc(client.measuredAt ?? "")} · ${esc(client.environment)}.
<strong>Loaded</strong>: navigation start to the end of the load event, so it includes the server's render and the download. <strong>JS heap</strong>: about an empty page's, because no engine script runs
(Docxodus's paginator excepted). <strong>Renderer memory</strong>: every renderer process of that Chrome, Chrome's spare one included: compare rows with each other.</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">Loaded</th><th class="n hide-sm">First paint</th><th class="n">JS heap</th><th class="n">Renderer memory</th><th class="n hide-sm">DOM nodes</th><th class="n hide-sm">Downloaded</th></tr></thead>
<tbody>${rows}</tbody>
<tbody><tr class="odv-sep"><th colspan="7">Vendor viewers · also server renders, on the vendor's machines. Their page here is only a frame.</th></tr>${vendors}</tbody></table></div>`;
}

/** PageSpeed Insights, every engine: its /v/ page, and its /r/ page where it has one. */
export function lighthouseSection(engines: Engine[], lh: LighthouseResults = LIGHTHOUSE): string {
  if (!Object.keys(lh.pages ?? {}).length) return "";
  const score = (n: number | null | undefined) => n == null ? "n/a" : `<b class="lh ${n >= 90 ? "lh-good" : n >= 50 ? "lh-mid" : "lh-bad"}">${n}</b>`;
  const table = (pages: LighthouseResults["pages"], q: string) => {
  const psi = (path: string) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://viewers.benchmarks.law/${path}${q}`)}`;
  const row = (e: Engine) => {
    const v = pages[`v/${e.slug}`], r = pages[`r/${e.slug}`];
    if (!v) return "";
    const server = !r ? `<span class="ro">${e.frame ? "vendor's servers" : "no server route"}</span>`
      : r.desktop.performance == null && r.mobile.performance == null ? `<span class="odv-fail">no result</span><div class="ro">${esc((r.desktop.error ?? r.mobile.error ?? "").slice(0, 60))}</div>`
      : `<a href="${psi(`r/${e.slug}`)}" target="_blank" rel="noopener">${score(r.desktop.performance)} · ${score(r.mobile.performance)}</a><div class="ro">LCP ${ms(r.desktop.lcpMs)} · ${ms(r.mobile.lcpMs)}</div>`;
    const d = v.desktop, m = v.mobile;
    if (d.performance == null && m.performance == null) return `<tr><td><a href="/v/${e.slug}${q}">${esc(e.name)}</a></td><td colspan="7"><span class="odv-fail">no result</span> <span class="ro">${esc((d.error ?? m.error ?? "").slice(0, 140))}</span></td><td class="n">${server}</td></tr>`;
    return `<tr><td><a href="/v/${e.slug}${q}">${esc(e.name)}</a><div class="ro"><a href="${psi(`v/${e.slug}`)}" target="_blank" rel="noopener">run it on PageSpeed →</a></div></td>
<td class="n">${score(d.performance)} · ${score(m.performance)}</td><td class="n">${ms(d.lcpMs)} · ${ms(m.lcpMs)}</td><td class="n">${ms(d.tbtMs)} · ${ms(m.tbtMs)}</td><td class="n hide-sm">${d.cls ?? "n/a"} · ${m.cls ?? "n/a"}</td>
<td class="n hide-sm">${score(d.accessibility)}</td><td class="n hide-sm">${score(d.bestPractices)}</td><td class="n hide-sm">${score(d.seo)}</td><td class="n">${server}</td></tr>`;
  };
  return `<div class="table-wrap"><table class="tbl lh-tbl"><thead><tr><th>Engine</th><th class="n">Performance</th><th class="n">LCP</th><th class="n">TBT</th><th class="n hide-sm">CLS</th>
<th class="n hide-sm">Accessibility</th><th class="n hide-sm">Best practices</th><th class="n hide-sm">SEO</th><th class="n">Server route</th></tr></thead>
<tbody>${engines.map(row).join("")}</tbody></table></div>`;
  };
  const big = SAMPLES.find((x) => x.id === "lorem-500");
  const bigPages = lh.docs?.["lorem-500"];
  const bigTable = big && bigPages && Object.keys(bigPages).length
    ? `<h3 class="odv-h3" id="lighthouse-lorem-500">${esc(big.label)} <span class="ro">${esc(big.file)} · the same pages opening the long file</span></h3>
  <p class="fine">PageSpeed gives a page a fixed time to load; an engine still working when it ends is scored on what it had drawn, and a page that had not answered gets no result.</p>
  ${table(bigPages, `?src=${encodeURIComponent(sampleUrl(big))}`)}`
    : "";
  return `<section class="odv-section" id="lighthouse">
  <div class="sec-label"><span class="sq"></span><span>/ Lighthouse</span></div>
  <p class="fine">Google's <a href="https://pagespeed.web.dev">PageSpeed Insights</a> on every engine's page with the rich sample: Lighthouse run on Google's machines, so the figures do not depend on anyone's computer.
Measured ${esc(lh.measuredAt ?? "")} · ${esc(lh.environment)}. Every cell reads <strong>desktop · mobile</strong>; mobile emulates a mid-range phone on slow 4G. Scores are 0 to 100.
<strong>LCP</strong>: largest contentful paint. <strong>TBT</strong>: total blocking time, how long the main thread was too busy to answer input. <strong>CLS</strong>: layout shift.
Accessibility, best practices and SEO are the desktop scores. Lighthouse scores the page load, not how faithfully the document is drawn. For Microsoft's and Google's viewers it sees this site's frame page, not their servers' work.
<strong>Server route</strong>: the performance score and LCP of the same engine's <code>/r/</code> page.</p>
  ${table(lh.pages, "")}
  ${bigTable}
</section>`;
}

export function samplesSection(engines: Engine[], res: SampleResults = SAMPLE_RESULTS, client: ServerClientResults = SERVER_CLIENT): string {
  const tables = SAMPLES.filter((s) => res.samples[s.id]).map((s: Sample) => {
    const r = res.samples[s.id];
    const src = encodeURIComponent(sampleUrl(s));
    const row = (e: Engine) => {
      const b = r.browser[e.slug], v = r.server[e.slug];
      if (!b && !v) {
        // Added to the registry after this measurement: say so, rather than a row of blanks.
        return `<tr><td><a href="/v/${e.slug}?src=${src}">${esc(e.name)}</a></td><td colspan="6" class="ro">not measured on this file yet</td></tr>`;
      }
      const runs = b?.runs ?? [];
      const browser = !b
        ? "n/a"
        : b.renderedMs == null
        ? `<span class="odv-fail" title="${esc(b.how ?? "")}">failed</span>`
        : `<b>${ms(b.renderedMs)}</b>`;
      const c = client.docs[s.id]?.[e.slug];
      const inBrowser = !c ? "" : c.loadMs == null
        ? `<div class="ro">in the browser: <span class="odv-fail">failed</span> ${esc(c.error ?? "")}</div>`
        : `<div class="ro">in the browser: loaded ${ms(c.loadMs)} · heap ${mb(c.heapBytes)} · memory ${mb(c.rendererRss)}</div>`;
      const server = e.frame
        ? `<span class="ro">rendered on ${VENDOR[e.slug] ?? "the vendor"}'s servers: the columns on the left are their frame</span>`
        : !v
        ? `<span class="ro">no server route</span>`
        : v.code !== 200
        ? `<span class="odv-fail">failed</span><div class="ro">${esc(v.error ?? `HTTP ${v.code}`)}</div>`
        : `<a href="/r/${e.slug}?src=${src}"><b>${ms(v.totalMs)}</b></a><div class="ro">render ${ms(v.renderMs)} · ${mb(v.bytes)} sent${v.pages ? ` · ${v.pages} pages` : ""}</div>${inBrowser}`;
      return `<tr>
      <td><a href="/v/${e.slug}?src=${src}">${esc(e.name)}</a>${b && b.renderedMs == null && b.how ? `<div class="ro">${esc(b.how.slice(0, 140))}</div>` : ""}</td>
      <td class="n">${browser}</td>
      <td class="n hide-sm">${runs.length ? runs.map((x) => (x == null ? "fail" : ms(x))).join(" · ") : "n/a"}</td>
      <td class="n">${mb(b?.heapBytes)}</td>
      <td class="n">${mb(b?.rendererRss)}</td>
      <td class="n hide-sm">${mb(b?.bytes)}</td>
      <td class="n">${server}</td>
    </tr>`;
    };
    return `<h3 class="odv-h3" id="sample-${s.id}">${esc(s.label)} <span class="ro">${esc(s.file)} · ${esc(s.note)}</span></h3>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">Cold render</th><th class="n hide-sm">Each run</th><th class="n">JS heap</th>
    <th class="n">Renderer memory</th><th class="n hide-sm">Downloaded</th><th class="n">Server render</th></tr></thead>
  <tbody>${engines.map(row).join("")}</tbody></table></div>`;
  });
  if (!tables.length) return "";
  return `<section class="odv-section" id="samples">
  <div class="sec-label"><span class="sq"></span><span>/ Other documents</span></div>
  <p class="fine">The same harness on two harder files. Measured ${esc(res.measuredAt ?? "")} · ${esc(res.environment)}.
<strong>Cold render</strong>: navigation start to the page's own "document is showing" signal; on 500 pages an engine may still be laying out the pages below the first screen.
<strong>JS heap</strong>: JavaScript objects of the top page only. <strong>Renderer memory</strong>: resident memory of every renderer process of that Chrome,
which also counts WebAssembly memory, canvases, the DOM and cross-origin frames (Chrome's own spare renderer is in it too, so compare engines with each other rather than reading it as an absolute).
<strong>Server render</strong>: the <code>/r/</code> route, wall clock by <code>curl</code>, median; seven engines have one (SuperDoc's sends unpaginated HTML).
<strong>In the browser</strong>, under it: the same route opened in Chrome (${esc(client.measuredAt ?? "")}), navigation start to the end of the load event, with the page's JS heap and that Chrome's renderer memory.
Whether an engine <em>draws</em> the redline's tracked changes is a different question from how fast it opens it: open each link and look.</p>
  ${tables.join("\n")}
</section>`;
}

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
  viewers fetch it and render on their own servers (nothing of theirs renders in your browser: the page here is a frame); for the eight open-source engines and Apryse and Nutrient,
  this val's Deno server fetches it and the browser renders it in the engine's own read-only mode. Every page is
  measured cold by the same script. The editable versions live at <a href="https://editors.benchmarks.law">open-docs</a>.</p>
  <form class="odv-form" action="/go" method="get" onsubmit="event.preventDefault(); const f=new FormData(this); location.href='/v/'+f.get('engine')+'?src='+encodeURIComponent(f.get('src'));">
    <div class="fld"><label for="odv-src">Public .docx URL</label><input id="odv-src" name="src" type="url" required value="${esc(defaultSrc)}" /></div>
    <div class="fld"><label for="odv-engine">Engine</label><select id="odv-engine" name="engine" aria-label="Engine">${options}</select></div>
    <button class="btn btn-primary" type="submit">View</button>
  </form>
  <p class="odv-samples"><span>Samples</span>${
    SAMPLES.map((s) => `<button type="button" class="btn btn-ghost" data-src="${esc(sampleUrl(s))}" title="${esc(s.note)}" onclick="document.getElementById('odv-src').value=this.dataset.src">${esc(s.label)}</button>`).join("")
  }</p>
  <p class="fine">The URL goes to the engine you pick: to Microsoft or Google for theirs, to this val's server otherwise. Use only documents you are happy to publish.</p>
</header>

${stats}

<section class="odv-section">
  <div class="sec-label"><span class="sq"></span><span>/ Server render</span></div>
  <p class="fine">Seven engines also run <strong>on the Val</strong>: the Deno server fetches the document, the engine lays it out and paints it, and the
browser receives finished pages. No engine code runs in your browser. Measured with plain HTTP: ${esc(SERVER_MEASURED_AT)}.
<strong>First</strong>: the first request to each engine after a deploy (engine download plus compile counted as init; only the first row also paid the isolate boot).
<strong>Warm</strong>: median of 5. SuperDoc's row is not its paginated view, which needs a browser: it is the engine's headless HTML projection, with no page breaks, colours or pictures. canvas-editor has no server route: it draws to a canvas throughout.</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">First</th><th class="n hide-sm">init · render</th><th class="n">Warm</th><th class="n hide-sm">render</th><th class="n">Sent</th><th>How</th></tr></thead><tbody>
${SERVER_RESULTS.map((r) => `<tr><td><a href="/r/${r.slug}?src=${encodeURIComponent(defaultSrc)}">${esc(r.name)}</a><div class="ro">${
    r.output === "images" ? "page images" : r.output === "pages" ? "positioned pages" : r.output === "browser-paginated" ? "pages; breaks computed in the browser" : "flowing HTML"
  }</div></td>
<td class="n"><b>${ms(r.firstMs)}</b></td><td class="n hide-sm">${ms(r.firstInitMs)} · ${ms(r.firstRenderMs)}</td><td class="n"><b>${ms(r.warmMs)}</b></td><td class="n hide-sm">${ms(r.warmRenderMs)}</td>
<td class="n">${mb(r.bytes)}</td><td class="ro">${esc(r.how)}</td></tr>`).join("")}
</tbody></table></div>
  ${serverClientTable(engines, results, defaultSrc)}
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

${lighthouseSection(engines)}

${samplesSection(engines)}

<footer class="odv-foot">Source: <a href="https://www.val.town/x/arthrod/open-docs-viewer">val.town/x/arthrod/open-docs-viewer</a> · engines from <a href="https://github.com/arthrod/open-docs">github.com/arthrod/open-docs</a> · fixture: <a href="https://huggingface.co/datasets/arthrod/open-docs-fixtures">huggingface.co/datasets/arthrod/open-docs-fixtures</a></footer>
</div>
<footer class="site-foot"><div class="wrap" style="padding:0">open-docs viewer · method page for comparing .docx renderers</div></footer>
</div></body></html>`;
}
