/**
 * The view-only page's runner. Loaded after open-docs' lib/boot.ts (which
 * defines window.od) and before the engine's adapter module.
 *
 * It hands the adapter a ViewerContext (open-docs lib/kit.ts): the document,
 * fetched once from this val's /api/doc, and its public URL. The adapter
 * mounts read-only on it; when mount() didn't take the document, it is
 * loaded with load(). Then `data-od-rendered` on <html> marks the moment the
 * page is showing it (scripts/measure.py reads it).
 */
type Config = { slug: string; name: string; src: string; frame: boolean; docUrl: string };
// deno-lint-ignore no-explicit-any
const od = (window as any).od;
// deno-lint-ignore no-explicit-any
const cfg = (window as any).__OD_VIEW as Config;
const statusEl = document.getElementById("od-loading-detail")!;
const status = (s: string) => (statusEl.textContent = s);

let doc: Promise<Uint8Array> | undefined;
const fetchDoc = () =>
  doc ??= fetch(cfg.docUrl).then(async (r) => {
    if (!r.ok) throw new Error(`the document could not be fetched: ${r.status} ${await r.text()}`);
    return new Uint8Array(await r.arrayBuffer());
  });
// Engines that render bytes get the document as early as possible, in
// parallel with loading the engine. Frame viewers fetch it on their servers.
if (!cfg.frame) fetchDoc().catch(() => undefined);

od.viewer = {
  srcUrl: cfg.src,
  taken: false,
  initialDocx() {
    od.viewer.taken = true;
    return fetchDoc().then((b: Uint8Array) => b.slice());
  },
};

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

od.onAdapter(async (a: {
  mount(): Promise<void>;
  load(b: Uint8Array): Promise<void>;
  setReadOnly?(): void | Promise<void>;
  fit?(w: number, h: number): void;
}) => {
  const stage = document.getElementById("od-stage")!;
  try {
    status(`Loading ${cfg.name}…`);
    await a.mount();
    if (!od.viewer.taken) await a.load(await fetchDoc());
    await a.setReadOnly?.();
    if (a.fit) {
      a.fit(stage.clientWidth, stage.clientHeight);
      let t: number | undefined;
      new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => a.fit!(stage.clientWidth, stage.clientHeight), 80);
      }).observe(stage);
    }
    await frames();
    const ms = performance.now();
    document.documentElement.dataset.odRendered = String(Math.round(ms));
    status(cfg.frame ? `Frame loaded in ${(ms / 1000).toFixed(2)} s` : `Rendered in ${(ms / 1000).toFixed(2)} s`);
  } catch (err) {
    const e = err as Error;
    document.documentElement.dataset.odError = e?.message ?? String(err);
    status("Failed");
    const box = document.createElement("div");
    box.className = "verr";
    box.textContent = `${cfg.name} could not show the document.\n\n${e?.stack ?? e?.message ?? String(err)}`;
    stage.replaceChildren(box);
    console.error("[open-docs-viewer]", err);
  }
});
