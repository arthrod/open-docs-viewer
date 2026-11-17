/**
 * One server render at a time per isolate.
 *
 * An engine laying out a 500-page document holds hundreds of MB. Several of
 * those at once in one isolate ended it: 24 simultaneous requests for the
 * 500-page sample (2026-11-16) got five `"socket hang up"` answers from the
 * platform and five folio pages cut off at 4 MB of 30. PageSpeed read those
 * as "not HTML" and "unable to resolve". Rendering is CPU work on one thread,
 * so doing them in turn loses no speed; it only keeps one document in memory.
 */

/** Thrown when too many renders are already waiting. */
export class Busy extends Error {
  constructor(public waiting: number) {
    super(`${waiting} renders are already waiting`);
  }
}

/**
 * A queue: `run(job)` starts `job` when every earlier one has ended, and
 * resolves with its value and how long it waited for its turn. With `limit`
 * jobs already waiting, `run` rejects with `Busy` without queueing.
 */
export function turns(limit: number) {
  let last: Promise<unknown> = Promise.resolve();
  let pending = 0; // the one running, and those waiting behind it
  return async function run<T>(job: () => Promise<T>): Promise<{ value: T; waitedMs: number }> {
    if (pending > limit) throw new Busy(pending - 1);
    const asked = performance.now();
    const before = last;
    let done!: () => void;
    last = new Promise<void>((r) => (done = r));
    pending++;
    try {
      await before;
      const waitedMs = Math.round(performance.now() - asked);
      return { value: await job(), waitedMs };
    } finally {
      pending--;
      done();
    }
  };
}
