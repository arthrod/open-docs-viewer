/**
 * A server route whose pages are images asked for one at a time: the shape of
 * WordCraft's route (server/wordcraft.ts, where the reasons are written out),
 * for any engine that lays a document out once and then draws a page on
 * request. OpenDoc (PNG pages) and BetterOffice (SVG pages) are built on it.
 *
 * The page is small: every page's size and one image URL each. A page is drawn
 * when the browser asks for its image, which it does as the page nears the
 * viewport (`loading="lazy"`, no script). Nothing is stored: an image URL names
 * the document's URL, the first 16 hex digits of its SHA-256 and the page
 * number. An isolate that has not seen the document fetches and lays it out
 * again, and keeps the layout in memory for the pages asked for next.
 */

/** A document laid out by an engine. */
export interface LaidDocument {
  /** Every page's width and height in CSS pixels, flattened: `[w0, h0, w1, h1, …]`. */
  sizes: ArrayLike<number>;
  /** Page `index` (from 0) as an image, at `density` device pixels per CSS pixel. */
  page(index: number, density: number): Uint8Array | Promise<Uint8Array>;
  /** Give the engine's memory back. The document is not used afterwards. */
  free(): void;
}

export interface PageImageEngine {
  /** The route: `/r/<slug>` and `/r/<slug>/page`. */
  slug: string;
  /** The engine's name, for the page's title. */
  name: string;
  contentType: "image/png" | "image/svg+xml";
  /** The rasters offered per page, by device pixels per CSS pixel. One entry: no `srcset` (a vector image needs none). */
  densities: readonly string[];
  /** Load the engine (once per isolate; counted as `init`). A failed load is retried on the next request. */
  load(): Promise<void>;
  /** Read and lay out one document. */
  open(bytes: Uint8Array): LaidDocument | Promise<LaidDocument>;
  /** What the engine laid out and its pages do not show. */
  unpainted?: string[];
  /** How many documents' layouts one isolate keeps for the page images asked for next. */
  keep?: number;
  /** How long a page request waits for a kept layout that is still being made (default: the render queue's turn, 120 s). */
  waitMs?: number;
}

/** Pages above the fold load with the page; the rest wait until they are near the viewport. */
const EAGER_PAGES = 2;

import { TookTooLong } from "./queue.ts";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
/** The SHA-256 of `b`, as hex. */
export const sha256 = async (b: Uint8Array | ArrayBuffer) => hex(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>));
/** Text for a double-quoted HTML attribute. */
const attr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
/** A refusal in plain text, never cached. */
const refuse = (status: number, msg: string) => new Response(msg, { status, headers: { "cache-control": "no-store" } });

type Laid = { id: string; doc: LaidDocument; initMs: number; layoutMs: number; evicted: boolean };
type Query = { doc?: string; n?: string; s?: string };
type Turn = <T>(job: () => Promise<T>) => Promise<T>;
/** A layout waiting for its turn: `made` once the turn came, and until then how many requests share it. */
type Queued = { promise: Promise<Laid>; made?: Promise<Laid>; sharers: number };

