import { assertEquals } from "jsr:@std/assert@1.0.13";
import { currentResults, forgetResults, RESULTS } from "./results.ts";

const withFetch = async (answer: () => Promise<Response>, run: () => Promise<void>) => {
  const real = globalThis.fetch;
  globalThis.fetch = (() => answer()) as typeof fetch;
  try {
    forgetResults();
    await run();
  } finally {
    globalThis.fetch = real;
    forgetResults();
  }
};
const good = { measuredAt: "2026-01-01", environment: "e", engines: { folio: { renderedMs: 1, runs: [1], bytes: 1, requests: 1, heapBytes: 1, how: "x" } } };

Deno.test("results: requests that arrive together make one fetch", async () => {
  let fetches = 0;
  await withFetch(async () => {
    fetches++;
    await new Promise((r) => setTimeout(r, 10));
    return Response.json(good);
  }, async () => {
    const all = await Promise.all([currentResults(), currentResults(), currentResults()]);
    assertEquals(fetches, 1);
    assertEquals(all.map((r) => r.measuredAt), ["2026-01-01", "2026-01-01", "2026-01-01"]);
  });
});

Deno.test("results: a file of another shape is not taken; the bundled one is shown", async () => {
  for (const bad of [[], { engines: {} }, { measuredAt: "2026-01-01", engines: [] }, { measuredAt: 5, engines: good.engines }, { engines: good.engines }, "text", null]) {
    await withFetch(() => Promise.resolve(Response.json(bad)), async () => {
      assertEquals(await currentResults(), RESULTS, JSON.stringify(bad));
    });
  }
});
