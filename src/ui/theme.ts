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

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

/** Inline script for <head>: applies the saved theme before first paint (no light flash). */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
