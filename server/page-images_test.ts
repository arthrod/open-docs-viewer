/**
 * The page-image route shape (server/page-images.ts), with an engine made up
 * here: no network, no wasm.
 *
 *   deno test -A server/page-images_test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { type PageImageEngine, pageImages, sha256 } from "./page-images.ts";

/** An engine whose document is `pages` Letter pages, and whose page image is its number as text. */
function fake(over: Partial<PageImageEngine> = {}) {
  const seen = { loads: 0, opens: 0, frees: 0 };
  const engine: PageImageEngine = {
    slug: "fake",
    name: "Fake <engine>",
    contentType: "image/png",
    densities: ["1", "1.5"],
    load: () => (seen.loads++, Promise.resolve()),
    open: (bytes) => {
      seen.opens++;
      const pages = bytes[0];
      return { sizes: Array.from({ length: pages * 2 }, (_, i) => (i % 2 ? 1056 : 816)), page: (i, s) => new TextEncoder().encode(`${i + 1}@${s}`), free: () => void seen.frees++ };
    },
    ...over,
  };
  return { seen, route: pageImages(engine) };
}
const SRC = new URL("https://docs.test/a.docx");
const doc = (pages: number, salt = 0) => new Uint8Array([pages, salt]);
const urls = (html: string) => [...html.matchAll(/<img class="page"[^>]* src="([^"]+)"/g)].map((m) => new URL(m[1].replaceAll("&amp;", "&"), "https://v.test"));

Deno.test("the page holds one image per page, sized, the first two eager and the rest lazy, and none inline", async () => {
  const { route } = fake();
  const r = await route.html(doc(5), SRC);
  assertEquals(r.pages, 5);
  assertEquals(r.scriptSrc, "'self'");
  const imgs = r.html.match(/<img class="page"[^>]*>/g) ?? [];
  assertEquals(imgs.length, 5);
  assertEquals(imgs.filter((i) => i.includes('loading="lazy"')).length, 3);
  const first = imgs[0] ?? "";
  assert(first.includes('width="816"') && first.includes('height="1056"'), first);
  assert(/srcset="[^"]*s=1 1x, [^"]*s=1\.5 1\.5x"/.test(first), first);
  assert(!r.html.includes("data:image"));
  const u = urls(r.html);
  assertEquals(u[4].pathname, "/r/fake/page");
  assertEquals(u[4].searchParams.get("src"), SRC.href);
  assertEquals(u[4].searchParams.get("n"), "5");
  // The engine's name is text, not markup.
  assert(r.html.includes("<title>Fake &lt;engine> · server-rendered</title>"), r.html.slice(0, 300));
});

Deno.test("an engine with one density offers no srcset, and says what it does not paint", async () => {
  const { route } = fake({ densities: ["1"], contentType: "image/svg+xml", unpainted: ["comments"] });
  const r = await route.html(doc(1), SRC);
  assert(!r.html.includes("srcset"));
  assertEquals(r.unpainted, ["comments"]);
  const id = urls(r.html)[0].searchParams.get("doc")!;
  const res = await route.page({ doc: id, n: "1", s: "1" }, () => Promise.resolve(doc(1)));
  assertEquals(res.headers.get("content-type"), "image/svg+xml");
  // An SVG opened by its own address runs and loads nothing.
  assert(res.headers.get("content-security-policy")?.includes("default-src 'none'"));
  assertEquals(await res.text(), "1@1");
  assertEquals((await route.page({ doc: id, n: "1", s: "1.5" }, () => Promise.resolve(doc(1)))).status, 400);
});

Deno.test("a page URL answers with that page, and is refused when it cannot be that document's page", async () => {
  const { route } = fake();
  const bytes = doc(3);
  const id = urls((await route.html(bytes, SRC)).html)[0].searchParams.get("doc")!;
  const get = () => Promise.resolve(bytes);
  const ok = await route.page({ doc: id, n: "3", s: "1.5" }, get);
  assertEquals([ok.status, ok.headers.get("content-type"), await ok.text()], [200, "image/png", "3@1.5"]);
  assertEquals(ok.headers.get("content-security-policy"), null);
  assertEquals((await route.page({ doc: id, n: "4", s: "1" }, get)).status, 404);
  assertEquals((await route.page({ doc: id, n: "0", s: "1" }, get)).status, 400);
  assertEquals((await route.page({ doc: id, n: "1", s: "7" }, get)).status, 400);
  assertEquals((await route.page({ doc: id, n: "1" }, get)).status, 400);
  assertEquals((await route.page({ doc: "zz", n: "1", s: "1" }, get)).status, 400);
  // The URL now holds a different document than the page was made from.
  assertEquals((await route.page({ doc: "0".repeat(16), n: "1", s: "1" }, () => Promise.resolve(doc(3, 9)))).status, 409);
  // A failed fetch is passed through as it is.
  assertEquals((await route.page({ doc: "1".repeat(16), n: "1", s: "1" }, () => Promise.resolve(new Response("upstream 404", { status: 422 })))).status, 422);
});

