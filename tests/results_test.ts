import { currentResults, RESULTS } from "../server/results.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("results coalesce fetches, preserve success TTL, retry fallback and reject invalid JSON", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  let calls = 0;
  let respond!: (response: Response) => void;
  globalThis.fetch = () => {
    calls++;
    return new Promise<Response>((resolve) => { respond = resolve; });
  };
  Date.now = () => now;
  try {
    const first = currentResults();
    const second = currentResults();
    assert(calls === 1, "concurrent requests must share the fetch");
    const remote = { ...RESULTS, measuredAt: "remote" };
    respond(Response.json(remote));
    assert((await first).measuredAt === "remote", "accept valid remote results");
    assert(await second === await first, "callers receive the same results");
    now += 299_999;
    await currentResults();
    assert(calls === 1, "successful cache lasts five minutes");
    now++;
    const failed = currentResults();
    respond(new Response(null, { status: 503 }));
    assert(await failed === RESULTS, "HTTP failure uses bundled results");
    now += 29_999;
    await currentResults();
    assert(Number(calls) === 2, "fallback is cached briefly");
    now++;
    for (const invalid of [null, { engines: [] }, { ...remote, engines: {} },
      { ...remote, engines: [remote.engines] }, { ...remote, measuredAt: null }]) {
      const attempt = currentResults();
      respond(Response.json(invalid));
      assert(await attempt === RESULTS, "invalid remote shape must fall back");
      now += 30_000;
    }
    const retry = currentResults();
    respond(Response.json(remote));
    assert((await retry).measuredAt === "remote", "retry succeeds after fallback TTL");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
