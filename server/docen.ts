/**
 * docen, rendered on this server.
 *
 *   parse    @docen/docx  parseDOCX → compileDocument (headless, no editor)
 *   project  @docen/docx/layout  projectDocumentOptions → one flow per section
 *   layout   @docen/layout  layoutFlowSections — docen's own pure-TypeScript
 *            paginator ("zero DOM"), the one its editor runs
 *   paint    this file: each page as SVG
 *
 * docen measures text through two seams. FontMetrics (line-height ratio) is a
 * documented interface; widths come from its text breaker (@docen/pretext),
 * which calls `OffscreenCanvas(...).getContext("2d").measureText`. Deno has no
 * canvas, so this module supplies a minimal one whose measureText reads real
 * advance widths from font files (opentype.js over the same metric-compatible
 * faces docx-editor.dev ships: Carlito for Calibri, Liberation for
 * Arial/Times/Courier, Caladea for Cambria).
 *
 * docen's real painter is LeaferJS on a canvas; on a server it needs a native
 * canvas (@leafer-ui/node), which Val Town cannot load. So the pages here are
 * painted by this file from docen's laid-out geometry: every text item at the
 * x and baseline docen computed, with `textLength` pinning its width to the
 * width docen measured. What docen positions is what you see; what this
 * painter does not draw yet (headers/footers, floating drawings) is listed
 * in the response's `x-unpainted` header.
 */
import opentype from "npm:opentype.js@1.3.4";

// deno-lint-ignore no-explicit-any
type Any = any;

const FONT_CDN = "https://cdn.jsdelivr.net/npm/@docx-editor.dev/fonts@2.35.0/assets/";
/** Word family (lower case) → packaged metric-compatible face. */
const SUBSTITUTE: Record<string, string> = {
  calibri: "Carlito",
  cambria: "Caladea",
  "times new roman": "LiberationSerif",
  times: "LiberationSerif",
  georgia: "LiberationSerif",
  serif: "LiberationSerif",
  arial: "LiberationSans",
  helvetica: "LiberationSans",
  "sans-serif": "LiberationSans",
  "courier new": "LiberationMono",
  courier: "LiberationMono",
  consolas: "LiberationMono",
  monospace: "LiberationMono",
};
const FACE_FILES = [...new Set(Object.values(SUBSTITUTE))];
const SUFFIX = (bold: boolean, italic: boolean) => (bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular");

/** The browser paints with the same faces, under the Word family names. */
const FONT_CSS = [
  ["Calibri", "Carlito"],
  ["Cambria", "Caladea"],
  ["Times New Roman", "LiberationSerif"],
  ["Arial", "LiberationSans"],
  ["Courier New", "LiberationMono"],
  ["Consolas", "LiberationMono"],
].flatMap(([family, file]) =>
  ([[false, false], [true, false], [false, true], [true, true]] as const).map(([b, i]) =>
    `@font-face{font-family:"${family}";src:url("${FONT_CDN}${file}-${SUFFIX(b, i)}.ttf");font-weight:${b ? 700 : 400};font-style:${i ? "italic" : "normal"};font-display:block}`
  )
).join("\n");

type Face = Any;
let facesP: Promise<Map<string, Face>> | undefined;
function loadFaces() {
  facesP ??= (async () => {
    const faces = new Map<string, Face>();
    await Promise.all(FACE_FILES.flatMap((file) =>
      ["Regular", "Bold", "Italic", "BoldItalic"].map(async (s) => {
        const res = await fetch(`${FONT_CDN}${file}-${s}.ttf`);
        if (!res.ok) throw new Error(`font ${file}-${s}: HTTP ${res.status}`);
        faces.set(`${file}-${s}`, opentype.parse(await res.arrayBuffer()));
      })
    ));
    return faces;
  })().catch((e) => {
    facesP = undefined;
    throw e;
  });
  return facesP;
}

const familiesOf = (cssFamilies: string) => cssFamilies.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase());
const faceFor = (faces: Map<string, Face>, family: string, bold: boolean, italic: boolean): Face => {
  const file = familiesOf(family).map((f) => SUBSTITUTE[f]).find(Boolean) ?? "LiberationSans";
  return faces.get(`${file}-${SUFFIX(bold, italic)}`)!;
};