export function pageImages(engine: PageImageEngine) {
  const keep = engine.keep ?? 3;
  /** By document id (16 hex digits of its SHA-256), most recently used last. */
  const laid = new Map<string, Promise<Laid>>();
  /** Document fetches in flight, by document id: pages asked for together share one. */
  const fetching = new Map<string, Promise<Uint8Array | Response>>();
  /** Layouts waiting for, or holding, their turn of the render queue for the page route, by document id. */
  const laying = new Map<string, Queued>();
  let released = 0;

  let ready: Promise<void> | undefined;
  const load = () =>
    ready ??= engine.load().catch((e) => {
      ready = undefined;
      throw e;
    });

  /**
   * Requests drawing from, or still waiting for, one layout, by that layout's own promise (never a
   * promise wrapped around it). Counted from the moment the layout exists for the request, not from
   * when it resolves: an eviction registered earlier reacts first, and would free the layout under
   * a request that had not yet taken hold of it.
   * Keyed by the layout and not by the document: a document laid out again is a new layout, and a
   * request on the new one must not keep the old one's memory alive.
   */
  const pinned = new Map<Promise<Laid>, number>();
  /** Layouts evicted while pinned: each is freed when its own last request lets go. */
  const limbo = new Map<Promise<Laid>, Laid>();

  /** Engine memory is not the garbage collector's: a layout is freed the moment it is both evicted and unused. */
  function release(p: Promise<Laid>, l: Laid) {
    if (!l.evicted) return;
    if ((pinned.get(p) ?? 0) > 0) {
      limbo.set(p, l);
      return;
    }
    l.evicted = false; // freed once
    limbo.delete(p);
    l.doc.free();
    released++;
  }
  function evict(p: Promise<Laid>) {
    p.then((l) => {
      l.evicted = true;
      release(p, l);
    }, () => {});
  }

  /** The layout of `bytes`: the one kept under `id`, or a new one when there is none (or `anew`). */
  function layOut(id: string, bytes: Uint8Array, anew = false): Promise<Laid> {
    const kept = laid.get(id);
    let hit = anew ? undefined : kept;
    laid.delete(id); // set again below, which also makes it the most recently used
    if (anew && kept) evict(kept);
    if (!hit) {
      // Room is made before the new layout, not after: the engine never holds more than `keep` (unless a page is being drawn from one).
      const room = [...laid].slice(0, Math.max(0, laid.size - (keep - 1)));
      for (const [old] of room) laid.delete(old);
      hit = (async () => {
        const t0 = performance.now();
        await load();
        await Promise.allSettled(room.map(([, p]) => (evict(p), p)));
        const t1 = performance.now();
        const doc = await engine.open(bytes);
        return { id, doc, initMs: Math.round(t1 - t0), layoutMs: Math.round(performance.now() - t1), evicted: false };
      })();
      hit.catch(() => laid.get(id) === hit && laid.delete(id));
    }
    laid.set(id, hit);
    return hit;
  }

  const pin = (p: Promise<Laid>, n = 1) => n > 0 && pinned.set(p, (pinned.get(p) ?? 0) + n);
  function unpin(p: Promise<Laid>) {
    const left = (pinned.get(p) ?? 1) - 1;
    if (left > 0) return void pinned.set(p, left);
    pinned.delete(p);
    const l = limbo.get(p);
    if (l) release(p, l);
  }
  /**
   * Run `fn` on the layout `wait` resolves to. The caller has pinned that layout (synchronously,
   * when it came to exist for it); `key` names it once `wait` has settled, and is let go here.
   */
  async function using<T>(wait: Promise<Laid>, key: () => Promise<Laid> | undefined, fn: (l: Laid) => T | Promise<T>): Promise<T> {
    try {
      return await fn(await wait);
    } finally {
      const p = key();
      if (p) unpin(p);
    }
  }

  /** The page: every page's size and one image URL each. */
  async function html(bytes: Uint8Array, src: URL) {
    const id = (await sha256(bytes)).slice(0, 16);
    // Opening the page always reads and lays the document out, as every other engine's route does;
    // only its page images reuse that work.
    const mine = layOut(id, bytes, true);
    pin(mine); // before the first await
    const { sizes, initMs, layoutMs } = await using(mine, () => mine, (l) => ({ sizes: Array.from(l.doc.sizes), initMs: l.initMs, layoutMs: l.layoutMs }));
    const count = sizes.length / 2;
    const q = `/r/${engine.slug}/page?src=${encodeURIComponent(src.href)}&doc=${id}`;
    const pages: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = (s: string) => attr(`${q}&n=${i + 1}&s=${s}`);
      const srcset = engine.densities.length > 1 ? ` srcset="${engine.densities.map((s) => `${url(s)} ${s}x`).join(", ")}"` : "";
      // Shown at the page's CSS size, like the other engines; reserved before the image arrives.
      pages.push(
        `<img class="page" alt="Page ${i + 1}" width="${Math.round(sizes[2 * i])}" height="${Math.round(sizes[2 * i + 1])}"` +
          `${i < EAGER_PAGES ? "" : ' loading="lazy"'} decoding="async" src="${url(engine.densities[0])}"${srcset} />`,
      );
    }
    const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>${attr(engine.name)} · server-rendered</title>
<style>html,body{margin:0}body{background:#eef1f5;padding:24px 0;display:flex;flex-direction:column;align-items:center;gap:16px}
img.page{display:block;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06);max-width:calc(100vw - 16px);height:auto}</style>
</head><body>${pages.join("\n")}
<script src="/client/wc-retry.js" defer></script></body></html>`;
    // The page holds no markup from the document, only images of it: this Val's own retry script may run.
    return { html: page, pages: count, initMs, renderMs: layoutMs, scriptSrc: "'self'", ...(engine.unpainted?.length ? { unpainted: engine.unpainted } : {}) };
  }

  /**
   * One page as an image. `getBytes` fetches the document, and is only called
   * when this isolate does not hold its layout; a Response from it (the fetch
   * failed) is passed through. A layout this isolate does not hold is made
   * inside `turn` (the caller's turn of the render queue), and the page
   * requests that arrive together for one document share that one turn.
   * Drawing a page from a kept layout takes no turn.
   */
  async function page(q: Query, getBytes: () => Promise<Uint8Array | Response>, turn: Turn = (job) => job()): Promise<Response> {
    if (!q.doc || !/^[0-9a-f]{16}$/.test(q.doc)) return refuse(400, "doc must be 16 hex digits");
    if (!q.n || !/^[1-9]\d{0,5}$/.test(q.n)) return refuse(400, "n must be a page number, from 1");
    if (!engine.densities.includes(q.s ?? "")) return refuse(400, `s must be ${engine.densities.length > 1 ? "one of " : ""}${engine.densities.join(", ")}`);
    const t0 = performance.now();
    const id = q.doc;
    let hit = laid.get(id);
    let key: () => Promise<Laid> | undefined;
    let fetchMs = 0;
    if (!hit) {
      let pending = fetching.get(id);
      if (!pending) {
        pending = getBytes().finally(() => fetching.delete(id));
        fetching.set(id, pending);
      }
      const bytes = await pending;
      if (bytes instanceof Response) return bytes.bodyUsed ? refuse(bytes.status, "fetching the document failed") : bytes.clone();
      fetchMs = Math.round(performance.now() - t0);
      if ((await sha256(bytes)).slice(0, 16) !== id) {
        return refuse(409, "the document at that URL is no longer the one this page was made from: reload the page");
      }
      let queued = laying.get(id);
      if (!queued) {
        // layOut is called when the turn comes, not before: a layout waiting for its turn is not
        // in `laid`, so a render that holds the turn never waits on one queued behind itself.
        const q: Queued = queued = { sharers: 0, promise: undefined as unknown as Promise<Laid> };
        q.promise = turn(() => {
          // Every request already waiting takes hold of the layout the moment it exists.
          pin(q.made = layOut(id, bytes), q.sharers);
          return q.made;
        }).finally(() => laying.get(id) === q && laying.delete(id));
        laying.set(id, q);
      }
      const q = queued;
      if (q.made) pin(q.made);
      else q.sharers++;
      hit = q.promise;
      key = () => q.made;
    } else {
      // Already laid out, or still being laid out by a request whose turn may have run out: this one
      // takes no turn, so it has a limit of its own and is told to try again instead of waiting for ever.
      const kept = layOut(id, new Uint8Array()); // only moves it to most recently used
      pin(kept);
      key = () => kept;
      const limit = engine.waitMs ?? 120_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      hit = Promise.race([kept, new Promise<never>((_, no) => (timer = setTimeout(() => no(new TookTooLong(limit)), limit)))]).finally(() => clearTimeout(timer));
    }
    const t1 = performance.now();
    const n = Number(q.n);
    let t2 = t1;
    const image = await using(hit, key, ({ doc }) => {
      t2 = performance.now();
      const count = doc.sizes.length / 2;
      return n > count ? count : doc.page(n - 1, Number(q.s));
    });
    if (typeof image === "number") return refuse(404, `the document has ${image} pages`);
    const headers: Record<string, string> = {
      "content-type": engine.contentType,
      "server-timing": `fetch;dur=${fetchMs}, layout;dur=${Math.round(t2 - t1)}, render;dur=${Math.round(performance.now() - t2)}`,
      // The URL names the document by its hash, so the image does not change under it; an hour, so a new engine build shows up.
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    };
    // An SVG opened by its own address is a document: nothing in it may run or load, whatever the .docx held.
    if (engine.contentType === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
    return new Response(image as Uint8Array<ArrayBuffer>, { headers });
  }

  return {
    html,
    page,
    /** Layouts held and released so far, for the tests. */
    stats: () => ({ kept: laid.size, released }),
    /** Drop every layout, as a fresh isolate would start (tests). */
    async forget() {
      const all = [...laid.values()];
      laid.clear();
      fetching.clear();
      laying.clear();
      all.forEach(evict);
      await Promise.allSettled(all);
      released = 0;
    },
  };
}
