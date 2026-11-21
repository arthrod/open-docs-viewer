/**
 * Fidus Writer's document library, on this server.
 *
 * The same reading as its page on editors.benchmarks.law (the editors trial's
 * demo build): `DocxConvert` turns the .docx into a Fidus document, which is a
 * ProseMirror document on the library's own `docSchema`. The browser page shows
 * it in a ProseMirror view; here the schema's own `toDOM` rules are run by
 * ProseMirror's DOMSerializer into a linkedom document. Fidus Writer does not
 * paginate on screen, so there are no pages. This is the published package
 * (`@fiduswriter/document`), not the commit the trial built.
 */
import JSZip from "npm:jszip@3.10.1";
import { DOMSerializer } from "npm:prosemirror-model@1.25.4";
import { parseHTML } from "npm:linkedom@0.18.12";
import { DocxConvert } from "npm:@fiduswriter/document@0.3.40/importer/docx/convert";
import { docSchema } from "npm:@fiduswriter/document@0.3.40/schema/document/index";

// deno-lint-ignore no-explicit-any
type Any = any;

// The import template the Fidus Writer CLI uses by default (as in the trial's harness).
const part = (attrs: Record<string, unknown>) => ({
    locking: false, optional: false, help: "", deleted: false, hidden: false, language: "", ...attrs
})
const IMPORT_TEMPLATE = {
    content: {
        type: "doc",
        attrs: {
            import_id: "benchmarks-law-demo", template: "Default", papersize: "A4", papersizes: ["A4"],
            citationstyle: "apa", citationstyles: ["apa"], documentstyle: "default",
            language: "en-US", languages: ["en-US"], footnote_marks: [], footnote_elements: [],
            bibliography_header: {type: "text", content: [{type: "text", text: "Bibliography"}]},
            metadata: {}
        },
        content: [
            {type: "title"},
            {type: "contributors_part", attrs: part({id: "authors", metadata: "authors", title: "Authors"})},
            {
                type: "richtext_part",
                attrs: part({id: "body", title: "Body", initial: [{type: "paragraph"}], elements: ["paragraph"]}),
                content: [{type: "paragraph"}]
            },
            {type: "tags_part", attrs: part({metadata: "keywords", title: "Keywords"})}
        ]
    }
}

const CSS = `body{margin:0;background:#eef0f3}
.docx-page{box-sizing:border-box;max-width:860px;margin:16px auto 48px;padding:48px 64px;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / .12);white-space:pre-wrap;word-wrap:break-word;font:16px/1.55 Georgia,"Times New Roman",serif}
@media(max-width:600px){.docx-page{margin:0;padding:20px 16px}}
.docx-page table{border-collapse:collapse;margin:1em 0}.docx-page td,.docx-page th{border:1px solid #c3c8d0;padding:4px 8px;vertical-align:top}
.docx-page img{max-width:100%;height:auto}.docx-page .article-part-header,.docx-page [data-part-title]{display:block}`;

export async function fidusHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  const importer: Any = new (DocxConvert as Any)(await JSZip.loadAsync(bytes), "benchmarks-law-demo", IMPORT_TEMPLATE as never, {});
  const imported = await importer.init();
  const { document } = parseHTML("<!DOCTYPE html><html><body><div id='page' class='docx-page'></div></body></html>");
  // Figures: the schema reads an image's address from this table; the importer holds the bytes.
  const shown: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(importer.images ?? {})) {
    const e = entry as { file?: Blob; file_type?: string };
    if (!e.file) continue;
    const b = new Uint8Array(await e.file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    shown[id] = { ...e, image: `data:${e.file.type || e.file_type || "image/png"};base64,${btoa(bin)}`, file_type: e.file.type || e.file_type };
  }
  (docSchema as Any).cached.imageDB = { db: shown };
  const doc = (docSchema as Any).nodeFromJSON(imported.content);
  const root: Any = document.getElementById("page");
  // Some of the schema's toDOM rules build their elements on the global `document`: it is linkedom's
  // for the length of this call (renders are taken one at a time in this isolate, server/queue.ts).
  const g = globalThis as Any, had = "document" in g, before = g.document;
  g.document = document;
  try {
    DOMSerializer.fromSchema(docSchema as Any).serializeFragment(doc.content, { document }, root);
  } finally {
    if (had) g.document = before;
    else delete g.document;
  }
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Fidus Writer · server-rendered</title>
<style>${CSS}</style></head><body>${root.outerHTML}</body></html>`;
  return { html, initMs: 0, renderMs: Math.round(performance.now() - t0), unpainted: ["pages (Fidus Writer paginates only for print)"] };
}
