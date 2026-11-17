import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Busy, TookTooLong, turns } from "./queue.ts";

Deno.test("renders run one at a time, in the order asked, and each learns how long it waited", async () => {
  const run = turns(8);
  const log: string[] = [];
  const job = (name: string, ms: number) => run(async () => {
    log.push(`${name} in`);
    await new Promise((r) => setTimeout(r, ms));
    log.push(`${name} out`);
    return name;
  });
  const [a, b, c] = await Promise.all([job("a", 30), job("b", 5), job("c", 1)]);
  assertEquals(log, ["a in", "a out", "b in", "b out", "c in", "c out"]);
  assertEquals([a.value, b.value, c.value], ["a", "b", "c"]);
  assertEquals(a.waitedMs >= 0, true); // no upper bound: a paused process must not fail a correct queue
  assertEquals(b.waitedMs >= 25, true);
});

Deno.test("a failed render does not block the next one", async () => {
  const run = turns(8);
  const bad = run(() => Promise.reject(new Error("boom")));
  const good = run(() => Promise.resolve(1));
  await assertRejects(() => bad, Error, "boom");
  assertEquals((await good).value, 1);
});

Deno.test("past the limit of waiting renders, a new one is refused at once and the others go on", async () => {
  const run = turns(2);
  const slow = () => new Promise<number>((r) => setTimeout(() => r(1), 20));
  const first = run(slow), second = run(slow), third = run(slow); // one running, two waiting
  await assertRejects(() => run(slow), Busy);
  assertEquals((await Promise.all([first, second, third])).map((x) => x.value), [1, 1, 1]);
  assertEquals((await run(slow)).value, 1); // room again
});

Deno.test("a render that never ends gives its turn back after the limit, and the next ones run", async () => {
  const run = turns(6, 40);
  const stuck = run(() => new Promise<string>(() => {}));
  const next = run(() => Promise.resolve("next"));
  const err = await assertRejects(() => stuck, TookTooLong);
  assertEquals(err.message.includes("40"), false); // said in seconds, for the reader of the answer
  assertEquals((await next).value, "next");
  assertEquals((await run(() => Promise.resolve("later"))).waitedMs < 30, true); // the counter is right again
});

Deno.test("a render that ends in time is not cut short, and its own failure is its own", async () => {
  const run = turns(6, 200);
  assertEquals((await run(async () => { await new Promise((r) => setTimeout(r, 20)); return "ok"; })).value, "ok");
  await assertRejects(() => run(() => Promise.reject(new Error("boom"))), Error, "boom");
});
