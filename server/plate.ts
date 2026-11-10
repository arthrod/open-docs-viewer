/**
 * Plate, rendered on this server with Plate's own static renderer
 * (`platejs/static`: createStaticEditor + serializeHtml, which runs
 * react-dom/server). Documented for SSR/RSC: https://platejs.org/docs/static
 *
 * The document goes in the same way it does in the browser adapter
 * (open-docs editors/plate/docx.ts): mammoth turns the .docx into HTML and a
 * short walker turns that HTML into Plate nodes. The browser uses the page's
 * DOMParser; here linkedom parses it. Plate is not a paginated engine, so the
 * output is one Word-proportioned page of flowing HTML, styled with the same
 * CSS the open-docs Plate page uses.
 */
import React from "npm:react@18.2.0";
import "npm:react-dom@18.2.0";
import { createStaticEditor, serializeHtml, SlateElement } from "npm:platejs@53.5.2/static";
import { BaseParagraphPlugin } from "npm:platejs@53.5.2";
import * as B from "npm:@platejs/basic-nodes@53.0.0";
import * as S from "npm:@platejs/basic-styles@53.0.0";
import * as Lk from "npm:@platejs/link@53.3.5";
import * as CB from "npm:@platejs/code-block@53.0.0";
import * as T from "npm:@platejs/table@53.0.9";
import * as L from "npm:@platejs/list@53.3.13";
import * as M from "npm:@platejs/media@53.1.4";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { parseHTML } from "npm:linkedom@0.18.12";

// deno-lint-ignore no-explicit-any
type Any = any;
const h = React.createElement;

/* ---------- .docx → Plate nodes (the browser adapter's walker, DOM-agnostic) ---------- */

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  ...[1, 2, 3, 4, 5, 6].map((n) => `p[style-name='heading ${n}'] => h${n}:fresh`),
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Code'] => pre:separator('\\n')",
  "r[style-name='Code Char'] => code",
];

const isList = (el: Any) => el.tagName === "UL" || el.tagName === "OL";
const childLists = (li: Any) => Array.from(li.children as Any[]).filter(isList);

/**
 * mammoth builds its promise class with `x.__proto__ = ...`, when it loads
 * and on every call. Deno's Object.prototype.__proto__ ignores writes (its
 * --unsafe-proto flag restores them; Val Town takes no flags), so mammoth's
 * API throws "ExternalPromise.resolve is not a function". This puts back the
 * standard accessor, as the flag would, for this isolate, before mammoth is
 * first imported. Nothing else on this server writes __proto__.
 */
let mammothMod: Promise<Any> | undefined;
function loadMammoth() {
  if (!mammothMod) {
    Object.defineProperty(Object.prototype, "__proto__", {
      configurable: true,
      get(this: object) {
        return Object.getPrototypeOf(this);
      },
      set(this: object, proto: object | null) {
        if (proto === null || typeof proto === "object" || typeof proto === "function") Object.setPrototypeOf(this, proto);
      },
    });
  }
  // The browser build, as the open-docs adapter uses (it takes an ArrayBuffer).
  mammothMod ??= import("https://esm.sh/mammoth@1.13.0?target=es2022").then((m: Any) => m.default ?? m).catch((e) => {
    mammothMod = undefined; // retried on the next request
    throw e;
  });
  return mammothMod;
}
export { loadMammoth };

/** Links keep only schemes a viewer should follow; anything else (javascript:, data:, ...) is dropped. */
export function safeUrl(u: unknown): string | undefined {
  if (typeof u !== "string") return undefined;
  const t = u.trim();
  if (t.startsWith("#")) return t;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(t).protocol) ? t : undefined;
  } catch {
    return undefined; // relative or malformed: nothing to resolve it against
  }
}

/**
 * mammoth inlines each picture as a data: URL but drops its size, so take the
 * size Word displays (wp:extent, in EMU) and its paragraph's alignment from
 * document.xml: one per DrawingML picture, in document order — the order
 * mammoth emits <img>s. Returns null when the counts disagree (then pictures
 * fall back to fit-width, left-aligned).
 */
