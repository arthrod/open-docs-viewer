// WordCraft's server-rendered page (server/wordcraft.ts): a page image that failed is asked for
// again. The image route answers 503 when the server is busy, and to an <img> that looks like any
// other failure; without this, one busy moment leaves a blank page until the reader reloads.
// Three more tries, after 2, 4 and 8 seconds, then the image is left as it is.
addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("page")) return;
    const n = Number(img.dataset.retry || 0);
    if (n >= 3) return;
    img.dataset.retry = String(n + 1);
    setTimeout(() => {
      const src = img.getAttribute("src"), srcset = img.getAttribute("srcset");
      img.removeAttribute("srcset");
      img.removeAttribute("src");
      if (src) img.setAttribute("src", src);
      if (srcset) img.setAttribute("srcset", srcset);
    }, 2000 << n);
  },
  true, // error events of images do not bubble: caught on the way down
);
