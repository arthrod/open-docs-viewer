/**
 * The SVG-writing canvas (server/svg-canvas.ts): what each canvas call a
 * painter makes becomes in the SVG. No network, no engine.
 *
 *   deno test -A server/svg-canvas_test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { imageSize, SvgCanvas, SvgPath } from "./svg-canvas.ts";

/** What was drawn: the SVG without its root element, and its defs apart. */
function drawn(draw: (c: SvgCanvas) => void, w = 100, h = 50) {
  const c = new SvgCanvas(w, h);
  draw(c);
  const svg = c.toSvg();
  const defs = /<defs>(.*)<\/defs>/s.exec(svg)?.[1] ?? "";
  return { svg, defs, body: svg.replace(/^<svg[^>]*>/, "").replace(/<defs>.*<\/defs>/s, "").replace(/<\/svg>$/, "") };
}

Deno.test("the root is the page: its size in CSS pixels, a viewBox, and nothing drawn", () => {
  const { svg, body } = drawn((c) => c.clearRect(0, 0, 816, 1056), 816, 1056);
  assertEquals(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="816" height="1056" viewBox="0 0 816 1056"></svg>');
  assertEquals(body, "");
});

Deno.test("fillRect is a rect in the current fill, alpha and transform; an empty one is not drawn", () => {
  const { body } = drawn((c) => {
    c.fillStyle = "#1F3A8A";
    c.fillRect(96, 750.8434, 156, 19);
    c.fillRect(0, 0, 0, 5);
    c.save();
    c.globalAlpha = 0.4;
    c.translate(10, 20);
    c.fillRect(1, 2, 3, 4);
    c.restore();
    c.fillRect(1, 2, 3, 4);
  });
  assertEquals(
    body,
    '<rect x="96" y="750.843" width="156" height="19" fill="#1F3A8A"/>' +
      '<rect x="1" y="2" width="3" height="4" fill="#1F3A8A" opacity="0.4" transform="matrix(1 0 0 1 10 20)"/>' +
      '<rect x="1" y="2" width="3" height="4" fill="#1F3A8A"/>',
  );
});

Deno.test("a path is kept in page coordinates as it is built, stroked with the line's width, dash, cap and join", () => {
  const { body } = drawn((c) => {
    c.strokeStyle = "#4F81BD";
    c.lineWidth = 1.5;
    c.setLineDash([4, 2]);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(96, 143.651);
    c.lineTo(720, 143.651);
    c.stroke();
    c.setLineDash([]);
    c.lineCap = "butt";
    c.translate(100, 0);
    c.scale(2, 2);
    c.beginPath();
    c.moveTo(1, 1);
    c.quadraticCurveTo(2, 2, 3, 1);
    c.bezierCurveTo(4, 0, 5, 0, 6, 1);
    c.closePath();
    c.fill();
    c.stroke();
  });
  assertEquals(
    body,
    '<path d="M96 143.651L720 143.651" fill="none" stroke="#4F81BD" stroke-width="1.5" stroke-dasharray="4 2" stroke-linecap="round"/>' +
      '<path d="M102 2Q104 4 106 2C108 0 110 0 112 2Z" fill="#000000"/>' +
      // The pen is scaled with the page: twice as wide under scale(2).
      '<path d="M102 2Q104 4 106 2C108 0 110 0 112 2Z" fill="none" stroke="#4F81BD" stroke-width="3"/>',
  );
});

Deno.test("a path object (a glyph) is defined once and used wherever it is filled, with the transform of that moment", () => {
  const glyph = new SvgPath();
  glyph.moveTo(954, 274);
  glyph.quadraticCurveTo(968, 274, 980, 262);
  glyph.closePath();
  const { body, defs } = drawn((c) => {
    c.fillStyle = "#17375E";
    for (const x of [96, 114.817]) {
      c.save();
      c.translate(x, 129.008);
      c.scale(34.667 / 2048, -34.667 / 2048);
      c.fill(glyph);
      c.restore();
    }
    c.strokeStyle = "red";
    c.lineWidth = 30;
    c.translate(5, 5);
    c.stroke(glyph);
  });
  assertEquals(defs, '<path id="p0" d="M954 274Q968 274 980 262Z"/>');
  assertEquals(
    body,
    '<use href="#p0" transform="matrix(0.016927 0 0 -0.016927 96 129.008)" fill="#17375E"/>' +
      '<use href="#p0" transform="matrix(0.016927 0 0 -0.016927 114.817 129.008)" fill="#17375E"/>' +
      '<use href="#p0" transform="matrix(1 0 0 1 5 5)" fill="none" stroke="red" stroke-width="30"/>',
  );
});

Deno.test("a clip holds for what is drawn until the restore, and a clip inside a clip is their overlap", () => {
  const { body, defs } = drawn((c) => {
    c.fillRect(0, 0, 1, 1);
    c.save();
    c.beginPath();
    c.rect(10, 10, 50, 20);
    c.clip();
    c.fillRect(0, 0, 100, 50);
    c.fillRect(1, 1, 2, 2);
    c.save();
    c.beginPath();
    c.ellipse(20, 20, 10, 5, 0, 0, 2 * Math.PI);
    c.clip();
    c.fillRect(0, 0, 9, 9);
    c.restore();
    c.restore();
    c.fillRect(0, 0, 2, 2);
  });
  assertEquals((defs.match(/<clipPath /g) ?? []).length, 2);
  assertStringIncludes(defs, '<clipPath id="c0"><path d="M10 10L60 10L60 30L10 30Z"/></clipPath>');
  assertStringIncludes(defs, '<clipPath id="c1" clip-path="url(#c0)"><path d="M30 20C');
  assertEquals(
    body,
    '<rect x="0" y="0" width="1" height="1" fill="#000000"/>' +
      '<g clip-path="url(#c0)"><rect x="0" y="0" width="100" height="50" fill="#000000"/><rect x="1" y="1" width="2" height="2" fill="#000000"/></g>' +
      '<g clip-path="url(#c1)"><rect x="0" y="0" width="9" height="9" fill="#000000"/></g>' +
      '<rect x="0" y="0" width="2" height="2" fill="#000000"/>',
  );
});

Deno.test("text is text, with the canvas font taken apart into attributes, and nothing from the document is markup", () => {
  const { body } = drawn((c) => {
    c.font = 'italic small-caps 700 14.667px Calibri, "Segoe UI", sans-serif';
    c.fillStyle = "#000000";
    c.letterSpacing = "0.5px";
    c.wordSpacing = "0px";
    c.fillText('a <b> & "q"', 364.462, 233.744);
    c.font = '7.3px x" onload="alert(1)';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("\u2022\u0001\uFFFF", 1, 2);
  });
  assertEquals(
    body,
    '<text x="364.462" y="233.744" font-family="Calibri, &quot;Segoe UI&quot;, sans-serif" font-size="14.667" font-style="italic" font-variant="small-caps" font-weight="700" letter-spacing="0.5" fill="#000000" xml:space="preserve">a &lt;b&gt; &amp; &quot;q&quot;</text>' +
      // A control character and a non-character would make the whole file unreadable: they are left out.
      '<text x="1" y="2" font-family="x&quot; onload=&quot;alert(1)" font-size="7.3" letter-spacing="0.5" text-anchor="middle" dominant-baseline="central" direction="rtl" fill="#000000" xml:space="preserve">\u2022</text>',
  );
});

Deno.test("text whose outlines the caller gives is drawn as those outlines, each glyph where the one before it ends", () => {
  const A = new SvgPath(), b = new SvgPath();
  A.moveTo(0, 0);
  A.lineTo(500, 1000);
  A.closePath();
  b.moveTo(0, 0);
  b.lineTo(100, 100);
  b.closePath();
  const asked: unknown[] = [];
  const c = new SvgCanvas(100, 50, (text, font) => {
    asked.push([text, font]);
    // "?" stands for a character the font has no glyph for: the caller gives nothing, and the text stays text.
    if (text.includes("?")) return null;
    return { unitsPerEm: 1000, glyphs: [...text].map((ch) => (ch === " " ? { path: null, advance: 250 } : ch === "a" ? { path: A, advance: 600, scale: 0.8 } : { path: b, advance: 500 })) };
  });
  c.font = "small-caps 700 20px Calibri, sans-serif";
  c.fillStyle = "#112233";
  c.fillText("a b", 10, 30);
  c.textAlign = "center";
  c.fillText("b", 50, 40);
  c.fillText("?", 1, 2);
  const svg = c.toSvg();
  assertEquals(asked[0], ["a b", { family: "Calibri, sans-serif", size: 20, bold: true, italic: false, smallCaps: true }]);
  // 20 px per 1000 units; the small capital at 0.8 of it, and the next glyph after its 600 × 0.016 = 9.6 px, then a 5 px space.
  assertStringIncludes(svg, '<use href="#p0" transform="matrix(0.016 0 0 -0.016 10 30)" fill="#112233"/><use href="#p1" transform="matrix(0.02 0 0 -0.02 24.6 30)" fill="#112233"/>');
  // Centred on x: half its 10 px advance to the left.
  assertStringIncludes(svg, '<use href="#p1" transform="matrix(0.02 0 0 -0.02 45 40)" fill="#112233"/>');
  assertStringIncludes(svg, ">?</text>");
  assertEquals((svg.match(/<text /g) ?? []).length, 1);
  // Word spacing is added at each space, on top of its advance: "b" moves 3 px to the right.
  const w = new SvgCanvas(100, 50, (text) => ({ unitsPerEm: 1000, glyphs: [...text].map((ch) => (ch === " " ? { path: null, advance: 250 } : { path: b, advance: 500 })) }));
  w.font = "20px Calibri";
  w.wordSpacing = "3px";
  w.fillText("b b", 0, 30);
  assertStringIncludes(w.toSvg(), 'matrix(0.02 0 0 -0.02 18 30)');
});

Deno.test("an image filter that is not a list of CSS filter functions is refused quickly, however many near-misses it holds", () => {
  const c = new SvgCanvas(10, 10);
  c.filter = "blur(1px) ".repeat(60) + "x";
  const t0 = performance.now();
  // deno-lint-ignore no-explicit-any
  c.drawImage({ width: 1, height: 1, src: "data:image/png;base64,AAAA" } as any, 0, 0);
  assert(performance.now() - t0 < 200, "the filter pattern backtracked");
  assert(!c.toSvg().includes("filter="), c.toSvg());
});

Deno.test("a colour that is not a colour is drawn in black, and a number that is not finite draws nothing", () => {
  const { body } = drawn((c) => {
    c.fillStyle = 'url(https://example.com/x)" onload="x';
    c.fillRect(0, 0, 1, 1);
    c.fillStyle = "rgba(46, 125, 50, 0.5)";
    c.fillRect(0, 0, 1, 1);
    c.fillRect(NaN, 0, 1, 1);
    c.beginPath();
    c.moveTo(0, Infinity);
    c.lineTo(1, 1);
    c.stroke();
  });
  assertEquals(body, '<rect x="0" y="0" width="1" height="1" fill="#000000"/><rect x="0" y="0" width="1" height="1" fill="rgba(46, 125, 50, 0.5)"/>');
});

Deno.test("an image is placed whole, or the part of it a crop names; only an inline raster picture is accepted", () => {
  const png = { href: "data:image/png;base64,iVBORw0KGgo=", width: 200, height: 100 };
  const { body } = drawn((c) => {
    c.drawImage(png, 10, 20, 50, 25);
    c.drawImage(png, 20, 10, 100, 50, 0, 0, 40, 30);
    c.drawImage({ href: "https://example.com/a.png", width: 1, height: 1 }, 0, 0, 1, 1);
    c.drawImage({ href: "data:image/svg+xml;base64,PHN2Zz4=", width: 1, height: 1 }, 0, 0, 1, 1);
  });
  assertEquals(
    body,
    '<image href="data:image/png;base64,iVBORw0KGgo=" x="10" y="20" width="50" height="25" preserveAspectRatio="none"/>' +
      '<svg x="0" y="0" width="40" height="30" viewBox="20 10 100 50" preserveAspectRatio="none"><image href="data:image/png;base64,iVBORw0KGgo=" width="200" height="100" preserveAspectRatio="none"/></svg>',
  );
});

Deno.test("a gradient and a shadow are definitions the drawing refers to", () => {
  const { body, defs } = drawn((c) => {
    const g = c.createLinearGradient(0, 0, 10, 0);
    g.addColorStop(0, "#ff0000");
    g.addColorStop(1, "#0000ff");
    c.fillStyle = g;
    c.fillRect(0, 0, 10, 10);
    c.fillStyle = "#000000";
    c.shadowColor = "rgba(0,0,0,0.3)";
    c.shadowBlur = 2;
    c.shadowOffsetX = 1;
    c.shadowOffsetY = 1;
    c.fillRect(0, 0, 5, 5);
  });
  assertStringIncludes(defs, '<linearGradient id="g0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>');
  assertStringIncludes(defs, '<feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.3)"/>');
  assertStringIncludes(body, '<rect x="0" y="0" width="10" height="10" fill="url(#g0)"/>');
  assert(/<g filter="url\(#s0\)"><rect x="0" y="0" width="5" height="5" fill="#000000"\/><\/g>/.test(body), body);
});

Deno.test("the size of a picture is read from its first bytes", () => {
  const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0x94, 0, 0, 1, 0x1e];
  assertEquals(imageSize(`data:image/png;base64,${b64(png)}`), { width: 660, height: 286 });
  const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x08, 0x00];
  assertEquals(imageSize(`data:image/gif;base64,${b64(gif)}`), { width: 16, height: 8 });
  // JPEG: SOI, an APP0 segment to skip, then the frame header (SOF0) with height before width.
  const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xc0, 0, 11, 8, 0, 0x30, 0, 0x40, 3];
  assertEquals(imageSize(`data:image/jpeg;base64,${b64(jpeg)}`), { width: 64, height: 48 });
  assertEquals(imageSize("data:image/png;base64,AAAA"), { width: 0, height: 0 });
  assertEquals(imageSize("https://example.com/a.png"), { width: 0, height: 0 });
});

Deno.test("a radial gradient that starts at a radius keeps it (fr), and one that starts at a point has none", () => {
  const c = new SvgCanvas(100, 100);
  const ring = c.createRadialGradient(50, 50, 10, 50, 50, 40);
  ring.addColorStop(0, "#fff");
  ring.addColorStop(1, "#000");
  c.fillStyle = ring;
  c.fillRect(0, 0, 100, 100);
  const point = c.createRadialGradient(50, 50, 0, 50, 50, 40);
  point.addColorStop(0, "#fff");
  point.addColorStop(1, "#000");
  c.fillStyle = point;
  c.fillRect(0, 0, 100, 100);
  const svg = c.toSvg();
  assertStringIncludes(svg, 'fx="50" fy="50" fr="10" cx="50" cy="50" r="40"');
  assertStringIncludes(svg, 'fx="50" fy="50" cx="50" cy="50" r="40"');
});
