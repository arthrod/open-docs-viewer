/** The landing page: every engine, the cold measurements, a URL form. */
import { type Engine, NO_SERVER, noServerCell } from "./engines.ts";
import {
  type Results,
  SERVER_FILE_HEAD,
  SERVER_MEASURED_AT,
  SERVER_RESULTS,
  landingStatItems,
  statStripHtml,
} from "./results.ts";
import { landingNavBar, SERVER_RENDER_SLUGS } from "./navbar.ts";
/** A count in words, as the copy has it; the routes are counted, not typed. */
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen"];
import CAVEATS from "../results/caveats.json" with { type: "json" };
import { VIEWER_DS_CSS } from "./render.ts";
import { SAMPLE_RESULTS, type Sample, type SampleResults, SAMPLES, sampleUrl, LIGHTHOUSE, LIGHTHOUSE_LOCAL, type LighthousePage, type LighthouseResults, SERVER_CLIENT, type ServerClientResults } from "./samples.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ms = (n: number | null | undefined) =>
  n == null ? "n/a" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
/** Said under a figure measured on another day than its table's heading (a partial re-run). */
const when = (row: { measuredAt?: string } | undefined, head: { measuredAt?: string | null }) =>
  row?.measuredAt && row.measuredAt !== head.measuredAt ? `<div class="ro odv-prov">measured ${esc(row.measuredAt)}</div>` : "";
/** Said beside a heap whose garbage could not be collected first in some runs (the median leaves them out while it can). */
const uncollected = (r?: { heapNotCollected?: number } | null) =>
  r?.heapNotCollected ? ` <small class="odv-fail">not collected first in ${r.heapNotCollected} run${r.heapNotCollected === 1 ? "" : "s"}</small>` : "";
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
 * The browser's side of a server render, on the rich sample: the /r/
 * routes, then the two vendor viewers, which are server renders too (their
 * row is the /v/ page that frames them).
 */
/** Inline code in a reason (`like this`), after escaping. */
const coded = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

/**
 * Every engine without a server route, and the reason (server/no-server.json):
 * what stops it, or that it is possible and not built. An engine with no entry
 * there is listed as unexplained rather than left out.
 */
export function noServerList(engines: Engine[]): string {
  const rows = engines.filter((e) => !e.frame && !SERVER_RENDER_SLUGS.has(e.slug));
  if (!rows.length) return "";
  const kind = { "needs-a-browser": "needs a browser", "needs-native": "needs native code", "not-built": "possible, not built" } as const;
  return `<h3 class="smp-h" id="no-server">No server route, and why</h3>
  <p class="fine">A server route runs the engine inside this Val: Deno, with WebAssembly and JavaScript, and no DOM, no canvas, no native binaries and no subprocesses.
  Each engine below has only the browser page; Microsoft's and Google's viewers always render on their own servers.</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th>Why there is no server route</th></tr></thead><tbody>
${rows.map((e) => {
    const n = NO_SERVER[e.slug];
    return `<tr><td><a href="/v/${e.slug}">${esc(e.name)}</a><div class="ro">${n ? kind[n.status] : "not explained yet"}</div></td><td>${n ? coded(n.why) : "no reason recorded"}</td></tr>`;
  }).join("\n")}
  </tbody></table></div>`;
}

