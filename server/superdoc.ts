/**
 * SuperDoc, on this server: the engine's own headless runtime
 * (`@superdoc/docx-engine/document-runtime`, openDocumentRuntime) and its
 * Document API HTML projection (`projectHtml`, review mode "redline").
 *
 * This is NOT the paginated view the browser route draws: SuperDoc's page
 * layout needs a browser. The projection is semantic HTML: headings,
 * paragraphs, lists with their Word labels, tables, <ins>/<del> for tracked
 * changes. It sends no colours or fonts, and an image comes back as a
 * placeholder. What it downgraded or replaced is counted in `x-unpainted`.
 */
import { openDocumentRuntime } from "npm:@superdoc/docx-engine@0.28.0/document-runtime";

// deno-lint-ignore no-explicit-any
type Any = any;

const CSS = `html,body{margin:0}body{background:#eef1f5;padding:24px 0}
main{box-sizing:border-box;width:816px;max-width:calc(100vw - 16px);margin:0 auto;padding:96px;background:#fff;
box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06);font:11pt/1.4 Calibri,Carlito,Arial,sans-serif;color:#111;overflow-wrap:anywhere}
@media(max-width:700px){main{padding:24px}}
h1{font-size:16pt}h2{font-size:13pt}h3{font-size:12pt}
table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #999;padding:3px 7px;vertical-align:top}
ul,ol{padding-left:24px}pre{white-space:pre-wrap}
ins{color:#2a6fdb;text-decoration:underline}del{color:#b4232f;text-decoration:line-through}
[data-superdoc-placeholder]{color:#6b6b6b;font:9pt ui-monospace,monospace}`;

export async function superdocHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  const rt = await openDocumentRuntime({ bytes, sourceLabel: "document.docx" });
  try {
    const r: Any = await rt.runWithDocumentApi((api: Any) => api.projectHtml({ reviewMode: "redline" }));
    if (r.status === "failed") throw new Error("SuperDoc could not project this document to HTML");
    const counts: Record<string, number> = {};
    for (const d of r.diagnostics ?? []) {
      if (d.disposition === "preserved") continue;
      const k = `${d.construct} ${d.disposition}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>SuperDoc · server-rendered</title>
<style>${CSS}</style></head><body><main>${r.content}</main></body></html>`;
    return {
      html,
      initMs: 0,
      renderMs: Math.round(performance.now() - t0),
      unpainted: ["pagination (browser only)", ...Object.entries(counts).map(([k, n]) => `${n} ${k}`)],
    };
  } finally {
    await rt.close();
  }
}
