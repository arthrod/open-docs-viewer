/**
 * office-open, on this server.
 *
 * office-open is a library with no renderer: `parseDocument` reads a .docx into
 * its document model, and that is all there is to show. Its page on
 * editors.benchmarks.law (the editors trial's demo build) draws that model as an
 * outline; this route runs the same parser (`@office-open/docx`, the published
 * package) and the same outline code, copied from the trial
 * (`demos/office-open/demo/outline.ts` at et-v0.11.1), into a linkedom document.
 * Nothing here is a layout: there are no pages.
 */
import { parseDocument } from "npm:@office-open/docx@0.15.3";
import { parseHTML } from "npm:linkedom@0.18.12";

// deno-lint-ignore no-explicit-any
let DOC: any;
// The outline code names DOM types; here they are linkedom's.
// deno-lint-ignore no-explicit-any
type HTMLElement = any;
// deno-lint-ignore no-explicit-any
type HTMLElementTagNameMap = Record<string, any>;

/* ---------- the trial demo's outline code (only `document` is replaced by DOC) ---------- */

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = DOC.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function inlineText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isRecord(node) && !Array.isArray(node)) return "";
  if (Array.isArray(node)) return node.map(inlineText).join("");

  const parts: string[] = [];
  if (typeof node.text === "string") parts.push(node.text);
  if (typeof node.deletedText === "string") parts.push(node.deletedText);
  if (typeof node.result === "string") parts.push(node.result);
  if (node.tab === true) parts.push("\t");
  if (node.carriageReturn === true || node.break === true) parts.push("\n");
  if (Array.isArray(node.children)) parts.push(inlineText(node.children));

  for (const key of [
    "hyperlink",
    "complexField",
    "simpleField",
    "sdt",
    "dir",
    "bdo",
    "inserted",
    "deleted",
    "movedFrom",
    "movedTo",
    "smartTag",
    "ruby",
    "altChunk",
    "customXml",
    "textbox",
  ]) {
    if (node[key] != null) parts.push(inlineText(node[key]));
  }

  if (isRecord(node.altChunk) || keyIsAlt(node)) {
    parts.push(altChunkText(node.altChunk ?? node));
  }

  return parts.join("");
}

function keyIsAlt(node: Json): boolean {
  return "data" in node && "contentType" in node && !("children" in node) && typeof node.text !== "string";
}

function altChunkText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (!isRecord(value)) return "";
  if (typeof value.data === "string") return value.data;
  if (value.data instanceof Uint8Array) return new TextDecoder().decode(value.data);
  return "";
}

function headingTag(paragraph: Json): "h2" | "h3" | "h4" | "p" {
  const heading = paragraph.heading;
  if (typeof heading !== "string") return "p";
  const match = /Heading([1-9])/i.exec(heading);
  if (!match) return "p";
  const level = Number(match[1]);
  if (level <= 1) return "h2";
  if (level === 2) return "h3";
  return "h4";
}

function renderParagraph(paragraph: unknown): HTMLElement {
  const record = isRecord(paragraph) ? paragraph : {};
  const text = typeof paragraph === "string" ? paragraph : inlineText(record);
  return el(headingTag(record), "block", text);
}