export function serverClientTable(engines: Engine[], results: Results, defaultSrc: string, client: ServerClientResults = SERVER_CLIENT): string {
  const doc = client.docs?.showcase ?? {};
  const q = encodeURIComponent(defaultSrc);
  const rows = SERVER_RESULTS.map((r) => {
    const c = doc[r.slug];
    if (!c) return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a></td><td colspan="6" class="ro">not measured yet</td></tr>`;
    if (c.loadMs == null) return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a></td><td colspan="6"><span class="odv-fail">failed</span> <span class="ro">${esc(c.error ?? "")}</span></td></tr>`;
    return `<tr><td><a href="/r/${r.slug}?src=${q}">${esc(r.name)}</a>${when(c, client)}</td><td class="n"><b>${ms(c.loadMs)}</b></td><td class="n hide-sm">${ms(c.paintMs)}</td>
<td class="n">${mb(c.heapBytes)}${uncollected(c)}</td><td class="n">${mb(c.rendererRss)}</td><td class="n hide-sm">${c.domNodes?.toLocaleString("en-US") ?? "n/a"}</td><td class="n hide-sm">${mb(c.bytes)}</td></tr>`;
  }).join("");
  const vendors = engines.filter((e) => e.frame).map((e) => {
    const b = results.engines[e.slug];
    return `<tr><td><a href="/v/${e.slug}?src=${q}">${esc(e.name)}</a><div class="ro">rendered on ${VENDOR[e.slug] ?? "the vendor"}'s servers; loaded = the frame's load event</div></td>
<td class="n"><b>${ms(b?.renderedMs)}</b></td><td class="n hide-sm">n/a</td><td class="n" title="The viewer runs in the vendor's cross-origin frame: its heap cannot be read from this page">n/a</td><td class="n">n/a</td><td class="n hide-sm">n/a</td><td class="n hide-sm">${mb(b?.bytes)}</td></tr>`;
  }).join("");
  return `<p class="fine"><strong>What the browser pays for a server render.</strong> The same routes opened in Chrome, rich sample. Measured ${esc(client.measuredAt ?? "")} · ${esc(client.environment)}.
<strong>Loaded</strong>: navigation start to the end of the load event, so it includes the server's render and the download. <strong>JS heap</strong>: about an empty page's, because no engine script runs
(Docxodus's paginator excepted). WordCraft's page loads its first two page images with the page and each other one as it nears the viewport, so its row is opening the document, not scrolling through it. <strong>Renderer memory</strong>: every renderer process of that Chrome, Chrome's spare one included: compare rows with each other.</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">Loaded</th><th class="n hide-sm">First paint</th><th class="n">JS heap</th><th class="n">Renderer memory</th><th class="n hide-sm">DOM nodes</th><th class="n hide-sm">Downloaded</th></tr></thead>
<tbody>${rows}</tbody>
<tbody><tr class="odv-sep"><th colspan="7">Vendor viewers · also server renders, on the vendor's machines. Their page here is only a frame.</th></tr>${vendors}</tbody></table></div>`;
}