/** The 2d-context subset @docen/pretext calls: `font` and `measureText`. */
function installCanvas(faces: Map<string, Face>) {
  class Context2D {
    font = "10px sans-serif";
    letterSpacing = "0px";
    measureText(text: string) {
      // CSS font shorthand, as docen's cssFontOf writes it: "[italic] [bold|700] <size>px <families>".
      const m = /^(.*?)([\d.]+)px(?:\/\S+)?\s+(.+)$/.exec(this.font);
      const size = m ? +m[2] : 10;
      const face = faceFor(faces, m?.[3] ?? "sans-serif", /\bbold\b|\b[6-9]00\b/.test(m?.[1] ?? ""), /\b(italic|oblique)\b/.test(m?.[1] ?? ""));
      const width = face.getAdvanceWidth(text, size, { kerning: false });
      const asc = (face.ascender / face.unitsPerEm) * size, desc = (-face.descender / face.unitsPerEm) * size;
      return { width, actualBoundingBoxAscent: asc, actualBoundingBoxDescent: desc, fontBoundingBoxAscent: asc, fontBoundingBoxDescent: desc, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
    }
  }
  const g = globalThis as Any;
  // Deno defines OffscreenCanvas but has no 2d context (getContext returns
  // null). Replace it only then; nothing else on this server draws on one.
  let has2d = false;
  try {
    has2d = !!g.OffscreenCanvas && !!new g.OffscreenCanvas(1, 1).getContext("2d");
  } catch { /* no usable canvas */ }
  if (!has2d) g.OffscreenCanvas = class {
    constructor(public width: number, public height: number) {}
    getContext() {
      return new Context2D();
    }
  };
}

/** docen's FontMetrics seam: Word's single-line ratio from the face's OS/2 table. */
const fontMetrics = (faces: Map<string, Face>) => ({
  normalRatio(r: { family: string; bold?: boolean; italic?: boolean }) {
    const f = faceFor(faces, r.family, !!r.bold, !!r.italic);
    const A = f.tables.os2.usWinAscent, D = f.tables.os2.usWinDescent;
    return (A + D + 2 * Math.round(0.15 * (A + D))) / f.unitsPerEm;
  },
});

/* ---------------- painter: docen's laid-out pages → SVG ---------------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 100) / 100;
const HIGHLIGHT: Record<string, string> = {
  yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF", blue: "#0000FF", red: "#FF0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000", white: "#FFFFFF",
};
const color = (hex?: string, fallback = "#000") => (hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : fallback);

function paintPages(L: Any, pages: Any[], flows: Any[], sectionOfPage: number[]) {
  const unpainted = new Set<string>();

  const edge = (out: string[], e: Any, x1: number, y1: number, x2: number, y2: number) => {
    if (!e || e.style === "none" || e.style === "nil" || !e.px) return;
    const dash = /dash|dot/.test(e.style) ? ` stroke-dasharray="${n(e.px * 3)} ${n(e.px * 2)}"` : "";
    out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color(e.color)}" stroke-width="${n(Math.max(e.px, 0.75))}"${dash}/>`);
  };

  const paragraph = (out: string[], p: Any, x0: number, y0: number, widthPx: number) => {
    const indentL = p.indent?.leftPx ?? 0, indentR = p.indent?.rightPx ?? 0;
    if (p.shadingFill) out.push(`<rect x="${n(x0 + indentL)}" y="${n(y0)}" width="${n(widthPx - indentL - indentR)}" height="${n(p.heightPx)}" fill="${color(p.shadingFill.replace("#", ""), "none")}"/>`);
    const b = p.borders ?? {};
    if (b.bottom) edge(out, b.bottom, x0 + indentL, y0 + p.heightPx + (b.bottom.spacePx ?? 0), x0 + widthPx - indentR, y0 + p.heightPx + (b.bottom.spacePx ?? 0));
    if (b.top) edge(out, b.top, x0 + indentL, y0 - (b.top.spacePx ?? 0), x0 + widthPx - indentR, y0 - (b.top.spacePx ?? 0));
    for (const line of p.lines ?? []) {
      const ox = x0 + L.lineOriginXPx(p, line);
      const baseline = y0 + line.yPx + L.lineBaselineDepthPx(line);
      // Justified lines: docen widens each inner space by justifyGapPx and
      // places run boundaries itself (their spaces are trimmed into the gap).
      const gap = line.justifyGapPx ?? 0;
      line.items.forEach((it: Any) => {
        const inl = p.inline?.[it.inlineIndex];
        if (it.kind === "picture") {
          const src = inl?.src;
          if (src && /^data:image\//.test(src)) {
            out.push(`<image href="${esc(src)}" x="${n(ox + it.xPx)}" y="${n(baseline - (inl.heightPx ?? it.heightPx ?? 0))}" width="${n(inl.widthPx ?? it.widthPx)}" height="${n(inl.heightPx ?? it.heightPx ?? 0)}" preserveAspectRatio="none"/>`);
          } else unpainted.add(inl?.members ? "metafile pictures" : "pictures without data");
          return;
        }
        if (it.kind !== "text" || !it.text) return;
        const st = inl?.style ?? {};
        const family = L.familyOfSlot(st.family ?? "Calibri", L.isCjkText(it.text));
        const size = L.vertAlignedSizePx(st);
        const shift = L.vertAlignBaselineShiftPx(st);
        const x = ox + it.xPx, y = baseline + shift;
        const innerSpaces = gap ? (it.text.trimEnd().match(/ /g)?.length ?? 0) : 0;
        const w = it.widthPx + innerSpaces * gap;
        const fill = HIGHLIGHT[st.highlight] ?? (st.shadingFill ? color(st.shadingFill.replace("#", ""), "") : "");
        if (fill) out.push(`<rect x="${n(x)}" y="${n(baseline - size * 0.9)}" width="${n(w)}" height="${n(size * 1.15)}" fill="${fill}"/>`);
        const ink = color(st.color, "#000");
        out.push(
          `<text xml:space="preserve" x="${n(x)}" y="${n(y)}" font-family="${esc(`"${family}", sans-serif`)}" font-size="${n(size)}"` +
            `${st.bold ? ' font-weight="700"' : ""}${st.italic ? ' font-style="italic"' : ""}${gap ? ` word-spacing="${n(gap)}"` : ""} fill="${ink}"` +
            `${w > 0 ? ` textLength="${n(w)}" lengthAdjust="spacing"` : ""}>${esc(it.text)}</text>`,
        );
        if (st.underline) edge(out, { style: st.underlineStyle ?? "single", px: Math.max(size / 18, 0.75), color: (st.underlineColor ?? st.color) }, x, baseline + size * 0.12, x + w, baseline + size * 0.12);
        if (st.strikethrough) edge(out, { style: "single", px: Math.max(size / 18, 0.75), color: st.color }, x, baseline - size * 0.3, x + w, baseline - size * 0.3);
      });
    }
  };

  const stack = (out: string[], items: Any[], x0: number, y0: number, widthPx: number) => {
    for (const it of items) block(out, it.block, x0, y0 + it.yPx, widthPx);
  };

  const table = (out: string[], t: Any, x0: number, y0: number) => {
    const cols: number[] = t.columnWidthsPx;
    const tx = x0 + (t.offsetXPx ?? 0);
    let y = y0;
    for (const row of t.rows ?? []) {
      let c = 0;
      for (const cell of row.cells ?? []) {
        const cx = tx + cols.slice(0, cell.gridStart ?? c).reduce((a, b) => a + b, 0);
        const cw = cols.slice(cell.gridStart ?? c, (cell.gridStart ?? c) + (cell.colspan ?? 1)).reduce((a, b) => a + b, 0);
        c = (cell.gridStart ?? c) + (cell.colspan ?? 1);
        const ch = cell.heightPx ?? row.heightPx;
        if (cell.fill && cell.fill !== "auto") out.push(`<rect x="${n(cx)}" y="${n(y)}" width="${n(cw)}" height="${n(ch)}" fill="${color(cell.fill, "none")}"/>`);
        const ins = cell.insets ?? {};
        stack(out, cell.stack ?? [], cx + (ins.left ?? 0), y + (ins.top ?? 0), cell.innerWidthPx ?? cw);
        const b = cell.borders ?? {};
        edge(out, b.top, cx, y, cx + cw, y);
        edge(out, b.bottom, cx, y + ch, cx + cw, y + ch);
        edge(out, b.left, cx, y, cx, y + ch);
        edge(out, b.right, cx + cw, y, cx + cw, y + ch);
      }
      y += row.heightPx;
    }
  };

  const block = (out: string[], b: Any, x0: number, y0: number, widthPx: number) => {
    if (!b) return;
    if (b.kind === "paragraph") paragraph(out, b, x0, y0, widthPx);
    else if (b.kind === "table") table(out, b, x0, y0);
    else if (b.kind === "group") stack(out, b.stack ?? b.items ?? [], x0, y0, widthPx);
    else if (b.kind !== "pageBreak") unpainted.add(`${b.kind} blocks`);
  };

  const svgs = pages.map((page, i) => {
    const f = flows[sectionOfPage[i] ?? 0];
    const out: string[] = [];
    stack(out, page.items ?? [], f.contentLeftPx, f.contentTopPx, f.contentWidthPx);
    if (page.footnotes) unpainted.add("footnotes");
    return `<svg class="page" xmlns="http://www.w3.org/2000/svg" width="${f.pageWidthPx}" height="${f.pageHeightPx}" viewBox="0 0 ${f.pageWidthPx} ${f.pageHeightPx}"><rect width="100%" height="100%" fill="#fff"/>${out.join("")}</svg>`;
  });
  return { svgs, unpainted: [...unpainted] };
}

let modsP: Promise<Any[]> | undefined;

export async function docenHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  const faces = await loadFaces();
  installCanvas(faces);
  modsP ??= Promise.all([import("npm:@docen/docx@0.7.0"), import("npm:@docen/docx@0.7.0/layout"), import("npm:@docen/layout@0.7.0")]).catch((e) => {
    modsP = undefined; // retried on the next request
    throw e;
  });
  const [D, DL, L] = await modsP;
  const t1 = performance.now();

  const { sections } = DL.projectDocumentOptions(D.compileDocument(await D.parseDOCX(bytes)));
  const furniture = sections.some((s: Any) => s.furniture && Object.values(s.furniture).some(Boolean));
  const flowSections = sections.map((s: Any) => ({
    blocks: s.blocks,
    ...(s.type === "continuous" ? { type: s.type } : {}),
    opts: { ...s.flow, columns: s.columns, footnoteDefinitions: s.footnoteDefinitions, endnoteDefinitions: s.endnoteDefinitions },
  }));
  const { pages, sectionOfPage } = L.layoutFlowSections(flowSections, new L.TextMeasurer(fontMetrics(faces) as Any));
  const { svgs, unpainted } = paintPages(L, pages, sections.map((s: Any) => s.flow), sectionOfPage ?? []);
  if (furniture) unpainted.push("headers and footers");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>docen · server-rendered</title>
<style>${FONT_CSS}
html,body{margin:0}body{background:#eef1f5;padding:24px 0;display:flex;flex-direction:column;align-items:center;gap:16px}
svg.page{box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.06);max-width:calc(100vw - 16px);height:auto}
svg text{white-space:pre;font-kerning:none}
</style></head><body>${svgs.join("\n")}</body></html>`;
  return { html, pages: pages.length, unpainted, initMs: Math.round(t1 - t0), renderMs: Math.round(performance.now() - t1) };
}