Deno.test("an isolate without the layout fetches and lays the document out once for pages asked for together, in one turn", async () => {
  const { route, seen } = fake();
  const bytes = doc(3);
  const id = urls((await route.html(bytes, SRC)).html)[0].searchParams.get("doc")!;
  await route.forget(); // as a fresh isolate
  seen.opens = 0;
  let fetches = 0, turnsTaken = 0;
  const get = async () => {
    fetches++;
    await new Promise((r) => setTimeout(r, 10));
    return bytes;
  };
  const turn = async <T>(job: () => Promise<T>) => {
    turnsTaken++;
    await new Promise((r) => setTimeout(r, 10)); // as if waiting behind another render
    return job();
  };
  const all = await Promise.all(["1", "2", "3"].map((n) => route.page({ doc: id, n, s: "1" }, get, turn)));
  assertEquals(all.map((r) => r.status), [200, 200, 200]);
  assertEquals([fetches, turnsTaken, seen.opens], [1, 1, 1]);
  await route.page({ doc: id, n: "2", s: "1" }, get, turn);
  assertEquals([fetches, turnsTaken, seen.opens], [1, 1, 1]); // the layout is kept: a page from it needs none of them
});

Deno.test("a layout pushed out by newer documents is freed at once, and its pages still render when asked again", async () => {
  const { route, seen } = fake();
  const first = urls((await route.html(doc(2, 1), SRC)).html)[0].searchParams.get("doc")!;
  assertEquals(route.stats(), { kept: 1, released: 0 });
  for (let i = 2; i <= 5; i++) await route.html(doc(2, i), SRC);
  assertEquals(route.stats(), { kept: 3, released: 2 });
  assertEquals(seen.frees, 2);
  let fetched = 0;
  const res = await route.page({ doc: first, n: "1", s: "1" }, () => (fetched++, Promise.resolve(doc(2, 1))));
  assertEquals([res.status, fetched], [200, 1]); // laid out again from the document, not read from freed memory
  // Opening the same document again lays it out anew and frees the layout it replaces.
  await route.forget();
  seen.frees = 0;
  await route.html(doc(2, 7), SRC);
  await route.html(doc(2, 7), SRC);
  assertEquals([route.stats().kept, seen.frees], [1, 1]);
});

Deno.test("the layout pushed out is freed before the next document is laid out: the engine never holds one more than it keeps", async () => {
  const order: string[] = [];
  const { route } = fake({
    keep: 1,
    open: (bytes) => {
      order.push(`open ${bytes[1]}`);
      return { sizes: [816, 1056], page: () => new Uint8Array(), free: () => void order.push(`free ${bytes[1]}`) };
    },
  });
  for (const salt of [1, 2, 3]) await route.html(doc(1, salt), SRC);
  assertEquals(order, ["open 1", "free 1", "open 2", "free 2", "open 3"]);
  assertEquals(route.stats(), { kept: 1, released: 2 });
});

Deno.test("a refused turn is the page request's refusal, a failed engine load is tried again, and neither is kept", async () => {
  let fail = true;
  const { route, seen } = fake({ load: () => (fail ? Promise.reject(new Error("no engine")) : Promise.resolve()) });
  const bytes = doc(1);
  let said = "";
  await route.html(bytes, SRC).catch((e) => (said = e.message));
  assertEquals([said, route.stats().kept, seen.opens], ["no engine", 0, 0]);
  fail = false;
  const id = urls((await route.html(bytes, SRC)).html)[0].searchParams.get("doc")!;
  await route.forget();
  let busy = true;
  const turn = <T>(job: () => Promise<T>) => (busy ? Promise.reject(new Error("busy")) : job());
  said = "";
  await route.page({ doc: id, n: "1", s: "1" }, () => Promise.resolve(bytes), turn).catch((e) => (said = e.message));
  assertEquals(said, "busy");
  busy = false;
  assertEquals((await route.page({ doc: id, n: "1", s: "1" }, () => Promise.resolve(bytes), turn)).status, 200);
});

