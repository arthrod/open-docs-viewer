/**
 * How large one part of a .docx is once unpacked, read from the zip's central
 * directory without unpacking anything. Used to refuse a document before an
 * engine that cannot hold it is asked to (main.http.ts).
 */

/** The uncompressed size in bytes of the part called `name`, or null when the zip has no such part or cannot be read. */
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
  const want = new TextEncoder().encode(name);
  for (let k = 0; k < count; k++) {
    if (at + 46 > zip.length || v.getUint32(at, true) !== 0x02014b50) return null;
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
    if (at + 46 + nameLen > zip.length) return null;
    if (nameLen === want.length && want.every((b, i) => zip[at + 46 + i] === b)) return v.getUint32(at + 24, true);
    at += 46 + nameLen + extra + comment;
  }
  return null;
}

/**
 * The largest `word/document.xml` (unpacked bytes) each server renderer is given.
 *
 * docx-editor.dev: its exporter ends the isolate on the 500-page sample (1.8 MB
 * of document XML), and an isolate that ends takes every other request it was
 * answering with it: a page load beside it got HTTP 500 (2026-11-16). Only two
 * sizes were tried, 20 KB (renders) and 1.8 MB (ends the isolate); the limit sits
 * between them and is a guard, not a measured capacity.
 */
export const RENDER_LIMIT: Record<string, number> = { eigenpal: 1_000_000 };

/** Why `engine` will not be given this document, or null when it will. */
export function tooLarge(engine: string, docx: Uint8Array, limits = RENDER_LIMIT): string | null {
  const limit = limits[engine];
  if (!limit) return null;
  const size = partSize(docx, "word/document.xml");
  if (size == null || size <= limit) return null;
  const mb = (n: number) => (n / 1e6).toFixed(1);
  return `this document is too large for this engine's server render (${mb(size)} MB of document XML, limit ${mb(limit)} MB): larger ones end the server process. Open it in the browser render instead.`;
}
