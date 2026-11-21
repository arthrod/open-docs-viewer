/**
 * A canvas that writes SVG: the part of `CanvasRenderingContext2D` a page
 * painter calls, with every call written out as an SVG element instead of
 * pixels. There is no canvas on this server (Deno, no DOM), and an engine whose
 * only painter draws on one (BetterOffice, server/betteroffice.ts) can still
 * paint here: the painter is the engine's, the surface it paints on is this.
 *
 * What a call becomes:
 *   fillRect, strokeRect            <rect>
 *   beginPath … fill / stroke       <path>, its points in page coordinates
 *                                   (a canvas transforms each point as it is added)
 *   fill(path) / stroke(path)       the path once in <defs>, a <use> per call
 *                                   (a glyph outline is defined once per page)
 *   clip                            <clipPath>; a clip inside a clip refers to it
 *   fillText, strokeText            the glyphs' outlines when the caller can give them
 *                                   (`outlineText`), else <text> in the font the
 *                                   canvas font names, which the reader must have
 *   drawImage                       <image>, or the cropped part of one
 *   gradients, shadows              <linearGradient>/<radialGradient>, <filter>
 *
 * Everything written comes from an untrusted document. Text and attribute
 * values are escaped and stripped of characters XML forbids; a colour that is
 * not a plain colour is black; an image is an inline raster picture or
 * nothing; a number that is not finite draws nothing.
 */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** A coordinate or length: three decimals. */
const n3 = (v: number) => String(+v.toFixed(3));
/** A matrix factor: six decimals (a glyph is scaled from 2048 units to a few pixels). */
const n6 = (v: number) => String(+v.toFixed(6));
const finite = (...v: number[]) => v.every(Number.isFinite);

