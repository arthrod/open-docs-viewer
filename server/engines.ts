/**
 * The engines, read from the open-docs registry (one source of truth), with
 * how each is made view-only here.
 */
export const OPEN_DOCS = "https://editors.benchmarks.law";
/** The open-docs val's modules, for the server side (shells, registry). */
export const OPEN_DOCS_ESM = "https://esm.town/v/arthrod/open-docs";

/**
 * esm.town redirects an unversioned path to the val's current version
 * (`/v/arthrod/open-docs@661-main/...`). The runtime caches the unversioned
 * module, so a registry change (new makers, a new engine) would not show up
 * here; importing the versioned URL the redirect names reads the current one.
 */
async function currentEsm(path: string): Promise<string> {
  const unversioned = `${OPEN_DOCS_ESM}${path}`;
  const res = await fetch(unversioned, { redirect: "manual" });
  await res.body?.cancel();
  const loc = res.headers.get("location");
  return loc ? new URL(loc, OPEN_DOCS_ESM).href : unversioned;
}

const { editors } = await import(await currentEsm("/server/registry.ts"));

export interface Maker {
  name: string;
  kind: "company" | "person";
  linkedin?: string;
  github?: string;
}

export interface Engine {
  slug: string;
  /** Who builds it (open-docs registry `makers`): verified LinkedIn, else GitHub. */
  makers?: Maker[];
  name: string;
  license: string;
  packages: string[];
  repo: string;
  proprietary: boolean;
  /** Renders in a cross-origin frame on its vendor's servers (Microsoft, Google). */
  frame: boolean;
  /** How this page makes it view-only (the library's own mechanism). */
  readOnly: string;
}

const READ_ONLY: Record<string, string> = {
  "canvas-editor": "canvas-editor's EditorMode.READONLY; our toolbar hidden",
  "docxodus": "Docxodus's paginated page view: convertDocxToHtml (Paginated) + paginateHtml",
  "superdoc": 'SuperDoc documentMode "viewing"; no toolbar',
  "plate": "PlateContent readOnly; our toolbar hidden",
  "docen": 'docen editable="false" (its ribbon always shows, by design)',
  "eigenpal": 'docx-editor.dev mode="view"',
  "folio": "folio readOnly (hides its toolbar and rulers)",
  "wordcraft": "WordCraft 0.16.0 has no read-only mode — still editable here",
  "word-online": "Microsoft's embed viewer, rendered on Microsoft's servers",
  "google-viewer": "Google's embed viewer, rendered on Google's servers",
  "apryse": "WebViewer annotation read-only, View ribbon only (no key: demo mode, watermark)",
  "nutrient": "readOnly view state, navigation toolbar only (no key: trial mode, watermark)",
};

// deno-lint-ignore no-explicit-any
export const ENGINES: Engine[] = (editors as any[]).map((e) => ({
  slug: e.slug,
  name: e.name,
  license: e.license,
  packages: e.packages,
  repo: e.repo,
  proprietary: e.kind === "viewer",
  frame: e.opensFiles === false,
  readOnly: READ_ONLY[e.slug] ?? "",
  makers: e.makers ?? [],
}));