Deno.test("a page request still waiting for its layout when that layout is pushed out draws from it, and it is freed afterwards", async () => {
  const seen = { frees: 0, drawnAfterFree: 0 };
  const gates: (() => void)[] = [];
  // Resolves when the engine has been asked for a layout the test has not yet let through.
  const gateWaiters: (() => void)[] = [];
  const gate = () => gates.length ? Promise.resolve() : new Promise<void>((r) => gateWaiters.push(r));
  const { route } = fake({
    keep: 1,
    // Each layout waits until the test lets it through.
    open: async (bytes) => {
      await new Promise<void>((go) => {
        gates.push(go);
        for (const w of gateWaiters.splice(0)) w();
      });
      let freed = false;
      return {
        sizes: Array.from({ length: bytes[0] * 2 }, (_, i) => (i % 2 ? 1056 : 816)),
        page: (i, s) => {
          if (freed) seen.drawnAfterFree++;
          return new TextEncoder().encode(`${i + 1}@${s}`);
        },
        free: () => void (freed = true, seen.frees++),
      };
    },
  });
  const a = doc(2, 7), b = doc(1, 8);
  const id = async (x: Uint8Array) => (await sha256(x)).slice(0, 16);
  // A page of document A is asked for in an isolate without its layout: it waits for the layout.
  const waiting = route.page({ doc: await id(a), n: "2", s: "1" }, () => Promise.resolve(a));
  await gate();
  // Document B's page is opened meanwhile: with room for one layout, A's is pushed out while still being made.
  const other = route.html(b, SRC);
  // B registers its eviction of A after hashing its bytes and a few microtasks. Hash the same bytes
  // (B's hash was asked for first) and let one macrotask pass, which runs every microtask queued by then.
  await id(b);
  await new Promise((r) => setTimeout(r, 0));
  gates.shift()!(); // A's layout finishes: its eviction and the waiting page request both react
  await gate(); // B's layout is asked for only after A's has settled
  gates.shift()!();
  const res = await waiting;
  await other;
  assertEquals(res.status, 200);
  assertEquals(new TextDecoder().decode(await res.arrayBuffer()), "2@1");
  assertEquals(seen.drawnAfterFree, 0, "the page was drawn from a layout already freed");
  assertEquals(seen.frees, 1, "A's layout is freed once its waiting page has been drawn");
});

Deno.test("a page request for a layout still being made by a request whose turn ran out is told to try again, not left waiting", async () => {
  const { TookTooLong } = await import("./queue.ts");
  // The engine never finishes laying this document out.
  const { route } = fake({ waitMs: 30, open: () => new Promise(() => {}) });
  const a = doc(1, 9);
  const id = (await sha256(a)).slice(0, 16);
  // The first request's turn runs out while the layout goes on: the layout stays kept, unfinished.
  const first = route.page({ doc: id, n: "1", s: "1" }, () => Promise.resolve(a), (job) => {
    job().catch(() => {}); // the layout goes on by itself; this test never lets it finish
    return Promise.reject(new TookTooLong(1));
  });
  let err: unknown;
  await first.catch((e) => (err = e));
  assert(err instanceof TookTooLong);
  // The retry finds that layout and takes no turn: it has its own limit.
  const t0 = performance.now();
  err = undefined;
  await route.page({ doc: id, n: "1", s: "1" }, () => Promise.resolve(a)).catch((e) => (err = e));
  assert(err instanceof TookTooLong, String(err));
  assert(performance.now() - t0 < 2000);
});

Deno.test("a layout replaced by a newer one of the same document is freed at once, not held by requests on the newer one", async () => {
  let frees = 0;
  const gates: (() => void)[] = [];
  const gateWaiters: (() => void)[] = [];
  const gate = () => gates.length ? Promise.resolve() : new Promise<void>((r) => gateWaiters.push(r));
  const { route } = fake({
    open: async (bytes) => {
      await new Promise<void>((go) => {
        gates.push(go);
        for (const w of gateWaiters.splice(0)) w();
      });
      return { sizes: [816, 1056].slice(0, bytes[0] * 2), page: () => new Uint8Array(), free: () => void frees++ };
    },
  });
  const a = doc(1, 9);
  const first = route.html(a, SRC);
  await gate();
  gates.shift()!();
  await first;
  // The page is opened again: a new layout of the same document, still being made.
  const second = route.html(a, SRC);
  await gate();
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(frees, 1, "the first layout waits for the request on the second one");
  gates.shift()!();
  await second;
  assertEquals(frees, 1);
});
