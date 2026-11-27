// Pieces shared by every page.

interface PageLink {
  id: string;
  label: string;
  href: string;
}

// Add new pages here and to vite.config.ts.
const PAGES: PageLink[] = [{ id: "probe", label: "Decoder", href: "./index.html" }];

/** Page links for the toolbar. Hidden while there is only one page. */
export function navLinks(current: string): HTMLElement | null {
  if (PAGES.length < 2) return null;
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.setAttribute("aria-label", "Pages");
  for (const page of PAGES) {
    const a = document.createElement("a");
    a.href = page.href;
    a.textContent = page.label;
    if (page.id === current) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  return nav;
}

/** Shown if the WebAssembly module fails to load (usually: `npm run wasm` not run). */
export function showLoadError(where: HTMLElement, err: unknown): void {
  const box = document.createElement("div");
  box.className = "load-error";
  box.textContent =
    "Could not load the C++ core (WebAssembly).\n" + "Run `npm run wasm` in web/ and reload.\n\n" + String(err);
  where.replaceChildren(box);
}
