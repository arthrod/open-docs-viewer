/**
 * docs.plus, on this server.
 *
 * docs.plus converts documents on its own server (its hocuspocus.server
 * application): `importDocx` reads a .docx with mammoth into its Tiptap
 * document, and that document is turned into HTML with ProseMirror's
 * DOMSerializer over its own render schema, in a linkedom document. This route
 * runs that same code (server/docs-plus-lib.js, bundled from the repository at
 * the commit the editors trial measured). docs.plus does not paginate, so there
 * are no pages.
 *
 * To rebuild docs-plus-lib.js: an entry file that re-exports `importDocx`,
 * `getRenderSchema` and `toPortableJson` from the repository's
 * document-conversion/domain folder, bundled with
 * `esbuild --bundle --format=esm --platform=node --packages=external`, with
 * `pino` and `prom-client` aliased to stand-ins that do nothing, and each
 * package import pinned as `npm:<name>@<version>`.
 */
import { Buffer } from "node:buffer";
import { DOMSerializer, Node as PMNode } from "npm:@tiptap/pm@3.32.0/model";
import { parseHTML } from "npm:linkedom@0.18.13";

// deno-lint-ignore no-explicit-any
type Any = any;
/**
 * The conversion code imports mammoth, which builds its promise class by writing `__proto__`;
 * this runtime ignores such writes unless the standard accessor is put back first (see the
 * same step in server/plate.ts). So the library is imported on the first request, after that.
 */
let lib: Promise<Any> | undefined;
function loadLib(): Promise<Any> {
  if (lib === undefined) {
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
  lib ??= import("./docs-plus-lib.js").catch((e) => {
    lib = undefined; // tried again on the next request
    throw e;
  });
  return lib;
}

const CSS = `body{margin:0;background:#f3f4f6}
main{box-sizing:border-box;max-width:860px;margin:16px auto 48px;padding:40px 56px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgb(0 0 0 / .1);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;overflow-wrap:anywhere}
@media(max-width:600px){main{margin:0;padding:20px 16px;border-radius:0}}
h1{font-size:1.9em;line-height:1.2;margin:.6em 0 .2em}h2{font-size:1.5em;margin:1em 0 .2em}h3{font-size:1.25em}
table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #d1d5db;padding:4px 8px;vertical-align:top}
img{max-width:100%;height:auto}a{color:#2563eb}pre{white-space:pre-wrap}`;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp" };

export async function docsPlusHtml(bytes: Uint8Array) {
  const t0 = performance.now();
  const { getRenderSchema, importDocx, toPortableJson } = await loadLib();
  // Its import hands each picture to an uploader and keeps the address it gets back, which must
  // end in an image extension. The pictures stay here: each gets a placeholder address, swapped
  // for the picture's own bytes in the finished HTML.
  const pictures = new Map<string, string>();
  const uploadImage = (buffer: Uint8Array, contentType: string) => {
    const address = `https://pictures.invalid/${pictures.size + 1}.${EXT[contentType] ?? "png"}`;
    pictures.set(address, `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`);
    return Promise.resolve(address);
  };
  const result = await importDocx(Buffer.from(bytes), { fallbackTitle: "Untitled", uploadImage });
  const schema = getRenderSchema();
  const node = PMNode.fromJSON(schema, toPortableJson(result.content));
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const body = document.createElement("main");
  DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document }, body);
  for (const img of Array.from<Any>(body.querySelectorAll("img") as Any)) {
    const data = pictures.get(img.getAttribute("src") ?? "");
    if (data) img.setAttribute("src", data);
    else img.remove();
  }
  const warnings = (result.warnings ?? []).length;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>docs.plus · server-rendered</title>
<style>${CSS}</style></head><body>${body.outerHTML}</body></html>`;
  return {
    html,
    initMs: 0,
    renderMs: Math.round(performance.now() - t0),
    unpainted: ["pages (docs.plus does not paginate)", ...(warnings ? [`${warnings} import warning${warnings === 1 ? "" : "s"} from its own importer`] : [])],
  };
}
