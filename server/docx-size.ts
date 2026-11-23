/**
 * How large one part of a .docx is once unpacked, read from the zip's central
 * directory without unpacking anything. Used to refuse a document before an
 * engine that cannot hold it is asked to (main.http.ts).
 */

/**
 * The uncompressed size in bytes of the part called `name`, as the zip's
 * directory declares it, or null when the zip has no such part or cannot be
 * read. Names are compared the way readers differ about them (case, a leading
 * `./` or `/`, backslashes), and of several parts with that name the largest
 * counts: whichever one an engine takes, it is not larger than this.
 *
 * It is a guard for honest documents. The directory is the sender's word: a
 * crafted zip can declare less than it holds, and a zip64 directory is not
 * read. Unpacking under a hostile document is not what this protects against.
 */
export function partSize(zip: Uint8Array, name: string): number | null {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end record is the last 22 bytes, or earlier when the zip carries a comment (at most 65535 bytes).
  let end = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65535; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const plain = (s: string) => s.replaceAll("\\", "/").replace(/^(\.?\/)+/, "").toLowerCase();
  const want = plain(name);
  const td = new TextDecoder();
  let largest: number | null = null;
  for (let k = 0; k < count; k++) {
    if (at + 46 > zip.length || v.getUint32(at, true) !== 0x02014b50) return largest;
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
    if (at + 46 + nameLen > zip.length) return largest;
    if (plain(td.decode(zip.subarray(at + 46, at + 46 + nameLen))) === want) largest = Math.max(largest ?? 0, v.getUint32(at + 24, true));
    at += 46 + nameLen + extra + comment;
  }
  return largest;
}

/**
 * The largest `word/document.xml` (unpacked bytes) each server renderer is given.
 *
 * docx-editor.dev: its exporter ends the isolate on the 500-page sample (1.8 MB
 * of document XML), and an isolate that ends takes every other request it was
 * answering with it: a page load beside it got HTTP 500 (2026-11-16). Only two
 * sizes were tried, 20 KB (renders) and 1.8 MB (ends the isolate); the limit sits
 * between them and is a guard, not a measured capacity.
 *
 * BetterOffice: its layout is made whole before any page is drawn, and its wasm memory grows
 * with the document and is not given back: about 0.5 GB for the 500-page sample (1.8 MB of
 * document XML, measured 2026-11-21). The limit is a little over twice that sample; nothing
 * larger was tried. A page count cannot be the test: it is known only after the layout.
 */
export const RENDER_LIMIT: Record<string, number> = { eigenpal: 1_000_000, betteroffice: 4_000_000 };

/** What the limit guards against, as far as it was seen: only docx-editor.dev was seen to end the process. */
const WHY: Record<string, string> = {
  eigenpal: "larger ones end the server process",
  betteroffice: "its memory grows with the document and is not given back, and larger ones were not tried",
};

/** Why `engine` will not be given this document, or null when it will. */
export function tooLarge(engine: string, docx: Uint8Array, limits = RENDER_LIMIT): string | null {
  const limit = limits[engine];
  if (!limit) return null;
  const size = partSize(docx, "word/document.xml");
  if (size == null || size <= limit) return null;
  const mb = (n: number) => (n / 1e6).toFixed(1);
  // Never "1.0 MB; the limit is 1.0 MB" for a document a byte over.
  const said = mb(size) === mb(limit) ? `just over ${mb(limit)}` : mb(size);
  return `this document is too large for this engine's server render (its text and structure unpack to ${said} MB; the limit is ${mb(limit)} MB): ${WHY[engine] ?? "the limit guards the server"}. Open it in the browser render instead.`;
}
