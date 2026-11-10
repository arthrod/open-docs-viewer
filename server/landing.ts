/** The landing page: every engine, the cold measurements, a URL form. */
import type { Engine } from "./engines.ts";
import { type Results, SERVER_MEASURED_AT, SERVER_RESULTS } from "./results.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ms = (n: number | null | undefined) => n == null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
const mb = (n: number | null | undefined) => n == null ? "—" : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

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
      <td class="n hide-sm">${runs.length ? runs.map((x) => (x == null ? "✕" : ms(x))).join(" · ") : "—"}</td>
      <td class="n">${mb(r?.bytes)}</td>
      <td class="n hide-sm">${r?.requests ?? "—"}</td>
      <td class="n">${mb(r?.heapBytes)}</td>
      <td class="n hide-sm">${runs.length ? `${runs.length - failed}/${runs.length}` : "—"}</td>
      <td class="bar hide-sm"><i style="width:${r?.renderedMs ? ((100 * r.renderedMs) / max).toFixed(1) : 0}%"></i></td>
    </tr>`;
  };
  const head = `<thead><tr><th>Engine</th><th class="n">Cold render</th><th class="n hide-sm">Each run</th><th class="n">Downloaded</th>
    <th class="n hide-sm">Requests</th><th class="n">JS heap</th><th class="n hide-sm">OK</th><th class="bar hide-sm"></th></tr></thead>`;
  const open = engines.filter((e) => !e.proprietary), prop = engines.filter((e) => e.proprietary);
  const options = engines.map((e) => `<option value="${e.slug}">${esc(e.name)}${e.proprietary ? " (proprietary)" : ""}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>open-docs viewer — every .docx renderer, same document, same harness</title>
<meta name="description" content="View-only pages for eight open-source and four proprietary .docx renderers, fed the same public document URL and measured cold the same way." />
<style>
  :root { --line:#e3e6ec; --muted:#64748b; --mono: ui-monospace, SFMono-Regular, Menlo, monospace; }
  body { margin:0; font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; color:#0f172a; background:#f6f7f9; }
  .wrap { max-width:1120px; margin:0 auto; padding:0 20px; }
  header { padding:42px 0 18px; } h1 { font-size:34px; letter-spacing:-.02em; margin:0 0 10px; line-height:1.15; }
  p { color:#334155; max-width:820px; } h2 { font-size:20px; margin:30px 0 8px; }
  form { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 8px; } form input { flex:1 1 360px; min-width:0; }
  input, select, button { font:inherit; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; }
  button { background:#334155; color:#fff; border-color:#334155; cursor:pointer; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; font-size:13px; }
  th, td { padding:9px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#8b93a3; background:#fafbfc; }
  td.n, th.n { text-align:right; font-family:var(--mono); font-size:12.5px; white-space:nowrap; }
  td a { color:#0f172a; font-weight:600; text-decoration:none; } td a:hover { color:#2557d6; }
  .ro { font-size:11.5px; color:var(--muted); margin-top:2px; }
  td.bar { width:14%; } td.bar i { display:block; height:8px; margin-top:5px; border-radius:4px; background:linear-gradient(90deg,#334155,#94a3b8); }
  tr.sep th { background:#fffbeb; color:#7c2d12; text-transform:none; letter-spacing:0; font-size:12px; font-weight:500; }
  .small { font-size:13px; color:var(--muted); } code { font-family:var(--mono); font-size:12.5px; }
  footer { margin:40px 0; font-size:12.5px; color:var(--muted); }
  @media (max-width:720px) { .hide-sm { display:none; } h1 { font-size:26px; } }
</style></head><body>
<div class="wrap">
<header>
  <h1>Every .docx renderer, the same document, the same harness.</h1>
  <p>Twelve engines as <b>view-only</b> pages that all take one input: a public .docx URL. Microsoft's and Google's
  viewers fetch it and render on their own servers; for the eight open-source engines and Apryse and Nutrient,
  this val's Deno server fetches it and the browser renders it in the engine's own read-only mode. Every page is
  measured cold by the same script. The editable versions live at <a href="https://open-docs.val.run">open-docs</a>.</p>
  <form action="/go" method="get" onsubmit="event.preventDefault(); const f=new FormData(this); location.href='/v/'+f.get('engine')+'?src='+encodeURIComponent(f.get('src'));">
    <input name="src" type="url" required value="${esc(defaultSrc)}" aria-label="Public .docx URL" />
    <select name="engine" aria-label="Engine">${options}</select>
    <button>View</button>
  </form>
  <p class="small">The URL goes to the engine you pick: to Microsoft or Google for theirs, to this val's server otherwise. Use only documents you are happy to publish.</p>
</header>

<h2>Rendered on this server (like Word's and Google's viewers)</h2>
<p class="small">Six engines also run <b>on the Val</b>: the Deno server fetches the document, the engine lays it out and paints it, and the
browser receives finished pages — no engine code runs in your browser. Measured with plain HTTP: ${esc(SERVER_MEASURED_AT)}.
<b>First</b>: the first request to each engine after a deploy (engine download + compile counted as init; only the first row also paid the isolate boot).
<b>Warm</b>: median of 5. Server time for SuperDoc and canvas-editor is not offered: both need a real browser (canvas measuring, DOM painting).</p>
<table><thead><tr><th>Engine</th><th class="n">First</th><th class="n hide-sm">init · render</th><th class="n">Warm</th><th class="n hide-sm">render</th><th class="n">Sent</th><th>How</th></tr></thead><tbody>
${SERVER_RESULTS.map((r) => `<tr><td><a href="/r/${r.slug}?src=${encodeURIComponent(defaultSrc)}">${esc(r.name)}</a><div class="ro">${r.output === "images" ? "page images" : r.output === "pages" ? "positioned pages" : "flowing HTML"}</div></td>
<td class="n"><b>${ms(r.firstMs)}</b></td><td class="n hide-sm">${ms(r.firstInitMs)} · ${ms(r.firstRenderMs)}</td><td class="n"><b>${ms(r.warmMs)}</b></td><td class="n hide-sm">${ms(r.warmRenderMs)}</td>
<td class="n">${mb(r.bytes)}</td><td class="ro">${esc(r.how)}</td></tr>`).join("")}
</tbody></table>

<h2>Cold measurements (rendered in the browser)</h2>
<p class="small">${results.measuredAt
    ? `Measured ${esc(results.measuredAt)} · ${esc(results.environment)} · document: <code>${esc(results.document)}</code>.`
    : "Not measured yet."}
<b>Cold render</b>: navigation start → the document is on screen (the page's own signal, the document's title as text, or a rendered page image, whichever comes first), median of the runs.
<b>Downloaded</b>: every request in every frame, headers + bodies. <b>JS heap</b>: the page plus every out-of-process frame.
Each run is a fresh browser and a document URL no engine has seen, so no vendor cache can answer it.</p>
<table>${head}<tbody>${open.map(row).join("")}</tbody>
<tbody><tr class="sep"><th colspan="8">Proprietary — view-only by nature. Microsoft and Google render on their servers; Apryse and Nutrient run unlicensed in evaluation mode (watermarked).</th></tr>${prop.map(row).join("")}</tbody></table>
<footer>Source: <a href="https://www.val.town/x/arthrod/open-docs-viewer">val.town/x/arthrod/open-docs-viewer</a>; engines from <a href="https://github.com/arthrod/open-docs">github.com/arthrod/open-docs</a>. Fixture: <a href="https://huggingface.co/datasets/arthrod/open-docs-fixtures">huggingface.co/datasets/arthrod/open-docs-fixtures</a>.</footer>
</div></body></html>`;
}
