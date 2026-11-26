/** Appearance preference: follow the system, or force light/dark. Stored per browser. */
export type Theme = "system" | "light" | "dark";

const KEY = "universal-calendar:theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Page background per appearance; also the colour of the iPhone status bar in the home-screen app. */
const BG = { light: "#ffffff", dark: "#000000" } as const;

/** Keep <meta name="theme-color"> in step with the chosen appearance (not only the system one).
 *  Called after hydration (React renders the head's metadata itself, so earlier changes would be lost). */
export function syncThemeColor(theme: Theme = readTheme()) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = theme === "system" ? (m.media.includes("dark") ? BG.dark : BG.light) : BG[theme];
  });
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  syncThemeColor(theme);
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

/** Inline script for <head>: applies the saved theme before first paint (no light flash). */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