function cellElement(cell: unknown): HTMLTableCellElement {
  const td = DOC.createElement("td");
  if (!isRecord(cell)) {
    td.textContent = inlineText(cell);
    return td;
  }
  if (typeof cell.columnSpan === "number" && cell.columnSpan > 1) td.colSpan = cell.columnSpan;
  if (typeof cell.rowSpan === "number" && cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
  const blocks = Array.isArray(cell.children) ? cell.children : cell.sdt;
  if (Array.isArray(blocks)) td.append(...renderBlocks(blocks));
  else if (isRecord(cell.sdt) && Array.isArray(cell.sdt.cells)) {
    td.textContent = cell.sdt.cells.map(inlineText).join("");
  } else td.textContent = inlineText(cell);
  return td;
}

function renderTable(table: Json): HTMLTableElement {
  const html = DOC.createElement("table");
  const rows = Array.isArray(table.rows) ? table.rows : [];
  for (const row of rows) {
    const tr = DOC.createElement("tr");
    const cells = isRecord(row) && Array.isArray(row.cells)
      ? row.cells
      : isRecord(row) && isRecord(row.sdt) && Array.isArray(row.sdt.cells)
        ? row.sdt.cells
        : [];
    if (cells.length === 0) {
      const td = DOC.createElement("td");
      td.textContent = inlineText(row);
      tr.append(td);
    } else {
      for (const cell of cells) tr.append(cellElement(cell));
    }
    html.append(tr);
  }
  return html;
}

function renderBlock(node: unknown): HTMLElement | null {
  if (!isRecord(node)) {
    const text = inlineText(node);
    return text ? el("p", "block", text) : null;
  }
  if ("paragraph" in node) return renderParagraph(node.paragraph);
  if (isRecord(node.table)) return renderTable(node.table);
  if (isRecord(node.sdt)) {
    const wrap = el("div", "region");
    const kids = node.sdt.children ?? node.sdt.content;
    wrap.append(...renderBlocks(Array.isArray(kids) ? kids : []));
    return wrap;
  }
  if (isRecord(node.customXml)) {
    const wrap = el("div", "region");
    wrap.append(...renderBlocks(Array.isArray(node.customXml.children) ? node.customXml.children : []));
    return wrap;
  }
  if (isRecord(node.textbox)) {
    const wrap = el("div", "region");
    wrap.append(el("p", "region-label", "Text box"));
    wrap.append(...renderBlocks(Array.isArray(node.textbox.children) ? node.textbox.children : []));
    return wrap;
  }
  if ("altChunk" in node) {
    const text = altChunkText(node.altChunk);
    return el("p", "block", text || inlineText(node.altChunk));
  }
  if (isRecord(node.toc)) return el("p", "marker", "Table of contents");
  if ("subDoc" in node) return el("p", "marker", "Subdocument");
  if (typeof node.rawXml === "string") {
    const text = node.rawXml.replace(/<[^>]+>/g, "");
    return text.trim() ? el("p", "block", text) : null;
  }
  return null;
}

function renderBlocks(nodes: unknown[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const node of nodes) {
    const rendered = renderBlock(node);
    if (rendered) out.push(rendered);
  }
  return out;
}

function renderRegion(title: string, nodes: unknown[] | undefined): HTMLElement | null {
  if (!nodes?.length) return null;
  const wrap = el("div", "region");
  wrap.append(el("p", "region-label", title));
  wrap.append(...renderBlocks(nodes));
  return wrap;
}

export function renderOutline(doc: Json, root: HTMLElement): void {
  root.replaceChildren();
  const title = typeof doc.title === "string" && doc.title ? doc.title : "Document";
  root.append(el("h1", "doc-title", title));
  const meta = [doc.creator, doc.subject].filter((part) => typeof part === "string").join(" — ");
  if (meta) root.append(el("p", "doc-meta", meta));
  if (typeof doc.description === "string" && doc.description) {
    root.append(el("p", "doc-meta", doc.description));
  }

  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  sections.forEach((section, index) => {
    root.append(el("p", "section-label", `Section ${index + 1}`));
    if (!isRecord(section)) return;
    root.append(...renderBlocks(Array.isArray(section.children) ? section.children : []));
    const headers = isRecord(section.headers) ? section.headers : {};
    const footers = isRecord(section.footers) ? section.footers : {};
    for (const [name, nodes] of Object.entries(headers)) {
      if (name === "partNames" || !Array.isArray(nodes)) continue;
      const region = renderRegion(`Header (${name})`, nodes);
      if (region) root.append(region);
    }
    for (const [name, nodes] of Object.entries(footers)) {
      if (name === "partNames" || !Array.isArray(nodes)) continue;
      const region = renderRegion(`Footer (${name})`, nodes);
      if (region) root.append(region);
    }
  });

  for (const [label, key] of [
    ["Footnotes", "footnotes"],
    ["Endnotes", "endnotes"],
    ["Comments", "comments"],
  ] as const) {
    const items = doc[key];
    if (!Array.isArray(items) || items.length === 0) continue;
    root.append(el("p", "section-label", label));
    for (const item of items) {
      if (isRecord(item) && Array.isArray(item.children)) root.append(...renderBlocks(item.children));
    }
  }
}

function summarize(value: unknown): string {
  if (value instanceof Uint8Array) return `Uint8Array(${value.byteLength})`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return String(value);
  return "";
}

function renderJsonNode(value: unknown, key: string | null, depth: number): HTMLElement {
  if (Array.isArray(value)) {
    const details = DOC.createElement("details");
    if (depth < 2 || key === "sections" || key === "children" || key === "rows") details.open = true;
    details.append(el("summary", undefined, `${key ?? "array"} [${value.length}]`));
    const body = el("div");
    body.style.marginLeft = "12px";
    value.forEach((item, index) => body.append(renderJsonNode(item, String(index), depth + 1)));
    details.append(body);
    return details;
  }

  if (isRecord(value)) {
    const details = DOC.createElement("details");
    const keys = Object.keys(value);
    const interesting = key === "sections" || key === "paragraph" || key === "0" || depth < 1;
    if (interesting) details.open = true;
    details.append(el("summary", undefined, `${key ?? "object"} {${keys.length}}`));
    const body = el("div");
    body.style.marginLeft = "12px";
    for (const childKey of keys) body.append(renderJsonNode(value[childKey], childKey, depth + 1));
    details.append(body);
    return details;
  }

  const label = key == null ? summarize(value) : `${key}: ${summarize(value)}`;
  return el("p", "json-leaf", label);
}

/* ---------- the route ---------- */

export const CSS = String.raw`:root {
  color-scheme: light;
  --ink: #1a1a1a;
  --muted: #5c564e;
  --line: #d9d3c8;
  --paper: #f7f4ee;
  --sheet: #fffdf9;
  --toolbar: #242220;
  --toolbar-ink: #f6f3ee;
  --accent: #8c3a2f;
  font-family: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
}

body {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
}

.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 12px;
  background: var(--toolbar);
  color: var(--toolbar-ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.label {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.status {
  margin: 0;
  flex: 1;
  font-size: 13px;
  color: #d8d2c8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  color: var(--toolbar);
  background: #f3e6d4;
  border: 0;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.panes {
  flex: 1;
  min-height: 0;
  display: flex;
}

.pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 22px 48px;
}

.outline {
  flex: 1.15;
  background: var(--sheet);
  border-right: 1px solid var(--line);
}

.json {
  flex: 0.85;
  background: #f3efe7;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

h1, h2, h3, h4, p, ul {
  margin: 0;
}

.doc-title {
  font-size: 28px;
  line-height: 1.2;
  margin-bottom: 6px;
}

.doc-meta {
  color: var(--muted);
  font-size: 14px;
  margin-bottom: 18px;
}

.section-label,
.region-label {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 22px 0 8px;
}

.region {
  margin: 8px 0 16px;
  padding-left: 10px;
  border-left: 2px solid var(--line);
}

p.block {
  font-size: 17px;
  line-height: 1.45;
  margin: 0 0 10px;
  white-space: pre-wrap;
}

h2.block, h3.block, h4.block {
  line-height: 1.25;
  margin: 16px 0 8px;
  white-space: pre-wrap;
}

h2.block { font-size: 22px; }
h3.block { font-size: 19px; }
h4.block { font-size: 17px; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 14px;
  font-size: 15px;
}

th, td {
  border: 1px solid var(--line);
  padding: 6px 8px;
  vertical-align: top;
  white-space: pre-wrap;
}

.marker {
  color: var(--muted);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  margin: 0 0 10px;
}

.json h2 {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 10px;
}

details {
  margin: 0 0 2px 0;
}

summary {
  cursor: pointer;
  font-size: 12px;
  line-height: 1.45;
}

.json-leaf {
  margin: 0 0 2px 16px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.error {
  color: #8c1d13;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

@media (max-width: 800px) {
  .toolbar { flex-wrap: wrap; }
  .status { flex-basis: 100%; order: 3; }
  /* One column that scrolls as a page: the outline in full, then the JSON tree. */
  body { height: auto; min-height: 100dvh; overflow: visible; }
  .toolbar { position: sticky; top: 0; z-index: 1; }
  .panes { flex-direction: column; }
  .pane { overflow: visible; }
  .outline { border-right: 0; border-bottom: 1px solid var(--line); }
  .doc-title { font-size: 22px; }
  p.block { font-size: 16px; }
}

/* The demo's body is a fixed-height column for panes that scroll on their own; this page has none, so it scrolls as a page. */
body{margin:0;background:#f2efe7;display:block;height:auto;min-height:100dvh;overflow:visible}main.oo-page{max-width:820px;margin:24px auto;padding:32px 40px;background:#fffdf7;box-shadow:0 1px 3px rgba(16,24,40,.12)}
@media(max-width:700px){main.oo-page{margin:0;padding:20px}}`;

export async function officeOpenHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  const parsed = await parseDocument(bytes);
  const { document } = parseHTML("<!DOCTYPE html><html><body><div id='outline' class='outline'></div></body></html>");
  DOC = document;
  // deno-lint-ignore no-explicit-any
  const root: any = document.getElementById("outline");
  renderOutline(parsed as unknown as Json, root);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>office-open · parsed on the server</title>
<style>${CSS}</style></head><body><main class="oo-page">${root.outerHTML}</main></body></html>`;
  return {
    html,
    initMs: 0,
    renderMs: Math.round(performance.now() - t0),
    unpainted: ["layout and pages (the library has no renderer: this is an outline of its parse)"],
  };
}