type Picture = { width: number; align?: "center" | "right" };
function pictureLayout(bytes: Uint8Array, expected: number): Picture[] | null {
  const file = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" })["word/document.xml"];
  if (!file) return null;
  const xml = strFromU8(file);
  const pics = [...xml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)]
    .filter((d) => d[0].includes("<pic:pic"))
    .map((d) => {
      const width = Number(/<wp:extent cx="(\d+)"/.exec(d[0])?.[1] ?? 0) / 9525; // EMU → CSS px
      const pStart = Math.max(xml.lastIndexOf("<w:p>", d.index), xml.lastIndexOf("<w:p ", d.index));
      const jc = /<w:jc w:val="(\w+)"/.exec(xml.slice(pStart, d.index).split("</w:pPr>")[0])?.[1];
      return { width, align: jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : undefined } as Picture;
    });
  return pics.length === expected ? pics : null;
}

export async function docxToNodes(bytes: Uint8Array): Promise<{ nodes: Any[]; dropped: number }> {
  const mammoth = await loadMammoth();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: bytes.slice().buffer } as Any, { styleMap: STYLE_MAP });
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const root: Any = document.body;
  const nodes: Any[] = [];
  // Pictures become Plate image nodes (block voids). One inside a list item
  // cannot become a block there without breaking the list; those are counted.
  const imgs = Array.from<Any>(root.querySelectorAll("img"));
  const layout = imgs.length ? pictureLayout(bytes, imgs.length) : null;
  let emitted = 0;
  const imageNode = (img: Any) => {
    const url = img.getAttribute("src") ?? "";
    if (!/^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/.test(url)) return null;
    emitted++;
    const pic = layout?.[imgs.indexOf(img)];
    return { type: "img", url, ...(pic?.width ? { width: Math.round(pic.width) } : {}), ...(pic?.align ? { align: pic.align } : {}), ...(img.getAttribute("alt") ? { alt: img.getAttribute("alt") } : {}), children: [{ text: "" }] };
  };
  /** A paragraph-like element: its text as `type`, then its pictures as image blocks. */
  const blocks = (el: Any, type: string): Any[] => {
    const pics = Array.from<Any>(el.querySelectorAll("img")).map(imageNode).filter(Boolean);
    const text = leaves(el);
    const hasText = text.some((l: Any) => l.type || (l.text ?? "").trim());
    return hasText || !pics.length ? [{ type, children: text.length ? text : [{ text: "" }] }, ...pics] : pics;
  };

  const leaves = (el: Any, marks: Record<string, unknown> = {}): Any[] => {
    const out: Any[] = [];
    for (const n of Array.from(el.childNodes as Any[])) {
      if (n.nodeType === 3) {
        if (n.textContent) out.push({ text: n.textContent, ...marks });
        continue;
      }
      if (n.nodeType !== 1 || isList(n)) continue;
      const t = n.tagName;
      const next: Record<string, unknown> = { ...marks };
      if (t === "STRONG" || t === "B") next.bold = true;
      if (t === "EM" || t === "I") next.italic = true;
      if (t === "U") next.underline = true;
      if (t === "S" || t === "DEL") next.strikethrough = true;
      if (t === "CODE") next.code = true;
      if (t === "SUP") next.superscript = true;
      if (t === "SUB") next.subscript = true;
      if (t === "BR") out.push({ text: "\n", ...marks });
      else if (t === "A" && safeUrl(n.getAttribute("href"))) {
        const inner = leaves(n, next);
        out.push({ type: "a", url: safeUrl(n.getAttribute("href")), children: inner.length ? inner : [{ text: "" }] });
      } else out.push(...leaves(n, next));
    }
    return out;
  };
  const kids = (el: Any) => {
    const l = leaves(el);
    return l.length ? l : [{ text: "" }];
  };
  const listItems = (list: Any, depth: number, into: Any[]) => {
    const style = list.tagName === "OL" ? "decimal" : "disc";
    for (const li of Array.from(list.children as Any[])) {
      into.push({ type: "p", listStyleType: style, indent: depth, children: kids(li) });
      for (const sub of childLists(li)) listItems(sub, depth + 1, into);
    }
  };

  for (const el of Array.from(root.children as Any[])) {
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) nodes.push(...blocks(el, `h${t[1]}`));
    else if (isList(el)) listItems(el, 1, nodes);
    else if (t === "BLOCKQUOTE") nodes.push({ type: "blockquote", children: kids(el) });
    else if (t === "PRE") {
      nodes.push({
        type: "code_block",
        children: (el.textContent ?? "").split("\n").map((line: string) => ({ type: "code_line", children: [{ text: line }] })),
      });
    } else if (t === "TABLE") {
      const cell = (c: Any) => {
        const children: Any[] = [];
        for (const k of Array.from(c.children as Any[])) {
          if (isList(k)) listItems(k, 1, children);
          else children.push(...blocks(k, "p"));
        }
        if (!children.length) children.push(...blocks(c, "p"));
        const span = Number(c.getAttribute("colspan")) || 1;
        return { type: c.tagName === "TH" ? "th" : "td", ...(span > 1 ? { colSpan: span } : {}), children };
      };
      nodes.push({
        type: "table",
        children: Array.from<Any>(el.querySelectorAll("tr")).filter((tr) => tr.closest("table") === el).map((tr) => ({ type: "tr", children: Array.from(tr.children as Any[]).map(cell) })),
      });
    } else nodes.push(...blocks(el, "p"));
  }
  numberLists(nodes);
  return { nodes: nodes.length ? nodes : [{ type: "p", children: [{ text: "" }] }], dropped: imgs.length - emitted };
}

