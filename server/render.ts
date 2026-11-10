/**
 * Server-side rendering: the Val fetches the .docx AND renders it, and the
 * browser only displays the result — what Word's and Google's viewers do.
 * Only engines that can run in Deno without a DOM, canvas or subprocess can
 * do this; see README.
 */
// deno-lint-ignore no-explicit-any
let dx: Promise<any> | undefined;

/** Docxodus (.NET → WebAssembly): its own DOCX → HTML converter. */
export async function docxodusHtml(bytes: Uint8Array): Promise<{ html: string; initMs: number; renderMs: number }> {
  const t0 = performance.now();
  dx ??= import("npm:docxodus@15.1.0/core").then(async (m) => (await m.initialize(), m)).catch((e) => {
    dx = undefined; // a failed init is retried on the next request
    throw e;
  });
  const m = await dx;
  const t1 = performance.now();
  const html: string = await m.convertDocxToHtml(bytes);
  return { html, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1) };
}
