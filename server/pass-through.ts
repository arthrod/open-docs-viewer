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

/** Where on the editors site a request under VENDOR_ROOT goes: the prefix off, the query as it came. */
export function passThroughUrl(openDocs: string, asked: URL): string | undefined {
  const path = passThroughPath(asked.pathname);
  return path === undefined ? undefined : openDocs + path + asked.search;
}

const KEPT = ["content-type", "content-disposition", "cache-control", "last-modified", "etag", "access-control-allow-origin"];
const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * The editors site's answer, for the visitor: its body streamed on, with only the headers that
 * describe it. The upstream's content-length and content-encoding belong to bytes this runtime
 * has already decoded; copying every header, as this route once did, sent a decoded body under
 * them, and files broke off mid-way or could not be decoded (seen 2026-11-18). With these headers
 * a streamed body arrives whole (checked on the deployed site on files of 0.4 to 38.8 MB, with
 * and without compression).
 */
export function passedThrough(res: Response): Response {
  const headers = new Headers({ "x-proxied-from": "open-docs" });
  for (const name of KEPT) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Only a good answer may be kept by caches: a failure kept for a year is a broken engine.
  if (res.status !== 200) headers.set("cache-control", "no-store");
  return new Response(NO_BODY.has(res.status) ? null : res.body, { status: res.status, headers });
}
