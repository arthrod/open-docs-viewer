/** Behaviour asked for by the outside review of 2026-11-23 (OpenCode, glm-5.4). */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { CSS as OFFICE_OPEN_CSS } from "./office-open.ts";

/** The declarations a wide screen applies to `body`: top-level rules only, in order, later ones winning. */
function wideBody(css: string): Record<string, string> {
  let top = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Drop every @media block (one level of nesting is all this stylesheet has).
  for (;;) {
    const at = top.indexOf("@media");
    if (at < 0) break;
    let i = top.indexOf("{", at), depth = 0;
    for (; i < top.length; i++) {
      if (top[i] === "{") depth++;
      else if (top[i] === "}" && --depth === 0) break;
    }
    top = top.slice(0, at) + top.slice(i + 1);
  }
  const out: Record<string, string> = {};
  for (const rule of top.split("}")) {
    const [sel, decls] = rule.split("{");
    if (decls === undefined || !sel.split(",").some((s) => s.trim() === "body")) continue;
    for (const d of decls.split(";")) {
      const [k, ...v] = d.split(":");
      if (k.trim()) out[k.trim()] = v.join(":").trim();
    }
  }
  return out;
}

Deno.test("/r/office-open scrolls on a wide screen: its page has no pane of its own to scroll", () => {
  const body = wideBody(OFFICE_OPEN_CSS);
  assert(body.overflow !== "hidden", `body overflow is ${body.overflow}`);
  assert(!/dvh|vh|100%/.test(body.height ?? ""), `body height is ${body.height}`);
  assertEquals(body.display === "flex" && body["flex-direction"] === "column", false);
});

Deno.test("a landing row measured on another machine than its table's heading says which machine, not only the date", async () => {
  const { when } = await import("./landing.ts");
  const head = { measuredAt: "2026-11-21", environment: "Chrome, 3 runs, median; from Darwin arm64; machine load median 9.1" };
  const other = { measuredAt: "2026-11-21", environment: "Chrome, 3 runs, median; from a Hugging Face Jobs cpu-xl machine (16 vCPU); machine load median 59" };
  assert(when(other, head).includes("a Hugging Face Jobs cpu-xl machine"), when(other, head));
  assertEquals(when(head, head), "");
  assert(when({ measuredAt: "2026-11-20" }, head).includes("measured 2026-11-20"));
});

Deno.test("an engine with no read-only mode is not labelled view-only, on its page or on the landing", async () => {
  const { ENGINES } = await import("./engines.ts");
  const { viewNavBar } = await import("./navbar.ts");
  const src = new URL("https://example.com/a.docx");
  const editable = ENGINES.filter((e) => /still editable/.test(e.readOnly)).map((e) => e.slug).sort();
  assertEquals(editable, ["docs-plus", "fidus-writer", "genoffice", "univer", "wordcraft"]);
  for (const slug of editable) {
    const bar = viewNavBar(ENGINES.find((e) => e.slug === slug)!, ENGINES, src);
    assert(!bar.includes("· view-only"), slug);
    assert(bar.includes("· still editable"), slug);
  }
  assert(viewNavBar(ENGINES.find((e) => e.slug === "folio")!, ENGINES, src).includes("· view-only"));
  const { landingPage } = await import("./landing.ts");
  const html = landingPage(ENGINES, { measuredAt: null, environment: null, engines: {} } as never, "https://example.com/a.docx");
  assert(!/\d+ engines as <strong>view-only<\/strong>/.test(html), "the lede says every engine is view-only");
});
