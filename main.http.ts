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
 *                               docen, wordcraft, superdoc, opendoc, betteroffice);
 *                               timings in the Server-Timing header
 *   GET /r/<engine>/page?src=<url>&doc=<id>&n=<page>&s=<density>
 *                               one page of a server render that sends page images:
 *                               a PNG (wordcraft, opendoc) or an SVG (betteroffice)
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
 * editors.benchmarks.law (served with CORS).
 */
import { passedThrough, passThroughHeaders, passThroughUrl, VENDOR_ROOT } from "./server/pass-through.ts";
import { Hono } from "npm:hono@4";
import { serveFile } from "https://esm.town/v/std/utils/index.ts";
import { landingPage } from "./server/landing.ts";
import { viewPage } from "./server/render.ts";
import { ENGINES, OPEN_DOCS, OPEN_DOCS_ESM } from "./server/engines.ts";
import { currentResults } from "./server/results.ts";
import { goTarget, serverToggle } from "./server/navbar.ts";
import { fetchFailure, publicUrl, resolvesPublic } from "./server/net.ts";
import { renderFailure } from "./server/failure.ts";
import { Busy, TookTooLong, turns } from "./server/queue.ts";
import { tooLarge } from "./server/docx-size.ts";

/** The open-docs rich sample, hosted on Hugging Face (arthrod/open-docs-fixtures). */
export const DEFAULT_SRC =
  "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx";

const MAX_BYTES = 25 * 1024 * 1024;

const app = new Hono();

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
 * editors.benchmarks.law, so their shells must be the same version.
 */
