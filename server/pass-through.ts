/**
 * Headers for a request this site passes through to the editors site: none of the visitor's.
 * (Which site shows a mirrored page travels in the page's own address, `od-at`, set by the
 * engine's adapter: the platform's edge keys its cache on the address and ignores Vary.)
 *
 * The request asks for gzip and nothing else: this runtime's fetch hands back a gzip body
 * already decoded, yet leaves `content-encoding: gzip` on the response (seen 2026-11-18: a
 * browser then failed to decode the 2.9 MB it was sent). So the encoding is fixed here and its
 * header dropped in `passedThrough`; the platform's edge compresses again for the visitor.
 */
export const passThroughHeaders = () => new Headers({ "accept-encoding": "gzip" });

/**
 * Where this site passes the editors site's /vendor files through. A new name is a new set of
 * addresses: the platform's edge keeps an answer for a year under these files' cache headers,
 * and it kept broken ones under the plain /vendor paths (2026-11-18).
 */
export const VENDOR_ROOT = "/eo1";

/** The editors-site path for a pass-through request, or undefined when it is not one. */
export function passThroughPath(path: string): string | undefined {
  if (!path.startsWith(`${VENDOR_ROOT}/vendor/`) || path.includes("..")) return undefined;
  return path.slice(VENDOR_ROOT.length);
}

const KEPT = ["content-type", "cache-control", "last-modified", "etag", "access-control-allow-origin"];

/**
 * The editors site's answer, for the visitor: the body whole (a body streamed from one val through
 * another broke off mid-file at 380 KB, seen 2026-11-18), with only the headers that describe it.
 */
export async function passedThrough(res: Response): Promise<Response> {
  const headers = new Headers({ "x-proxied-from": "open-docs" });
  for (const name of KEPT) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Only a good answer may be kept by caches: a failure kept for a year is a broken engine.
  if (res.status !== 200) headers.set("cache-control", "no-store");
  return new Response(await res.arrayBuffer(), { status: res.status, headers });
}
