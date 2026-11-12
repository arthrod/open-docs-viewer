/**
 * open-docs viewer — every .docx renderer from the open-docs bench as a
 * VIEW-ONLY page that takes the same input: one public document URL.
 *
 *   GET /                       the engines, the measured results, a URL form
 *   GET /v/<engine>?src=<url>   view-only page for one engine
 *   GET /api/doc?src=<url>      this server fetches the document (the way
 *                               Microsoft's and Google's servers fetch theirs)
 *   GET /r/<engine>?src=<url>   server-rendered: the engine runs HERE and the browser
 *                               gets finished pages (docxodus, folio, eigenpal, plate,
 *                               docen, wordcraft); timings in the Server-Timing header
 *   GET /results.json           the measurements shown on /
 *
 * Apples to apples: Microsoft's and Google's viewers fetch a public URL on
 * their servers and render it; here every open-source engine (and Apryse and
 * Nutrient) gets the same URL, this Deno server fetches it, and the browser
 * renders it in the engine's own read-only mode. Every engine sits in the
 * same minimal page, and scripts/measure.py measures them all the same way.
 *
 * The engines' code is NOT copied: shells (head/body markup) are imported
 * from the open-docs val, and the browser loads each adapter straight from
 * open-docs.val.run (served with CORS).
 */
import { Hono } from "npm:hono@4";
import { serveFile } from "https://esm.town/v/std/utils/index.ts";
import { landingPage } from "./server/landing.ts";
import { ENGINES, OPEN_DOCS, OPEN_DOCS_ESM, type Engine } from "./server/engines.ts";
import { currentResults } from "./server/results.ts";

/** The open-docs rich sample, hosted on Hugging Face (arthrod/open-docs-fixtures). */
export const DEFAULT_SRC =
  "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx";

const MAX_BYTES = 25 * 1024 * 1024;

const app = new Hono();

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A public https URL, not a private or local address. */
function publicUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return null;
  // Literal IPs (v4 or v6) are refused outright: documents come by name.
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  return u;
}

app.get("/api/doc", async (c) => {
  const src = publicUrl(c.req.query("src"));
  if (!src) return c.text("src must be a public https URL", 400);
  const got = await fetchDocx(src);
  if (got instanceof Response) return got;
  return new Response(got as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // Measured cold: never served from a cache here.
      "cache-control": "no-store",
    },
  });
});