async function currentShellUrl(slug: string): Promise<string> {
  // Bounded: Plate's server render waits on this inside its turn of the render queue, and a
  // fetch that never settles would hold the turn (and, six renders later, answer 503 to all).
  const res = await fetch(`${OPEN_DOCS_ESM}/editors/${slug}/shell.ts`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
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

app.get("/v/:slug", async (c) => {
  const e = ENGINES.find((x) => x.slug === c.req.param("slug"));
  if (!e) return c.text("unknown engine", 404);
  const src = publicUrl(c.req.query("src") ?? DEFAULT_SRC);
  if (!src) return c.text("src must be a public https URL", 400);
  return c.html(viewPage(e, await shellOf(e.slug), src, absolutize));
});

const FETCH_DEADLINE_MS = 20_000;
const MAX_REDIRECTS = 5;
// 4xx, not 502/504: Val Town's edge replaces 5xx bodies with "error code: 5xx", which would hide why.
// Never cached: the next request may find the document there.
const fail = (status: number, msg: string) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * Fetch a public .docx on this server (shared by /api/doc and /r/*).
 *
 * Every redirect hop is re-checked with publicUrl (https, no local or
 * literal-IP hosts) instead of letting fetch follow it; the body is read in
 * chunks and abandoned the moment it passes 25 MB, whatever the headers
 * claim; headers and body share one deadline.
 * A public name that resolves to a private address (127.0.0.1.nip.io) is
 * refused at every hop by asking a public resolver first (server/net.ts).
 * Not covered: a DNS server that answers that check and the connection
 * differently (rebinding); a Val has no connect-time IP check, so Val Town's
 * egress is the boundary there.
 */
async function fetchDocx(first: URL): Promise<Uint8Array | Response> {
  const signal = AbortSignal.timeout(FETCH_DEADLINE_MS);
  let url = first;
  let res: Response | undefined;
  try {
    for (let hop = 0; ; hop++) {
      if (!(await resolvesPublic(url.hostname))) return fail(422, "the document URL points to an address that is not public, or its address could not be checked");
      res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": "open-docs-viewer (+https://viewers.benchmarks.law)" } });
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
    // A host that does not exist, a refused connection, a broken TLS handshake: the document's
    // address is what failed. Thrown onwards, Val Town would answer 500 with the stack trace.
    // Said in a fixed phrase: the runtime's text names the stage and the address it reached.
    console.error("fetchDocx", JSON.stringify(url.hostname), JSON.stringify(`${(e as Error)?.message ?? e} | ${((e as Error)?.cause as Error)?.message ?? ""}`.slice(0, 400)));
    return fail(422, `the document could not be fetched: ${fetchFailure(e)}`);
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
/** `src` is where the document came from: WordCraft's page puts it in its image URLs. */
type Renderer = (bytes: Uint8Array, src: URL) => Promise<Rendered>;

/**
 * Each renderer's module is imported on its first request, and that import
 * (downloading and compiling the engine) is counted in `init`: a cold
 * isolate pays it, a warm one does not, the same split Word's and Google's
 * servers hide from us.
 */
function lazy(load: () => Promise<Renderer>): Renderer {
  let mod: Promise<Renderer> | undefined;
  return async (bytes, src) => {
    const t0 = performance.now();
    mod ??= load().catch((e) => {
      mod = undefined;
      throw e;
    });
    const render = await mod;
    const importMs = Math.round(performance.now() - t0);
    const r = await render(bytes, src);
    return { ...r, initMs: r.initMs + importMs };
  };
}

/** The engines with a server route. server/navbar.ts lists the same slugs for its links; a test compares the two. */
export const RENDERERS: Record<string, Renderer> = {
  docxodus: lazy(async () => (await import("./server/render.ts")).docxodusHtml),
  folio: lazy(async () => (await import("./server/folio.ts")).folioHtml),
  wordcraft: lazy(async () => (await import("./server/wordcraft.ts")).wordcraftHtml),
  // PNG pages from CasualOffice's Viewer SDK, one request per page, like WordCraft's.
  opendoc: lazy(async () => (await import("./server/opendoc.ts")).opendocHtml),
  // SVG pages: BetterOffice's layout and painter, on a canvas of ours that writes SVG (see the file).
  betteroffice: lazy(async () => (await import("./server/betteroffice.ts")).betterofficeHtml),
  docen: lazy(async () => (await import("./server/docen.ts")).docenHtml),
  // Unpaginated: SuperDoc's headless runtime and its HTML projection (see the file).
  superdoc: lazy(async () => (await import("./server/superdoc.ts")).superdocHtml),
  // docx-editor.dev (its open-docs slug is "eigenpal").
  eigenpal: lazy(async () => (await import("./server/docx-editor.ts")).docxEditorHtml),
  // Styled with the open-docs Plate page's own CSS (its shell head).
  plate: lazy(async () => {
    const { plateHtml } = await import("./server/plate.ts");
    return async (bytes: Uint8Array) => plateHtml(bytes, absolutize((await shellOf("plate")).head ?? ""));
  }),
};

// One render at a time in this isolate, and at most six waiting (server/queue.ts).
const renderTurn = turns(6);
/** The answer to a render that got no turn, or held one too long: 503, to be tried again; never cached. */
const busyAnswer = (err: unknown): Response | null =>
  err instanceof Busy
    ? new Response("this server is rendering other documents: try again in a moment", { status: 503, headers: { "retry-after": "10", "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } })
    : err instanceof TookTooLong
    ? new Response(`${err.message}: try again, or open it in the browser render`, { status: 503, headers: { "retry-after": "30", "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } })
    : null;

app.get("/r/:engine", async (c) => {
  const engine = c.req.param("engine");
  // An own key only: "constructor" and the like are on every object and are not engines.
  const render = Object.hasOwn(RENDERERS, engine) ? RENDERERS[engine] : undefined;
  if (!render) return c.text("no server renderer for that engine", 404);
  const src = publicUrl(c.req.query("src") ?? DEFAULT_SRC);
  if (!src) return c.text("src must be a public https URL", 400);
  const t0 = performance.now();
  const got = await fetchDocx(src);
  if (got instanceof Response) return got;
  const fetchMs = Math.round(performance.now() - t0);
  // Refused before the engine sees it: a render that ends the isolate takes other requests with it.
  const refused = tooLarge(engine, got);
  if (refused) return c.text(refused, 422, { "cache-control": "no-store" });
  let rendered: Rendered;
  let queueMs = 0;
  try {
    const turn = await renderTurn(() => render(got, src));
    rendered = turn.value;
    queueMs = turn.waitedMs;
  } catch (err) {
    const busy = busyAnswer(err);
    if (busy) return busy;
    // A zip that is not a .docx, or a document the engine cannot read.
    console.error(`/r/${engine}`, JSON.stringify(src.href), err);
    return renderFailure(ENGINES.find((x) => x.slug === engine)?.name ?? engine, err);
  }
  const { html, initMs, renderMs, pages, unpainted, scriptSrc, paginatedIn } = rendered;
  // queue: the wait for this isolate to finish the renders asked before this one.
  const timing = `fetch;dur=${fetchMs}, queue;dur=${queueMs}, init;dur=${initMs}, render;dur=${renderMs}`;
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "server-timing": timing,
    "cache-control": "no-store",
    // The pages are markup built from an untrusted document: no script from
    // it may run (a javascript: link in the .docx included). Only Docxodus's
    // page loads scripts, and only this Val's own (its paginator). Fonts and
    // styles come from jsDelivr; images are inline, or page images from this Val (WordCraft, OpenDoc, BetterOffice)
    // ('self', so they also load when this is served over plain http on localhost).
    "content-security-policy":
      `default-src 'none'; script-src ${scriptSrc ?? "'none'"}; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net data:; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    "x-content-type-options": "nosniff",
  };
  if (pages !== undefined) headers["x-pages"] = String(pages);
  if (paginatedIn) headers["x-paginated-in"] = paginatedIn;
  // What a renderer laid out but this server does not paint yet.
  if (unpainted?.length) headers["x-unpainted"] = unpainted.join(", ");
  return new Response(serverToggle(html, engine, src), { headers });
});

/**
 * One page image of a server render that sends its pages as images (WordCraft, OpenDoc, BetterOffice).
 * Its page (/r/<engine>) holds one of these URLs per page and the browser asks
 * for each as it comes near the viewport. The document is fetched again only
 * by an isolate that does not hold its layout.
 */
type PageQuery = { doc?: string; n?: string; s?: string };
type PageRenderer = (q: PageQuery, getBytes: () => Promise<Uint8Array | Response>, turn: <T>(job: () => Promise<T>) => Promise<T>) => Promise<Response>;
/** The engines whose server route has a page-image route beside it. A test checks each is in RENDERERS too. */
export const PAGE_RENDERERS: Record<string, () => Promise<PageRenderer>> = {
  wordcraft: async () => (await import("./server/wordcraft.ts")).wordcraftPage,
  opendoc: async () => (await import("./server/opendoc.ts")).opendocPage,
  betteroffice: async () => (await import("./server/betteroffice.ts")).betterofficePage,
};

app.get("/r/:engine/page", async (c) => {
  const engine = c.req.param("engine");
  if (!Object.hasOwn(PAGE_RENDERERS, engine)) return c.text("no page images for that engine", 404);
  const src = publicUrl(c.req.query("src"));
  if (!src) return c.text("src must be a public https URL", 400);
  try {
    const page = await PAGE_RENDERERS[engine]();
    // The same refusal as the page itself: a page image's address must not be a way round the size guard.
    const guarded = async () => {
      const got = await fetchDocx(src);
      if (got instanceof Response) return got;
      const refused = tooLarge(engine, got);
      return refused ? new Response(refused, { status: 422, headers: { "cache-control": "no-store" } }) : got;
    };
    return await page({ doc: c.req.query("doc"), n: c.req.query("n"), s: c.req.query("s") }, guarded, (job) => renderTurn(job).then((t) => t.value));
  } catch (err) {
    const busy = busyAnswer(err);
    if (busy) return busy;
    console.error(`/r/${engine}/page`, JSON.stringify(src.href), err);
    return renderFailure(ENGINES.find((x) => x.slug === engine)?.name ?? engine, err);
  }
});

app.get("/client/*", (c) => serveFile(c.req.path, import.meta.url));

app.get("/results.json", async (c) => c.json(await currentResults()));

app.get("/", async (c) => c.html(landingPage(ENGINES, await currentResults(), DEFAULT_SRC)));

/** The landing's form without its script (`action="/go"`): to the engine's page, or back to the landing. */
app.get("/go", (c) => c.redirect(goTarget(c.req.query("engine"), c.req.query("src"), ENGINES) ?? "/", 303));

/**
 * Safety net: an engine that asks THIS origin for an open-docs path at run
 * time (site-relative fetches) gets it from open-docs. The measurement script
 * counts these requests separately; none are expected.
 */
// Engines whose shell says `sameOrigin` (a Worker or a frame of their own files: react-docx,
// OpenDoc, BetterOffice, OnlyOffice) get those files from this origin, under VENDOR_ROOT.
app.get(`${VENDOR_ROOT}/*`, async (c) => {
  const target = passThroughUrl(OPEN_DOCS, new URL(c.req.url));
  if (!target) return c.text("not found", 404);
  return passedThrough(await fetch(target, { headers: passThroughHeaders() }));
});

const PROXIED = /^\/(api\/blank\.docx|api\/sample\.docx|api\/svg-raw\/|vendor\/|lib\/|editors\/)/;
app.get("*", async (c) => {
  const url = new URL(c.req.url);
  if (!PROXIED.test(url.pathname)) return c.text("not found", 404);
  const res = await fetch(OPEN_DOCS + url.pathname + url.search, { headers: passThroughHeaders() });
  return passedThrough(res);
});

// Anything a route did not answer for itself: logged whole (Val Town's logs), answered in one line.
// Rejecting here made Val Town send the error's stack trace to the visitor.
app.onError((err, c) => {
  console.error(c.req.method, JSON.stringify(c.req.path), err);
  return new Response("this page could not be made; the error is in the server's log", { status: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
});

export default app.fetch;