/** Text for XML: escaped, and without the characters XML 1.0 does not allow (one would make the file unreadable). */
export const xml = (s: string) =>
  String(s)
    .replace(/[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** A CSS colour as the engine writes them (#hex, rgb(), rgba(), a name), or black. */
const colour = (s: unknown) => (typeof s === "string" && /^[#\w(),.%\s/-]{1,80}$/.test(s) && !/url\s*\(/i.test(s) ? s.trim() : "#000000");

/** The only pictures drawn: inline raster ones. */
const RASTER = /^data:image\/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/]+=*$/;

/**
 * The pixel size of an inline raster picture (PNG, JPEG, GIF, WebP, BMP), read
 * from its header; 0 × 0 when it cannot be told. A crop is a fraction of this.
 */
export function imageSize(href: string): { width: number; height: number } {
  const none = { width: 0, height: 0 };
  const m = /^data:image\/(png|jpeg|gif|webp|bmp);base64,/.exec(href);
  if (!m) return none;
  let bin: string;
  try {
    // A JPEG's size sits after its metadata: the first 256 KB is read, in whole groups of four characters.
    bin = atob(href.slice(m[0].length, m[0].length + 349_528).replace(/=+$/, "").replace(/^(.*?)(.{0,3})$/s, (_, a, r) => (((a.length + r.length) % 4) === 1 ? a : a + r)));
  } catch {
    return none;
  }
  const b = (i: number) => bin.charCodeAt(i);
  const be16 = (i: number) => (b(i) << 8) | b(i + 1), le16 = (i: number) => b(i) | (b(i + 1) << 8);
  const be32 = (i: number) => ((b(i) << 24) | (b(i + 1) << 16) | (b(i + 2) << 8) | b(i + 3)) >>> 0, le32 = (i: number) => (b(i) | (b(i + 1) << 8) | (b(i + 2) << 16) | (b(i + 3) << 24)) >>> 0;
  const size = (width: number, height: number) => (width > 0 && height > 0 && width < 1e6 && height < 1e6 ? { width, height } : none);
  if (m[1] === "png") return bin.length >= 24 && bin.startsWith("\x89PNG") ? size(be32(16), be32(20)) : none;
  if (m[1] === "gif") return bin.length >= 10 && bin.startsWith("GIF8") ? size(le16(6), le16(8)) : none;
  if (m[1] === "bmp") return bin.length >= 26 && bin.startsWith("BM") ? size(le32(18), Math.abs(le32(22) | 0)) : none;
  if (m[1] === "webp") {
    if (bin.length < 30 || !bin.startsWith("RIFF") || bin.slice(8, 12) !== "WEBP") return none;
    const kind = bin.slice(12, 16);
    if (kind === "VP8X") return size(1 + (b(24) | (b(25) << 8) | (b(26) << 16)), 1 + (b(27) | (b(28) << 8) | (b(29) << 16)));
    if (kind === "VP8 ") return size(le16(26) & 0x3fff, le16(28) & 0x3fff);
    if (kind === "VP8L") return size(1 + (le32(21) & 0x3fff), 1 + ((le32(21) >> 14) & 0x3fff));
    return none;
  }
  // JPEG: segments, each a marker and a length, until a frame header (SOF), which holds height then width.
  if (b(0) !== 0xff || b(1) !== 0xd8) return none;
  for (let i = 2; i + 9 < bin.length;) {
    if (b(i) !== 0xff) return none;
    const marker = b(i + 1);
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return size(be16(i + 7), be16(i + 5));
    i += 2 + be16(i + 2);
  }
  return none;
}

/** An arc of an ellipse as cubic curves: `[x1, y1, x2, y2, x, y]` each, after the start point. */
function arcCurves(cx: number, cy: number, rx: number, ry: number, rotation: number, a0: number, a1: number, ccw: boolean) {
  let sweep = a1 - a0;
  const turn = 2 * Math.PI;
  if (!ccw && sweep < 0) sweep = (sweep % turn) + turn;
  if (ccw && sweep > 0) sweep = (sweep % turn) - turn;
  sweep = Math.max(-turn, Math.min(turn, sweep));
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / steps, k = (4 / 3) * Math.tan(step / 4);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const at = (ux: number, uy: number): [number, number] => [cx + rx * ux * cos - ry * uy * sin, cy + rx * ux * sin + ry * uy * cos];
  const curves: number[][] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + i * step, t1 = t0 + step;
    curves.push([...at(Math.cos(t0) - k * Math.sin(t0), Math.sin(t0) + k * Math.cos(t0)), ...at(Math.cos(t1) + k * Math.sin(t1), Math.sin(t1) - k * Math.cos(t1)), ...at(Math.cos(t1), Math.sin(t1))]);
  }
  return { start: at(Math.cos(a0), Math.sin(a0)), curves };
}

/** Path building shared by the canvas's current path and a path object; `m` maps each point as it is added. */
class PathData {
  d = "";
  /** A coordinate that was not a finite number: the path draws nothing. */
  bad = false;
  protected open = false;
  protected m: () => Matrix = () => IDENTITY;
  private p(x: number, y: number) {
    if (!finite(x, y)) this.bad = true;
    const [a, b, c, d, e, f] = this.m();
    return `${n3(a * x + c * y + e)} ${n3(b * x + d * y + f)}`;
  }
  moveTo(x: number, y: number) {
    this.d += `M${this.p(x, y)}`;
    this.open = true;
  }
  lineTo(x: number, y: number) {
    this.d += `${this.open ? "L" : "M"}${this.p(x, y)}`;
    this.open = true;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.open) this.moveTo(cx, cy);
    this.d += `Q${this.p(cx, cy)} ${this.p(x, y)}`;
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.open) this.moveTo(c1x, c1y);
    this.d += `C${this.p(c1x, c1y)} ${this.p(c2x, c2y)} ${this.p(x, y)}`;
  }
  closePath() {
    if (this.open) this.d += "Z";
  }
  rect(x: number, y: number, w: number, h: number) {
    this.d += `M${this.p(x, y)}L${this.p(x + w, y)}L${this.p(x + w, y + h)}L${this.p(x, y + h)}Z`;
    this.open = true;
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, a0: number, a1: number, ccw = false) {
    if (!finite(x, y, rx, ry, rotation, a0, a1) || rx < 0 || ry < 0) {
      this.bad = true;
      return;
    }
    const { start, curves } = arcCurves(x, y, rx, ry, rotation, a0, a1, ccw);
    this.lineTo(start[0], start[1]); // joined to the path so far by a line, as a canvas does
    for (const [x1, y1, x2, y2, ex, ey] of curves) this.bezierCurveTo(x1, y1, x2, y2, ex, ey);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
}

/** A path of its own (what `new Path2D()` gives a painter): defined once, drawn wherever it is filled. */
export class SvgPath extends PathData {}

class Gradient {
  stops: [number, string][] = [];
  constructor(readonly kind: "linear" | "radial", readonly at: number[]) {}
  addColorStop(offset: number, c: string) {
    if (finite(offset)) this.stops.push([Math.max(0, Math.min(1, offset)), colour(c)]);
  }
}

/** What a painter hands `drawImage`: an inline picture and its pixel size (`imageSize`). */
export interface SvgImage {
  href: string;
  width: number;
  height: number;
}

/** A canvas font, taken apart. */
export interface CanvasFont {
  /** The CSS family list, as written. */
  family: string;
  /** In pixels. */
  size: number;
  bold: boolean;
  italic: boolean;
  smallCaps: boolean;
}
/** One glyph of outlined text: its outline in font units (y up; null for a space) and its advance in font units. */
export interface OutlinedGlyph {
  path: SvgPath | null;
  advance: number;
  /** Drawn at this fraction of the font size (a small capital). */
  scale?: number;
}
/** The glyphs of `text` in `font`, in the order they are drawn from left to right, or null when they cannot all be given. */
export type OutlineText = (text: string, font: CanvasFont) => { unitsPerEm: number; glyphs: OutlinedGlyph[] } | null;

interface State {
  m: Matrix;
  /** The id of the clip in force. */
  clipId: string | null;
  globalAlpha: number;
  fillStyle: string | Gradient;
  strokeStyle: string | Gradient;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  dash: number[];
  font: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
  letterSpacing: string;
  wordSpacing: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  filter: string;
}

/** The CSS filters an image may carry: the functions and nothing else. */
// Whitespace once before the first function and after each: a space between two functions has one reading, so a non-matching value fails in linear time.
const CSS_FILTER = /^\s*(?:(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)\(-?\d+(?:\.\d+)?(?:px|deg|%)?\)\s*)+$/;
const FONT = /^\s*((?:(?:italic|oblique|small-caps|normal|bold|bolder|lighter|\d{1,4})\s+)*)(\d*\.?\d+)px(?:\/\S+)?\s+(.+)$/s;

export class SvgCanvas implements State {
  m: Matrix = IDENTITY;
  clipId: string | null = null;
  globalAlpha = 1;
  fillStyle: string | Gradient = "#000000";
  strokeStyle: string | Gradient = "#000000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  miterLimit = 10;
  dash: number[] = [];
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";
  direction = "ltr";
  letterSpacing = "0px";
  wordSpacing = "0px";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  filter = "none";

  private saved: State[] = [];
  private path: PathData;
  private defs: string[] = [];
  private body: string[] = [];
  /** The clip of the group now open in `body`. */
  private openClip: string | null = null;
  private ids = { p: 0, c: 0, g: 0, s: 0 };
  private pathIds = new Map<SvgPath, string>();
  private gradientIds = new Map<Gradient, Map<string, string>>();
  private shadowIds = new Map<string, string>();

  constructor(readonly width: number, readonly height: number, private outlineText?: OutlineText) {
    this.path = this.newPath();
  }
  private newPath() {
    const p = new PathData();
    (p as unknown as { m: () => Matrix }).m = () => this.m;
    return p;
  }

  // State.
  private state(): State {
    const { m, clipId, globalAlpha, fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, miterLimit, dash, font, textAlign, textBaseline, direction, letterSpacing, wordSpacing, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, filter } = this;
    return { m, clipId, globalAlpha, fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, miterLimit, dash, font, textAlign, textBaseline, direction, letterSpacing, wordSpacing, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, filter };
  }
  save() {
    this.saved.push(this.state());
  }
  restore() {
    const s = this.saved.pop();
    if (s) Object.assign(this, s);
  }
  setLineDash(d: number[]) {
    this.dash = Array.isArray(d) && d.every((v) => finite(v) && v >= 0) ? [...d] : [];
  }
  getLineDash() {
    return [...this.dash];
  }

  // Transforms.
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(angle: number) {
    const c = Math.cos(angle), s = Math.sin(angle);
    this.transform(c, s, -s, c, 0, 0);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.m = [a, b, c, d, e, f];
  }
  resetTransform() {
    this.m = IDENTITY;
  }
  /** How much the transform scales a length (exact when it scales both axes alike, as a page's does). */
  private get scaleOfPen() {
    const [a, b, c, d] = this.m;
    return Math.sqrt(Math.abs(a * d - b * c));
  }
  private get identity() {
    return this.m.every((v, i) => v === IDENTITY[i]);
  }
  private matrix(m = this.m) {
    return finite(...m) ? `matrix(${n6(m[0])} ${n6(m[1])} ${n6(m[2])} ${n6(m[3])} ${n3(m[4])} ${n3(m[5])})` : null;
  }
  private transformAttr() {
    return this.identity ? "" : ` transform="${this.matrix() ?? "scale(0)"}"`;
  }

  // The current path.
  beginPath() {
    this.path = this.newPath();
  }
  moveTo(x: number, y: number) {
    this.path.moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.path.lineTo(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.path.quadraticCurveTo(cx, cy, x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this.path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  }
  closePath() {
    this.path.closePath();
  }
  rect(x: number, y: number, w: number, h: number) {
    this.path.rect(x, y, w, h);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.path.arc(x, y, r, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, a0: number, a1: number, ccw = false) {
    this.path.ellipse(x, y, rx, ry, rotation, a0, a1, ccw);
  }

  // Definitions.
  private pathId(p: SvgPath) {
    let id = this.pathIds.get(p);
    if (!id) {
      id = `p${this.ids.p++}`;
      this.pathIds.set(p, id);
      this.defs.push(`<path id="${id}" d="${p.bad ? "" : p.d}"/>`);
    }
    return id;
  }
  /** A paint: a colour, or a reference to a gradient placed by `placed` (the transform its coordinates are in). */
  private paint(style: string | Gradient, placed: Matrix | null) {
    if (!(style instanceof Gradient)) return colour(style);
    const key = placed && finite(...placed) ? this.matrix(placed)! : "";
    let byPlace = this.gradientIds.get(style);
    if (!byPlace) this.gradientIds.set(style, byPlace = new Map());
    let id = byPlace.get(key);
    if (!id) {
      id = `g${this.ids.g++}`;
      byPlace.set(key, id);
      const stops = style.stops.map(([o, c]) => `<stop offset="${n3(o)}" stop-color="${xml(c)}"/>`).join("");
      const where = key ? ` gradientTransform="${key}"` : "";
      const at = style.at.map((v) => (Number.isFinite(v) ? n3(v) : "0"));
      this.defs.push(
        style.kind === "linear"
          ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${at[0]}" y1="${at[1]}" x2="${at[2]}" y2="${at[3]}"${where}>${stops}</linearGradient>`
          : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" fx="${at[0]}" fy="${at[1]}" cx="${at[3]}" cy="${at[4]}" r="${at[5]}"${where}>${stops}</radialGradient>`,
      );
    }
    return `url(#${id})`;
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    return new Gradient("linear", [x0, y0, x1, y1]);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    return new Gradient("radial", [x0, y0, r0, x1, y1, r1]);
  }
  private shadow(): string | null {
    const { shadowColor: c, shadowBlur: blur, shadowOffsetX: dx, shadowOffsetY: dy } = this;
    if (!finite(blur, dx, dy) || (blur <= 0 && dx === 0 && dy === 0)) return null;
    if (typeof c !== "string" || c === "transparent" || /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(c)) return null;
    const key = `${n3(dx)} ${n3(dy)} ${n3(Math.max(0, blur) / 2)} ${colour(c)}`;
    let id = this.shadowIds.get(key);
    if (!id) {
      id = `s${this.ids.s++}`;
      this.shadowIds.set(key, id);
      // A canvas shadow is in page pixels whatever the transform: the filter is on a group of its own, over the page.
      this.defs.push(
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${n3(this.width)}" height="${n3(this.height)}">` +
          `<feDropShadow dx="${n3(dx)}" dy="${n3(dy)}" stdDeviation="${n3(Math.max(0, blur) / 2)}" flood-color="${xml(colour(c))}"/></filter>`,
      );
    }
    return id;
  }

  // Writing.
  private emit(element: string) {
    if (this.clipId !== this.openClip) {
      if (this.openClip) this.body.push("</g>");
      if (this.clipId) this.body.push(`<g clip-path="url(#${this.clipId})">`);
      this.openClip = this.clipId;
    }
    const shadow = this.shadow();
    this.body.push(shadow ? `<g filter="url(#${shadow})">${element}</g>` : element);
  }
  private opacity() {
    const a = Number.isFinite(this.globalAlpha) ? Math.max(0, Math.min(1, this.globalAlpha)) : 1;
    return a === 1 ? "" : ` opacity="${n3(a)}"`;
  }
  private fillAttrs(placed: Matrix | null) {
    return ` fill="${xml(this.paint(this.fillStyle, placed))}"${this.opacity()}`;
  }
  /** `pen`: how much wider the page's transform makes the line (1 when the element carries the transform itself). */
  private strokeAttrs(placed: Matrix | null, pen: number) {
    const w = Math.max(0, Number.isFinite(this.lineWidth) ? this.lineWidth : 1) * pen;
    return ` fill="none" stroke="${xml(this.paint(this.strokeStyle, placed))}" stroke-width="${n3(w)}"` +
      (this.dash.length ? ` stroke-dasharray="${this.dash.map((v) => n3(v * pen)).join(" ")}"` : "") +
      (this.lineCap === "round" || this.lineCap === "square" ? ` stroke-linecap="${this.lineCap}"` : "") +
      (this.lineJoin === "round" || this.lineJoin === "bevel" ? ` stroke-linejoin="${this.lineJoin}"` : "") +
      (this.miterLimit !== 10 && Number.isFinite(this.miterLimit) ? ` stroke-miterlimit="${n3(this.miterLimit)}"` : "") +
      this.opacity();
  }

  // Painting.
  clearRect(_x: number, _y: number, _w: number, _h: number) {} // a new page is empty
  fillRect(x: number, y: number, w: number, h: number) {
    if (!finite(x, y, w, h) || w === 0 || h === 0) return;
    this.emit(`<rect x="${n3(Math.min(x, x + w))}" y="${n3(Math.min(y, y + h))}" width="${n3(Math.abs(w))}" height="${n3(Math.abs(h))}"${this.fillAttrs(null)}${this.transformAttr()}/>`);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    if (!finite(x, y, w, h)) return;
    this.emit(`<rect x="${n3(Math.min(x, x + w))}" y="${n3(Math.min(y, y + h))}" width="${n3(Math.abs(w))}" height="${n3(Math.abs(h))}"${this.strokeAttrs(null, 1)}${this.transformAttr()}/>`);
  }
  fill(path?: SvgPath | string, rule?: string) {
    const evenodd = (typeof path === "string" ? path : rule) === "evenodd" ? ' fill-rule="evenodd"' : "";
    if (path instanceof SvgPath) {
      if (!path.bad && path.d && this.matrix()) this.emit(`<use href="#${this.pathId(path)}"${this.transformAttr()}${this.fillAttrs(null)}${evenodd}/>`);
    } else if (!this.path.bad && this.path.d) this.emit(`<path d="${this.path.d}"${this.fillAttrs(this.identity ? null : this.m)}${evenodd}/>`);
  }
  stroke(path?: SvgPath) {
    if (path instanceof SvgPath) {
      if (!path.bad && path.d && this.matrix()) this.emit(`<use href="#${this.pathId(path)}"${this.transformAttr()}${this.strokeAttrs(null, 1)}/>`);
    } else if (!this.path.bad && this.path.d) this.emit(`<path d="${this.path.d}"${this.strokeAttrs(this.identity ? null : this.m, this.scaleOfPen)}/>`);
  }
  clip(path?: SvgPath | string, rule?: string) {
    const evenodd = (typeof path === "string" ? path : rule) === "evenodd" ? ' clip-rule="evenodd"' : "";
    const id = `c${this.ids.c++}`;
    const shape = path instanceof SvgPath
      ? (path.bad || !this.matrix() ? '<path d=""/>' : `<use href="#${this.pathId(path)}"${this.transformAttr()}${evenodd}/>`)
      : `<path d="${this.path.bad ? "" : this.path.d}"${evenodd}/>`;
    this.defs.push(`<clipPath id="${id}"${this.clipId ? ` clip-path="url(#${this.clipId})"` : ""}>${shape}</clipPath>`);
    this.clipId = id;
  }

  private text(text: string, x: number, y: number, stroked: boolean) {
    if (!finite(x, y) || !text) return;
    const f = FONT.exec(this.font);
    const words = (f?.[1] ?? "").split(/\s+/);
    const weight = words.find((w) => /^(bold|bolder|lighter|\d+)$/.test(w));
    const size = parseFloat(f?.[2] ?? "10");
    const italic = words.includes("italic") || words.includes("oblique"), smallCaps = words.includes("small-caps");
    const px = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) && v !== 0 ? v : 0;
    };
    const anchor = { center: "middle", right: "end", end: "end" }[this.textAlign];
    const baseline = { middle: "central", top: "text-before-edge", hanging: "hanging", bottom: "text-after-edge", ideographic: "ideographic" }[this.textBaseline];
    // Outlines: only where a glyph's place is its advance (left to right, on the alphabetic baseline).
    const outlined = this.outlineText && this.direction !== "rtl" && !baseline && size > 0
      ? this.outlineText(text, { family: f?.[3] ?? "sans-serif", size, bold: weight === "bold" || weight === "bolder" || Number(weight) >= 600, italic, smallCaps })
      : null;
    if (outlined && outlined.unitsPerEm > 0) {
      const k = size / outlined.unitsPerEm, spacing = px(this.letterSpacing), word = px(this.wordSpacing);
      // A glyph with no outline is a space: it takes the word spacing too, as canvas text does.
      const step = (g: OutlinedGlyph) => g.advance * k * (g.scale ?? 1) + spacing + (g.path ? 0 : word);
      const width = outlined.glyphs.reduce((w, g) => w + step(g), 0);
      let at = x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
      this.save();
      this.translate(0, y);
      for (const g of outlined.glyphs) {
        const s = k * (g.scale ?? 1);
        if (g.path) {
          this.save();
          this.translate(at, 0);
          this.scale(s, -s);
          if (stroked) {
            this.lineWidth /= s; // the line's width is in page pixels
            this.stroke(g.path);
          } else this.fill(g.path);
          this.restore();
        }
        at += step(g);
      }
      this.restore();
      return;
    }
    this.emit(
      `<text x="${n3(x)}" y="${n3(y)}" font-family="${xml(f?.[3] ?? "sans-serif")}" font-size="${n3(size)}"` +
        (italic ? ' font-style="italic"' : "") +
        (smallCaps ? ' font-variant="small-caps"' : "") +
        (weight ? ` font-weight="${weight}"` : "") +
        (px(this.letterSpacing) ? ` letter-spacing="${n3(px(this.letterSpacing))}"` : "") +
        (px(this.wordSpacing) ? ` word-spacing="${n3(px(this.wordSpacing))}"` : "") +
        (anchor ? ` text-anchor="${anchor}"` : "") +
        (baseline ? ` dominant-baseline="${baseline}"` : "") +
        (this.direction === "rtl" ? ' direction="rtl"' : "") +
        `${stroked ? this.strokeAttrs(null, 1) : this.fillAttrs(null)} xml:space="preserve"${this.transformAttr()}>${xml(text)}</text>`,
    );
  }
  fillText(text: string, x: number, y: number) {
    this.text(String(text), x, y, false);
  }
  strokeText(text: string, x: number, y: number) {
    this.text(String(text), x, y, true);
  }

  /** `drawImage(image, dx, dy, dw, dh)` or `drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)`. */
  drawImage(image: SvgImage, ...at: number[]) {
    if (!image || typeof image.href !== "string" || !RASTER.test(image.href) || !finite(...at)) return;
    const css = this.filter !== "none" && this.filter.length <= 512 && CSS_FILTER.test(this.filter) ? ` style="filter:${this.filter.trim()}"` : "";
    const href = `href="${image.href}"`;
    if (at.length === 8) {
      const [sx, sy, sw, sh, dx, dy, dw, dh] = at;
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 || !(image.width > 0) || !(image.height > 0)) return;
      const cropped = `<svg x="${n3(dx)}" y="${n3(dy)}" width="${n3(dw)}" height="${n3(dh)}" viewBox="${n3(sx)} ${n3(sy)} ${n3(sw)} ${n3(sh)}" preserveAspectRatio="none"${css}>` +
        `<image ${href} width="${n3(image.width)}" height="${n3(image.height)}" preserveAspectRatio="none"/></svg>`;
      const group = this.opacity() + this.transformAttr();
      this.emit(group ? `<g${group}>${cropped}</g>` : cropped);
      return;
    }
    const [dx, dy, dw = image.width, dh = image.height] = at;
    if (at.length < 2 || !(dw > 0) || !(dh > 0)) return;
    this.emit(`<image ${href} x="${n3(dx)}" y="${n3(dy)}" width="${n3(dw)}" height="${n3(dh)}" preserveAspectRatio="none"${css}${this.opacity()}${this.transformAttr()}/>`);
  }

  /** The page as one SVG document. */
  toSvg() {
    const w = n3(this.width), h = n3(this.height);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      (this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "") +
      this.body.join("") + (this.openClip ? "</g>" : "") + "</svg>";
  }
}