/** Site-relative URLs in an engine's markup point at open-docs, where they live. */
const absolutize = (html: string) => html.replace(/\b(src|href)="\/(?!\/)/g, `$1="${OPEN_DOCS}/`);

// deno-lint-ignore no-explicit-any
const shells = new Map<string, { p: Promise<any>; at: number }>();
const SHELL_TTL_MS = 5 * 60_000; // then re-resolve, so an open-docs deploy shows up within minutes
/**
 * esm.town redirects an unversioned URL to the current version
 * (`/v/arthrod/open-docs@471-main/...`). Deno caches modules by URL, so
 * importing the unversioned one keeps serving whatever version it first saw;
 * resolve the version first and import that exact URL. Adapters load live from
 * open-docs.val.run, so their shells must be the same version.
 */
async function currentShellUrl(slug: string): Promise<string> {
  const res = await fetch(`${OPEN_DOCS_ESM}/editors/${slug}/shell.ts`, { redirect: "manual" });
  await res.body?.cancel();
  const loc = res.headers.get("location");
  return loc ? new URL(loc, OPEN_DOCS_ESM).href : `${OPEN_DOCS_ESM}/editors/${slug}/shell.ts`;
}
const shellOf = (slug: string) => {
  const hit = shells.get(slug);
  if (hit && Date.now() - hit.at < SHELL_TTL_MS) return hit.p;
  const p = currentShellUrl(slug).then((u) => import(u)).then((m) => m.default);
  p.catch(() => shells.delete(slug)); // retried on the next request
  shells.set(slug, { p, at: Date.now() });
  return p;
};

function viewPage(e: Engine, shell: { head?: string; body: string; entry: string; importMap?: Record<string, string> }, src: URL): string {
  const imports = Object.fromEntries(
    Object.entries(shell.importMap ?? {}).map(([k, v]) => [k, v.startsWith("/") ? OPEN_DOCS + v : v]),
  );
  const importMap = Object.keys(imports).length
    ? `<script type="importmap">${JSON.stringify({ imports })}</script>`
    : "";
  const config = { slug: e.slug, name: e.name, src: src.href, frame: e.frame, docUrl: `/api/doc?src=${encodeURIComponent(src.href)}`, openDocs: OPEN_DOCS };
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(e.name)} · open-docs viewer</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23334155'/><path d='M10 8h9l5 5v11H10z' fill='white'/></svg>" />
${importMap}
<link rel="preconnect" href="${OPEN_DOCS}" crossorigin />
${absolutize(shell.head ?? "")}
<style>
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; height: 100dvh; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2937; background: #eef1f5; }
  .vbar { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #fff; border-bottom: 1px solid #e3e6ec; white-space: nowrap; overflow: hidden; }
  .vbar a { color: #334155; font-weight: 700; text-decoration: none; }
  .vbar b { font-weight: 600; }
  .pill { font-size: 11px; border-radius: 999px; padding: 1px 8px; background: #e0e7ff; color: #3730a3; }
  .pill.prop { background: #fef3c7; color: #7c2d12; }
  .note { color: #64748b; overflow: hidden; text-overflow: ellipsis; }
  #od-loading-detail { margin-left: auto; color: #475569; font-variant-numeric: tabular-nums; }
  #od-remeasure { font: 600 12px system-ui, sans-serif; border: 1px solid #d4d8e0; background: #fff; border-radius: 6px; padding: 3px 8px; cursor: pointer; color: #334155; }
  #od-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  #od-stage > * { height: 100%; }
  .verr { margin: 24px; padding: 16px; background: #fef2f2; color: #7f1d1d; border-radius: 8px; font: 12.5px/1.5 ui-monospace, monospace; white-space: pre-wrap; }
  @media (max-width: 640px) {
    .vbar { flex-wrap: wrap; white-space: normal; overflow-wrap: anywhere; }
    .vbar > * { min-width: 0; max-width: 100%; }
    .note { display: none; }
    #od-remeasure { flex-shrink: 0; }
  }
</style>
<script type="module" src="${OPEN_DOCS}/lib/boot.ts"></script>
</head>
<body>
  <header class="vbar">
    <a href="/" title="All engines">open-docs viewer</a>
    <b>${esc(e.name)}</b>
    <span class="pill${e.proprietary ? " prop" : ""}">${e.proprietary ? "proprietary" : "open source"} · view-only</span>
    <span class="note" title="${esc(e.readOnly)}">${esc(e.readOnly)}</span>
    <span id="od-loading-detail" role="status" aria-live="polite">Loading…</span>
    <button type="button" id="od-remeasure" hidden title="Read JS heap, bytes and files loaded again, as the page is now">Re-measure now</button>
  </header>
  <main id="od-stage">${shell.body}</main>
  <script>window.__OD_VIEW = ${JSON.stringify(config).replace(/</g, "\\u003c")};</script>
  <script type="module" src="/client/view.ts"></script>
  <script type="module" src="${OPEN_DOCS}${shell.entry}"></script>
</body></html>`;
}

app.get("/v/:slug", async (c) => {
  const e = ENGINES.find((x) => x.slug === c.req.param("slug"));
  if (!e) return c.text("unknown engine", 404);
  const src = publicUrl(c.req.query("src") ?? DEFAULT_SRC);
  if (!src) return c.text("src must be a public https URL", 400);
  return c.html(viewPage(e, await shellOf(e.slug), src));
});

const FETCH_DEADLINE_MS = 20_000;
const MAX_REDIRECTS = 5;
// 4xx, not 502/504: Val Town's edge replaces 5xx bodies with "error code: 5xx", which would hide why.
const fail = (status: number, msg: string) => new Response(msg, { status });

/**
 * Fetch a public .docx on this server (shared by /api/doc and /r/*).
 *
 * Every redirect hop is re-checked with publicUrl (https, no local or
 * literal-IP hosts) instead of letting fetch follow it; the body is read in
 * chunks and abandoned the moment it passes 25 MB, whatever the headers
 * claim; headers and body share one deadline.
 * Not covered: a public name that resolves to a private address — Val Town's
 * egress is the boundary there; this code has no connect-time IP check.
 */
async function fetchDocx(first: URL): Promise<Uint8Array | Response> {
  const signal = AbortSignal.timeout(FETCH_DEADLINE_MS);
  let url = first;
  let res: Response | undefined;
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": "open-docs-viewer (+https://open-docs-viewer.val.run)" } });
      if (res.status < 300 || res.status >= 400) break;
      await res.body?.cancel();
      const next = res.headers.get("location") ? publicUrl(new URL(res.headers.get("location")!, url).href) : null;
      if (!next) return fail(422, "the document URL redirects to a non-public or non-https address");
      if (hop >= MAX_REDIRECTS) return fail(422, "too many redirects");
      url = next;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return fail(422, `fetching the document failed: upstream ${res.status}`);
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
      await res.body?.cancel();
      return fail(413, "document larger than 25 MB");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return fail(413, "document larger than 25 MB");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const ch of chunks) {
      bytes.set(ch, at);
      at += ch.length;
    }
    // A .docx is a zip: "PK".
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return fail(415, "that URL is not a .docx (no zip header)");
    return bytes;
  } catch (e) {
    if (signal.aborted) return fail(408, `the document did not arrive within ${FETCH_DEADLINE_MS / 1000}s`);
    throw e;
  }
}