/** PageSpeed Insights, every engine: its /v/ page, and its /r/ page where it has one. */
/** `local` defaults to the repository's file only beside the repository's PageSpeed file: a caller with its own data gets none of ours. */
export function lighthouseSection(
  engines: Engine[],
  lh: LighthouseResults = LIGHTHOUSE,
  local: LighthouseResults = lh === LIGHTHOUSE ? LIGHTHOUSE_LOCAL : { measuredAt: null, environment: "", pages: {} },
): string {
  // Either table is enough to show the section: the 500 pages can be analysed on their own.
  // The four populations stand by themselves: PageSpeed's two, and the two measured on our computer.
  const some = (p?: Record<string, unknown>) => Object.keys(p ?? {}).length > 0;
  const localSome = some(local.pages) || some(local.docs?.["lorem-500"]);
  if (!some(lh.pages) && !some(lh.docs?.["lorem-500"]) && !localSome) return "";
  const score = (n: number | null | undefined) => n == null ? "n/a" : `<b class="lh ${n >= 90 ? "lh-good" : n >= 50 ? "lh-mid" : "lh-bad"}">${n}</b>`;
  // `ours`: a pass made on our computer. Its scores do not link to PageSpeed.
  const table = (pages: LighthouseResults["pages"], q: string, head: { measuredAt?: string | null; environment?: string }, ours = false) => {
  // A page analysed in another run than the table's heading (a partial re-run) says when.
  const elsewhere = (p: { measuredAt?: string; environment?: string } | undefined) =>
    p && ((p.measuredAt && p.measuredAt !== head.measuredAt) || (p.environment && p.environment !== head.environment))
      ? `<div class="ro odv-prov">measured ${esc(p.measuredAt ?? "")} · ${esc(p.environment ?? "")}</div>`
      : "";
  const psi = (path: string) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://viewers.benchmarks.law/${path}${q}`)}`;
  const row = (e: Engine) => {
    const v = pages[`v/${e.slug}`], r = pages[`r/${e.slug}`];
    if (!v && !r) return "";
    // A median over fewer analyses than were run says so, with the reason the others gave.
    const partial = (p: { desktop: LighthousePage; mobile: LighthousePage }) => {
      const one = (f: string, x: LighthousePage) => {
        const got = x.performanceRuns.filter((n) => n != null).length;
        return got === x.performanceRuns.length ? "" : `${f} ${got}/${x.performanceRuns.length} analyses${x.error ? `: ${esc(x.error.slice(0, 110))}` : ""}`;
      };
      // Analyses that differ by 10 points or more: a median of a few of them moves from day to day.
      const spread = (f: string, x: LighthousePage) => {
        const runs = (x.performanceRuns ?? []).filter((n): n is number => typeof n === "number");
        if (runs.length < 2) return "";
        const lo = Math.min(...runs), hi = Math.max(...runs);
        return hi - lo >= 10 ? `${f} analyses ranged ${lo} to ${hi}` : "";
      };
      const text = [one("desktop", p.desktop), one("mobile", p.mobile), spread("desktop", p.desktop), spread("mobile", p.mobile)].filter(Boolean).join(" · ");
      return text ? `<div class="ro odv-part">${text}</div>` : "";
    };
    const server = !r ? `<span class="ro">${e.frame ? "vendor's servers" : SERVER_RENDER_SLUGS.has(e.slug) ? "not measured yet" : esc(noServerCell(e.slug))}</span>`
      : r.desktop.performance == null && r.mobile.performance == null ? `<span class="odv-fail">no result</span><div class="ro">${esc((r.desktop.error ?? r.mobile.error ?? "").slice(0, 60))}</div>`
      : `${ours ? "" : `<a href="${psi(`r/${e.slug}`)}" target="_blank" rel="noopener">`}${score(r.desktop.performance)} · ${score(r.mobile.performance)}${ours ? "" : "</a>"}<div class="ro">LCP ${ms(r.desktop.lcpMs)} · ${ms(r.mobile.lcpMs)}</div>${partial(r)}${elsewhere(r)}`;
    // The server route was measured on its own: keep its cell, say the browser page was not.
    if (!v) return `<tr><td><a href="/v/${e.slug}${q}">${esc(e.name)}</a></td><td colspan="7" class="ro">not measured yet</td><td class="n">${server}</td></tr>`;
    const d = v.desktop, m = v.mobile;
    if (d.performance == null && m.performance == null) return `<tr><td><a href="/v/${e.slug}${q}">${esc(e.name)}</a></td><td colspan="7"><span class="odv-fail">no result</span> <span class="ro">${esc((d.error ?? m.error ?? "").slice(0, 140))}</span></td><td class="n">${server}</td></tr>`;
    return `<tr><td><a href="/v/${e.slug}${q}">${esc(e.name)}</a>${ours ? "" : `<div class="ro"><a href="${psi(`v/${e.slug}`)}" target="_blank" rel="noopener">run it on PageSpeed →</a></div>`}${partial(v)}${elsewhere(v)}</td>
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
  <p class="fine">PageSpeed gives a page a fixed time to load; an engine still working when it ends is scored on what it had drawn, and a page that had not answered gets no result.${
      lh.docsMeta?.["lorem-500"] ? ` Measured ${esc(lh.docsMeta["lorem-500"].measuredAt)} · ${esc(lh.docsMeta["lorem-500"].environment)}.` : ""
    }</p>
  ${table(bigPages, `?src=${encodeURIComponent(sampleUrl(big))}`, lh.docsMeta?.["lorem-500"] ?? lh)}`
    : "";
  const localBig = local.docs?.["lorem-500"];
  const localHead = local.docsMeta?.["lorem-500"];
  const localBlock = localSome
    ? `<h3 class="odv-h3" id="lighthouse-local">Lighthouse on our computer <span class="ro">the same pages, the same Lighthouse release, on a machine with a graphics card</span></h3>
  <p class="fine">On Google's machines two engines do not start (their files do not download there; why is not known), so they have no score above. This computer has a graphics card, which Google's machines do not.
So the same Lighthouse was also run here, on every page and not only on those. These figures depend on this computer and on what else it was doing:
the heading gives its load and Lighthouse's own reading of how fast its processor was. Compare rows within this table, not with the one above.
${some(local.pages) ? `Measured ${esc(local.measuredAt ?? "")} · ${esc(local.environment)}.` : ""}</p>
  ${some(local.pages) ? table(local.pages, "", local, true) : ""}${
      big && localBig && Object.keys(localBig).length
        ? `<h3 class="odv-h3" id="lighthouse-local-lorem-500">${esc(big.label)}, on our computer <span class="ro">${esc(big.file)}</span></h3>${
          localHead && (!some(local.pages) || localHead.measuredAt !== local.measuredAt || localHead.environment !== local.environment)
            ? `<p class="fine">Measured ${esc(localHead.measuredAt)} · ${esc(localHead.environment)}.</p>`
            : ""
        }
  ${table(localBig, `?src=${encodeURIComponent(sampleUrl(big))}`, localHead ?? local, true)}`
        : ""
    }`
    : "";
  return `<section class="odv-section" id="lighthouse">
  <div class="sec-label"><span class="sq"></span><span>/ Lighthouse</span></div>
  <p class="fine">Google's <a href="https://pagespeed.web.dev">PageSpeed Insights</a> on every engine's page with the rich sample: Lighthouse run on Google's machines, so the figures do not depend on anyone's computer.
Measured ${esc(lh.measuredAt ?? "")} · ${esc(lh.environment)}. Every cell reads <strong>desktop · mobile</strong>; mobile emulates a mid-range phone on slow 4G. Scores are 0 to 100.
<strong>LCP</strong>: largest contentful paint. <strong>TBT</strong>: total blocking time, how long the main thread was too busy to answer input. <strong>CLS</strong>: layout shift.
Accessibility, best practices and SEO are the desktop scores. Lighthouse scores the page load, not how faithfully the document is drawn. For Microsoft's and Google's viewers it sees this site's frame page, not their servers' work.
An engine that could not start on Google's machine has no score (a failed page paints fast, and its score would flatter it): WordCraft's and Nutrient's engines (22 and 24 MB over the network) do not download there.
<strong>Server route</strong>: the performance score and LCP of the same engine's <code>/r/</code> page.</p>
  ${table(lh.pages, "", lh)}
  ${bigTable}
  ${localBlock}
</section>`;
}

/** Routes whose page images are separate requests, made as each page nears the viewport (WordCraft). */
const IMAGES_ON_DEMAND = new Set(SERVER_RESULTS.filter((r) => r.output === "images").map((r) => r.slug));

/**
 * Published figures that were looked at again and found wrong, unreliable or about the machine
 * (results/caveats.json; the README's "Figures to distrust" has the evidence).
 */
export type Caveats = Record<string, Record<string, string> | string>;

export function samplesSection(
  engines: Engine[],
  res: SampleResults = SAMPLE_RESULTS,
  client: ServerClientResults = SERVER_CLIENT,
  // The caveats are about the published file: another data set (a test's) has none unless it brings its own.
  caveats: Caveats = res === SAMPLE_RESULTS ? (CAVEATS as Caveats) : {},
): string {
  const tables = SAMPLES.filter((s) => res.samples[s.id]).map((s: Sample) => {
    const r = res.samples[s.id];
    const told = caveats[s.id];
    const care = (slug: string) =>
      told && typeof told === "object" && told[slug] ? `<div class="ro"><span class="odv-fail">read with care</span>: ${esc(told[slug])}</div>` : "";
    const src = encodeURIComponent(sampleUrl(s));
    const row = (e: Engine) => {
      const b = r.browser[e.slug], v = r.server[e.slug];
      const c = client.docs?.[s.id]?.[e.slug];
      if (!b && !v && !c) {
        // Added to the registry after this measurement: say so, rather than a row of blanks.
        return `<tr><td><a href="/v/${e.slug}?src=${src}">${esc(e.name)}</a></td><td colspan="6" class="ro">not measured on this file yet</td></tr>`;
      }
      const runs = b?.runs ?? [];
      const browser = !b
        ? "n/a"
        : b.renderedMs == null
        ? `<span class="odv-fail" title="${esc(b.how ?? "")}">failed</span>`
        // A vendor's cross-origin frame: all the page can time is the frame's load event.
        : `<b>${ms(b.renderedMs)}</b>${e.frame ? ` <span class="ro">frame load</span>` : ""}${when(b, res)}`;
      // Chrome's reading of the server page is its own measurement: shown whatever curl got.
      const inBrowser = !c ? "" : c.loadMs == null
        ? `<div class="ro">in the browser: <span class="odv-fail">failed</span> ${esc(c.error ?? "")}</div>`
        : `<div class="ro">in the browser: loaded ${ms(c.loadMs)} · heap ${mb(c.heapBytes)}${uncollected(c)} · memory ${mb(c.rendererRss)}${c.measuredAt && c.measuredAt !== client.measuredAt ? ` (measured ${esc(c.measuredAt)})` : ""}</div>`;
      const server = e.frame
        ? `<span class="ro">rendered on ${VENDOR[e.slug] ?? "the vendor"}'s servers: the columns on the left are their frame</span>`
        : !v
        // The route exists (the toggle links to it) but this file has no measurement of it yet.
        ? `<span class="ro">${SERVER_RENDER_SLUGS.has(e.slug) ? "not measured on this file yet" : esc(noServerCell(e.slug))}</span>${inBrowser}`
        : v.code !== 200
        ? `<span class="odv-fail">failed</span><div class="ro">${esc(v.error ?? `HTTP ${v.code}`)}</div>${inBrowser}`
        : `<a href="/r/${e.slug}?src=${src}"><b>${ms(v.totalMs)}</b></a><div class="ro">render ${ms(v.renderMs)} · ${mb(v.bytes)} sent${v.pages ? ` · ${v.pages} pages` : ""}</div>${
          IMAGES_ON_DEMAND.has(e.slug) ? `<div class="ro">without its page images: each is rendered and sent when its page nears the viewport</div>` : ""
        }${
          // The median stands on the runs that answered; the one that did not is said, not dropped.
          v.error ? `<div class="ro"><span class="odv-fail">${(v.runs ?? []).filter((x) => x == null).length} of ${(v.runs ?? []).length} runs failed</span>: ${esc(v.error.slice(0, 140))}</div>` : ""
        }${when(v, res)}${inBrowser}`;
      return `<tr>
      <td><a href="/v/${e.slug}?src=${src}">${esc(e.name)}</a>${care(e.slug)}${b && b.renderedMs == null && b.how ? `<div class="ro">${esc(b.how.slice(0, 140))}</div>` : ""}${
        // The median stands on the runs that rendered; the one that did not is said, with its reason.
        (b && b.renderedMs != null && b.failed ? `<div class="ro"><span class="odv-fail">${runs.filter((x) => x == null).length} of ${runs.length} runs failed</span>: ${esc(b.failed.slice(0, 140))}</div>` : "") +
        (b?.incomplete ? `<div class="ro"><span class="odv-fail">a later reading failed</span>: ${esc(b.incomplete.slice(0, 140))}</div>` : "")
      }</td>
      <td class="n">${browser}</td>
      <td class="n hide-sm">${runs.length ? runs.map((x) => (x == null ? "fail" : ms(x))).join(" · ") : "n/a"}</td>
      <td class="n">${e.frame ? "n/a" : mb(b?.heapBytes) + uncollected(b)}</td>
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
<strong>Server render</strong>: the <code>/r/</code> route, wall clock by <code>curl</code>, median; ${COUNT[SERVER_RENDER_SLUGS.size]} engines have one (SuperDoc's sends unpaginated HTML).
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
      <td><a href="${link(e)}">${esc(e.name)}</a><div class="ro">${esc(e.readOnly)}</div>${
      r?.renderedMs != null && r.failed && failed ? `<div class="ro"><span class="odv-fail">${failed} of ${runs.length} runs failed</span>: ${esc(r.failed.slice(0, 140))}</div>` : ""
    }${r?.incomplete ? `<div class="ro"><span class="odv-fail">a later reading failed</span>: ${esc(r.incomplete.slice(0, 140))}</div>` : ""}</td>
      <td class="n"><b>${ms(r?.renderedMs)}</b>${when(r, results)}</td>
      <td class="n hide-sm">${runs.length ? runs.map((x) => (x == null ? "fail" : ms(x))).join(" · ") : "n/a"}</td>
      <td class="n">${mb(r?.bytes)}</td>
      <td class="n hide-sm">${r?.requests ?? "n/a"}</td>
      <td class="n">${mb(r?.heapBytes)}${uncollected(r)}</td>
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
<meta name="description" content="View-only pages for ${open.length} open-source and ${prop.length} proprietary .docx renderers, fed the same public document URL and measured cold the same way." />
<style>${VIEWER_DS_CSS}</style>
<script type="module" src="/client/nav.ts"></script></head><body>
<div class="bl odv">
${landingNavBar()}
<div class="wrap">
<header class="hero">
  <h1>Every .docx renderer, the same document, the same harness.</h1>
  <p class="lede">${engines.length} engines as <strong>view-only</strong> pages that all take one input: a public .docx URL. Microsoft's and Google's
  viewers fetch it and render on their own servers (nothing of theirs renders in your browser: the page here is a frame); for the ${open.length} open-source engines and Apryse and Nutrient,
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
  <p class="fine">${COUNT[SERVER_RENDER_SLUGS.size].replace(/^./, (c) => c.toUpperCase())} engines also run <strong>on the Val</strong>: the Deno server fetches the document, the engine lays it out and paints it, and the
browser receives finished pages. No engine code runs in your browser. Measured with plain HTTP: ${esc(SERVER_MEASURED_AT)}.
<strong>First</strong>: the first request to each engine after a deploy (engine download plus compile counted as init; only the first row also paid the isolate boot). It is one request per engine, not a median, and moves from one deploy to the next.
<strong>Warm</strong>: median of the requests after it. SuperDoc's row is not its paginated view, which needs a browser: it is the engine's headless HTML projection, with no page breaks, colours or pictures. The engines with no server route, and why, are <a href="#no-server">listed below</a>.</p>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th class="n">First</th><th class="n hide-sm">init · render</th><th class="n">Warm</th><th class="n hide-sm">render</th><th class="n">Sent</th><th>How</th></tr></thead><tbody>
${SERVER_RESULTS.map((r) => `<tr><td><a href="/r/${r.slug}?src=${encodeURIComponent(defaultSrc)}">${esc(r.name)}</a><div class="ro">${
    r.output === "images" ? "page images" : r.output === "pages" ? "positioned pages" : r.output === "browser-paginated" ? "pages; breaks computed in the browser" : "flowing HTML"
  }</div></td>
<td class="n"><b>${ms(r.firstMs)}</b>${r.firstCold === false && r.firstMs != null ? `<div class="ro">already loaded: not a first request</div>` : ""}${
    r.error ? `<div class="ro"><span class="odv-fail">a request failed</span>: ${esc(r.error.slice(0, 140))}</div>` : ""
  }${when(r, SERVER_FILE_HEAD)}</td><td class="n hide-sm">${ms(r.firstInitMs)} · ${ms(r.firstRenderMs)}</td><td class="n"><b>${ms(r.warmMs)}</b>${
    r.warmColdRuns ? `<div class="ro">${r.warmColdRuns} of ${(r.warmRuns ?? []).length} reached a process that had not loaded the engine: not in the median</div>` : ""
  }</td><td class="n hide-sm">${ms(r.warmRenderMs)}</td>
<td class="n">${mb(r.bytes)}</td><td class="ro">${esc(r.how)}</td></tr>`).join("")}
</tbody></table></div>
  ${serverClientTable(engines, results, defaultSrc)}
  ${noServerList(engines)}
</section>

<section class="odv-section" id="measurements">
  <div class="sec-label"><span class="sq"></span><span>/ Cold browser</span></div>
  <p class="fine">${
    results.measuredAt
      ? `Measured ${esc(results.measuredAt)} · ${esc(results.environment)} · document: <code>${esc(results.document)}</code>.`
      : "Not measured yet."
  }
<strong>Cold render</strong>: navigation start to the document on screen (the page's own signal, set two frames after the engine shows it), median of the runs.
<strong>Downloaded</strong>: every request that finished, in every frame, headers plus bodies. <strong>JS heap</strong>: this page's JavaScript objects only; a vendor's cross-origin frame is not in it.
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