/**
 * Plate's list normalizer gives each numbered item its `listStart`; a static
 * editor never normalizes, so count here: per indent level, consecutive
 * items of one style continue, a shallower item restarts the deeper levels,
 * anything that is not a list item ends them all.
 */
function numberLists(nodes: Any[]) {
  let counters: Record<number, { style: string; n: number }> = {};
  for (const n of nodes) {
    if (!n.listStyleType) {
      counters = {};
      continue;
    }
    const d = n.indent ?? 1;
    for (const k of Object.keys(counters)) if (+k > d) delete counters[+k];
    const c = counters[d];
    counters[d] = c && c.style === n.listStyleType ? { style: c.style, n: c.n + 1 } : { style: n.listStyleType, n: 1 };
    n.listStart = counters[d].n;
  }
}

/* ---------- static components: the browser adapter's, without editing ---------- */

const Paragraph = (p: Any) => {
  const t = p.element.listStyleType;
  return h(SlateElement, { ...p, as: t ? "div" : "p", className: t ? `pl-li pl-li-${t} pl-indent-${Math.min(p.element.indent ?? 1, 4)}` : undefined }, p.children);
};
const Link = (p: Any) => h(SlateElement, { ...p, as: "a", attributes: { ...p.attributes, href: safeUrl(p.element.url), title: p.element.url } }, p.children);
const Table = (p: Any) => h(SlateElement, { ...p, as: "table", className: "pl-table" }, h("tbody", null, p.children));
const Row = (p: Any) => h(SlateElement, { ...p, as: "tr" }, p.children);
const spanned = (p: Any) => ({ ...p.attributes, colSpan: p.element.colSpan, rowSpan: p.element.rowSpan });
const Cell = (p: Any) => h(SlateElement, { ...p, as: "td", attributes: spanned(p) }, p.children);
const HeaderCell = (p: Any) => h(SlateElement, { ...p, as: "th", attributes: spanned(p) }, p.children);
/** A picture at the size Word shows it, never wider than the page. */
const Image = (p: Any) =>
  h(
    SlateElement,
    { ...p, as: "figure", className: "pl-img", attributes: { ...p.attributes, style: { margin: "0.5em 0" } } },
    h("img", {
      src: p.element.url,
      alt: p.element.alt ?? "",
      width: p.element.width,
      style: { maxWidth: "100%", height: "auto", display: "block", marginLeft: p.element.align ? "auto" : 0, marginRight: p.element.align === "center" ? "auto" : 0 },
    }),
    p.children,
  );
