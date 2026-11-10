/**
 * Docxodus (.NET → WebAssembly) on this server: its own DOCX → HTML converter,
 * in its Paginated mode, with headers, footers, footnotes and endnotes.
 *
 * Docxodus paginates by measuring laid-out text (its PaginationEngine, or the
 * export-browser package, which lays out in a frame). Deno has no layout
 * engine, so the split is: the server does the conversion (the .NET part,
 * the heavy one); the browser runs Docxodus's own paginateHtml once, from
 * this Val's origin (client/dx-boot.js), to flow it into page boxes.
 */
/** Docxodus's paginator bundle (scripts/build-dx-paginate.sh), pinned and SRI-checked. */
export const DX_PAGINATE_URL =
  "https://cdn.jsdelivr.net/gh/arthrod/open-docs-viewer@e94b27d479e1547371b4ddf091e72a789b44035f/client/dx-paginate.js";
const DX_PAGINATE_SRI = "sha384-cmn0uJ/FPb43+fQ/t0y+Nn5VfllCoYsrqqksCs9jxnjk9gDcDrXpkfwSG0r8HpFP";

// deno-lint-ignore no-explicit-any
let dx: Promise<any> | undefined;

export async function docxodusHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  dx ??= import("npm:docxodus@15.1.0/core").then(async (m) => (await m.initialize(), m)).catch((e) => {
    dx = undefined; // a failed init is retried on the next request
    throw e;
  });
  const m = await dx;
  const t1 = performance.now();
  const converted: string = await m.convertDocxToHtml(bytes, {
    paginationMode: m.PaginationMode.Paginated,
    renderHeadersAndFooters: true,
    renderFootnotesAndEndnotes: true,
  });
  // Shipped as JSON data (never executed); "<" escaped so nothing in it can close the element.
  const data = JSON.stringify(converted).replace(/</g, "\\u003c");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Docxodus · server-converted, paginated here</title>
<style>html,body{margin:0}body{background:#eef1f5;padding:24px 0}#viewer{display:flex;flex-direction:column;align-items:center}</style>
<script type="application/json" id="dx-html">${data}</script>
<link rel="modulepreload" href="${DX_PAGINATE_URL}" integrity="${DX_PAGINATE_SRI}" crossorigin="anonymous" />
<script type="module" src="/client/dx-boot.js"></script>
</head><body><div id="viewer"></div></body></html>`;
  return { html, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1), scriptSrc: `'self' ${DX_PAGINATE_URL}`, paginatedIn: "browser" as const };
}