/**
 * Server-rendered views: this Val fetches and renders the document; the
 * browser gets finished HTML, like Word's and Google's viewers. Each renderer
 * reports its own init (one-time, per isolate) and render time.
 */
type Rendered = {
  html: string;
  initMs: number;
  renderMs: number;
  pages?: number;
  unpainted?: string[];
  /** CSP script sources the page needs (Docxodus's paginator); default: none may run. */
  scriptSrc?: string;
  /** Where page breaks are computed, when not here. */
  paginatedIn?: "browser";
};
type Renderer = (bytes: Uint8Array) => Promise<Rendered>;

/**
 * Each renderer's module is imported on its first request, and that import
 * (downloading and compiling the engine) is counted in `init`: a cold
 * isolate pays it, a warm one does not, the same split Word's and Google's
 * servers hide from us.
 */
function lazy(load: () => Promise<Renderer>): Renderer {
  let mod: Promise<Renderer> | undefined;
  return async (bytes) => {
    const t0 = performance.now();
    mod ??= load().catch((e) => {
      mod = undefined;
      throw e;
    });
    const render = await mod;
    const importMs = Math.round(performance.now() - t0);
    const r = await render(bytes);
    return { ...r, initMs: r.initMs + importMs };
  };
}

const RENDERERS: Record<string, Renderer> = {
  docxodus: lazy(async () => (await import("./server/render.ts")).docxodusHtml),
  folio: lazy(async () => (await import("./server/folio.ts")).folioHtml),
  wordcraft: lazy(async () => (await import("./server/wordcraft.ts")).wordcraftHtml),
  docen: lazy(async () => (await import("./server/docen.ts")).docenHtml),
  // docx-editor.dev (its open-docs slug is "eigenpal").
  eigenpal: lazy(async () => (await import("./server/docx-editor.ts")).docxEditorHtml),
  // Styled with the open-docs Plate page's own CSS (its shell head).
  plate: lazy(async () => {
    const { plateHtml } = await import("./server/plate.ts");
    return async (bytes: Uint8Array) => plateHtml(bytes, absolutize((await shellOf("plate")).head ?? ""));
  }),
};

app.get("/r/:engine", async (c) => {
  const render = RENDERERS[c.req.param("engine")];
  if (!render) return c.text("no server renderer for that engine", 404);
  const src = publicUrl(c.req.query("src") ?? DEFAULT_SRC);
  if (!src) return c.text("src must be a public https URL", 400);
  const t0 = performance.now();
  const got = await fetchDocx(src);
  if (got instanceof Response) return got;
  const fetchMs = Math.round(performance.now() - t0);
  const { html, initMs, renderMs, pages, unpainted, scriptSrc, paginatedIn } = await render(got);
  const timing = `fetch;dur=${fetchMs}, init;dur=${initMs}, render;dur=${renderMs}`;
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "server-timing": timing,
    "cache-control": "no-store",
    // The pages are markup built from an untrusted document: no script from
    // it may run (a javascript: link in the .docx included). Only Docxodus's
    // page loads scripts, and only this Val's own (its paginator). Fonts and
    // styles come from jsDelivr, images are inline.
    "content-security-policy":
      `default-src 'none'; script-src ${scriptSrc ?? "'none'"}; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net data:; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    "x-content-type-options": "nosniff",
  };
  if (pages !== undefined) headers["x-pages"] = String(pages);
  if (paginatedIn) headers["x-paginated-in"] = paginatedIn;
  // What a renderer laid out but this server does not paint yet.
  if (unpainted?.length) headers["x-unpainted"] = unpainted.join(", ");
  return new Response(html, { headers });
});

app.get("/client/*", (c) => serveFile(c.req.path, import.meta.url));

app.get("/results.json", async (c) => c.json(await currentResults()));

app.get("/", async (c) => c.html(landingPage(ENGINES, await currentResults(), DEFAULT_SRC)));

/**
 * Safety net: an engine that asks THIS origin for an open-docs path at run
 * time (site-relative fetches) gets it from open-docs. The measurement script
 * counts these requests separately; none are expected.
 */
const PROXIED = /^\/(api\/blank\.docx|api\/sample\.docx|api\/svg-raw\/|vendor\/|lib\/|editors\/)/;
app.get("*", async (c) => {
  const url = new URL(c.req.url);
  if (!PROXIED.test(url.pathname)) return c.text("not found", 404);
  const res = await fetch(OPEN_DOCS + url.pathname + url.search);
  const headers = new Headers(res.headers);
  headers.set("x-proxied-from", "open-docs");
  return new Response(res.body, { status: res.status, headers });
});

// Unwrap Hono errors to see original error details.
app.onError((err) => Promise.reject(err));

export default app.fetch;

