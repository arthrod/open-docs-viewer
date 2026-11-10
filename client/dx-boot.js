// Flows the server-converted Docxodus HTML into page boxes with Docxodus's own
// read-only paginator (bundled in dx-paginate.js; see scripts/dx-paginate.entry.ts).
// Pagination measures laid-out text, so it runs where a layout engine is: here.
import { paginateHtml } from "./dx-paginate.js";

const html = JSON.parse(document.getElementById("dx-html").textContent);
await document.fonts.ready;
const t0 = performance.now();
const result = paginateHtml(html, "viewer", { scale: 1 });
const ms = Math.round(performance.now() - t0);
document.documentElement.dataset.pages = String(result.totalPages);
document.documentElement.dataset.paginateMs = String(ms);
console.log(`[docxodus] ${result.totalPages} pages, paginated in ${ms} ms`);
