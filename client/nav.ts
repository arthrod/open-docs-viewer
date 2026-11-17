/** MENU panel and engine picker wiring (open-docs navbar pattern). */
const $ = (id: string) => document.getElementById(id);

function openMenu() {
  const menu = $("od-menu");
  if (!menu || !menu.hidden) return;
  menu.hidden = false;
  $("od-more")?.setAttribute("aria-expanded", "true");
  // The first item that can take focus: "Re-measure now" is hidden until the page has rendered.
  (menu.querySelector("button:not([hidden]):not([disabled]), a") as HTMLElement | null)?.focus({ preventScroll: true });
}

function closeMenu() {
  const menu = $("od-menu");
  if (menu) menu.hidden = true;
  $("od-more")?.setAttribute("aria-expanded", "false");
}

function wireMenu() {
  const menu = $("od-menu");
  const more = $("od-more");
  if (!menu || !more) return;
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== more) closeMenu();
  });
  menu.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest("button, a");
    if (!item) return;
    closeMenu();
    // A button acts in place: focus goes back to the control that opened the menu, not to the page's start.
    if (item.tagName === "BUTTON" && more.getClientRects().length > 0) more.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      closeMenu();
      more.focus();
    }
  });
}

function wireEngineSwitch() {
  const sel = $("od-switch") as HTMLSelectElement | null;
  if (!sel) return;
  const src = sel.dataset.src ?? new URLSearchParams(location.search).get("src") ?? "";
  sel.addEventListener("change", () => {
    location.href = `/v/${sel.value}?src=${encodeURIComponent(src)}`;
  });
}

wireMenu();
wireEngineSwitch();
