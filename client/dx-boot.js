// Flows the server-converted Docxodus HTML into page boxes with Docxodus's own
// read-only paginator (bundled by scripts/build-dx-paginate.sh; the page preloads
// it with its SRI hash, so a changed file is refused).
// Pagination measures laid-out text, so it runs where a layout engine is: here.
import { paginateHtml } from "https://cdn.jsdelivr.net/gh/arthrod/open-docs-viewer@e94b27d479e1547371b4ddf091e72a789b44035f/client/dx-paginate.js";

const html = JSON.parse(document.getElementById("dx-html").textContent);
await document.fonts.ready;
const t0 = performance.now();
const result = paginateHtml(html, "viewer", { scale: 1 });
const ms = Math.round(performance.now() - t0);
document.documentElement.dataset.pages = String(result.totalPages);
document.documentElement.dataset.paginateMs = String(ms);
console.log(`[docxodus] ${result.totalPages} pages, paginated in ${ms} ms`);
