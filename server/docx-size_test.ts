import { assertEquals } from "jsr:@std/assert@1";
import { partSize, tooLarge } from "./docx-size.ts";

const read = (f: string) => Deno.readFile(new URL(`../.scratch/eig/${f}`, import.meta.url));

/** A zip with one stored (uncompressed) file, written by hand. */
function zipOf(name: string, body: Uint8Array): Uint8Array {
  const n = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + n.length + body.length), lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true); lv.setUint16(26, n.length, true);
  local.set(n, 30); local.set(body, 30 + n.length);
  const central = new Uint8Array(46 + n.length), cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true); cv.setUint16(28, n.length, true);
  central.set(n, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  return new Uint8Array([...local, ...central, ...end]);
}

Deno.test("the uncompressed size of a named part is read from the zip's directory", () => {
  const z = zipOf("word/document.xml", new Uint8Array(1234));
  assertEquals(partSize(z, "word/document.xml"), 1234);
  assertEquals(partSize(z, "word/styles.xml"), null);
});

Deno.test("bytes that are not a zip, or a zip cut short, give null and do not throw", () => {
  assertEquals(partSize(new Uint8Array(0), "word/document.xml"), null);
  assertEquals(partSize(new TextEncoder().encode("PK not really a zip at all, just text"), "word/document.xml"), null);
  assertEquals(partSize(zipOf("word/document.xml", new Uint8Array(50)).slice(0, 60), "word/document.xml"), null);
});

Deno.test({
  name: "the real samples: 500 pages is 1.8 MB of document XML, the redline 20 KB",
  ignore: !(await read("lorem-500.docx").then(() => true, () => false)),
  fn: async () => {
    assertEquals(partSize(await read("lorem-500.docx"), "word/document.xml"), 1827939);
    assertEquals(partSize(await read("redline.docx"), "word/document.xml"), 20191);
  },
});

Deno.test("an engine with a limit refuses a document past it, with the sizes; others take anything", async () => {
  const { tooLarge } = await import("./docx-size.ts");
  const big = zipOf("word/document.xml", new Uint8Array(3000)), small = zipOf("word/document.xml", new Uint8Array(100));
  const limits = { eigenpal: 1000 };
  assertEquals(tooLarge("eigenpal", small, limits), null);
  assertEquals(tooLarge("folio", big, limits), null);
  assertEquals(tooLarge("eigenpal", big, limits)?.includes("too large"), true);
  assertEquals(tooLarge("eigenpal", new Uint8Array(5), limits), null); // not a zip: the engine's own error says so
});

/** A zip of stored (uncompressed) entries, each declaring `declared` bytes whatever its real length. */
function zipDeclaring(entries: { name: string; declared: number }[], comment = ""): Uint8Array {
  const te = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  for (const e of entries) {
    const name = te.encode(e.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint32(24, e.declared, true); cv.setUint16(28, name.length, true); cv.setUint32(42, at, true); cd.set(name, 46);
    parts.push(local); central.push(cd); at += local.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const c = te.encode(comment);
  const end = new Uint8Array(22 + c.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, at, true); ev.setUint16(20, c.length, true); end.set(c, 22);
  const out = new Uint8Array(at + cdSize + end.length);
  let o = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, o); o += p.length; }
  return out;
}

Deno.test("two parts of that name, or the name written another way: the largest one counts", () => {
  assertEquals(partSize(zipDeclaring([{ name: "word/document.xml", declared: 100 }, { name: "word/document.xml", declared: 5_000_000 }]), "word/document.xml"), 5_000_000);
  for (const name of ["WORD/DOCUMENT.XML", "./word/document.xml", "word\\document.xml", "/word/document.xml"]) {
    assertEquals(partSize(zipDeclaring([{ name, declared: 2_000_000 }]), "word/document.xml"), 2_000_000, name);
  }
  assertEquals(partSize(zipDeclaring([{ name: "word/styles.xml", declared: 9 }]), "word/document.xml"), null);
});

Deno.test("the refusal never says the size equals the limit", () => {
  const msg = tooLarge("eigenpal", zipDeclaring([{ name: "word/document.xml", declared: 1_000_001 }]))!;
  assertEquals(msg.includes("unpack to just over 1.0 MB"), true, msg);
  assertEquals(tooLarge("eigenpal", zipDeclaring([{ name: "word/document.xml", declared: 1_000_000 }])), null);
});