const as = (tag: string) => (p: Any) => h(SlateElement, { ...p, as: tag }, p.children);

/**
 * Plate's static list wrapper (its BlockListStatic): an indent-list item is
 * a paragraph; this wraps it in <ul>/<ol start><li> with the item's style.
 */
const BULLETS = new Set(["disc", "circle", "square"]);
const BlockListStatic = (props: Any) => {
  if (!props.element.listStyleType) return;
  return (p: Any) => {
    const { listStyleType, listStart } = p.element;
    const ordered = !BULLETS.has(listStyleType);
    return h(ordered ? "ol" : "ul", { style: { listStyleType, margin: 0, padding: 0 }, start: ordered ? listStart : undefined }, h("li", null, p.children));
  };
};

const STYLE_TARGETS = { inject: { targetPlugins: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"] } };

const PLUGINS: Any[] = [
  BaseParagraphPlugin.withComponent(Paragraph),
  L.BaseListPlugin.configure({ render: { belowNodes: BlockListStatic } }),
  B.BaseH1Plugin.withComponent(as("h1")),
  B.BaseH2Plugin.withComponent(as("h2")),
  B.BaseH3Plugin.withComponent(as("h3")),
  B.BaseH4Plugin.withComponent(as("h4")),
  B.BaseH5Plugin.withComponent(as("h5")),
  B.BaseH6Plugin.withComponent(as("h6")),
  B.BaseBlockquotePlugin.withComponent(as("blockquote")),
  B.BaseHorizontalRulePlugin,
  B.BaseBoldPlugin,
  B.BaseItalicPlugin,
  B.BaseUnderlinePlugin,
  B.BaseStrikethroughPlugin,
  B.BaseCodePlugin,
  B.BaseHighlightPlugin,
  B.BaseSubscriptPlugin,
  B.BaseSuperscriptPlugin,
  S.BaseFontColorPlugin,
  S.BaseFontBackgroundColorPlugin,
  S.BaseFontSizePlugin,
  S.BaseFontFamilyPlugin,
  S.BaseTextAlignPlugin?.configure(STYLE_TARGETS),
  S.BaseLineHeightPlugin?.configure(STYLE_TARGETS),
  Lk.BaseLinkPlugin.withComponent(Link),
  CB.BaseCodeBlockPlugin.withComponent(as("pre")),
  CB.BaseCodeLinePlugin.withComponent(as("div")),
  M.BaseImagePlugin.withComponent(Image),
  T.BaseTablePlugin.withComponent(Table),
  T.BaseTableRowPlugin.withComponent(Row),
  T.BaseTableCellPlugin.withComponent(Cell),
  T.BaseTableCellHeaderPlugin.withComponent(HeaderCell),
].filter(Boolean);

/** The open-docs Plate page's CSS (its shell head), minus the toolbar. */
export async function plateHtml(bytes: Uint8Array, pageCss: string) {
  // mammoth's import is engine start-up, timed as init like the other engines' modules.
  const t0 = performance.now();
  await loadMammoth();
  const t1 = performance.now();
  const { nodes: value, dropped } = await docxToNodes(bytes);
  const editor = createStaticEditor({ plugins: PLUGINS, value });
  const body = await serializeHtml(editor, {
    props: { className: "pl-content" } as Any,
    stripDataAttributes: true,
    preserveClassNames: ["pl-", "slate-"],
  });
  const page = body.replace(/ data-slate-url="[^"]*"/g, "");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Plate · server-rendered</title>
${pageCss}
<style>html,body{margin:0;height:100%}body{background:#eef1f5}.pl-scroll{height:100%;box-sizing:border-box}</style>
</head><body><div class="pl-scroll"><div class="pl-page">${page}</div></div></body></html>`;
  return {
    html,
    initMs: Math.round(t1 - t0),
    renderMs: Math.round(performance.now() - t1),
    ...(dropped ? { unpainted: [`${dropped} picture${dropped > 1 ? "s" : ""} in list items`] } : {}),
  };
}
