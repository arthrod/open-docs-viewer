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
