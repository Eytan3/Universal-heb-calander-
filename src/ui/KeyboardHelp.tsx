"use client";
/** Sheet listing the keyboard shortcuts (opened with "?"). */
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function KeyboardHelp({ t, locale, onClose }: { t: Strings; locale: Locale; onClose: () => void }) {
  const mod = isMac() ? "⌘" : "Ctrl";
  // In RTL the left/right arrows follow the grid's direction.
  const [back, fwd] = locale === "he" ? ["→", "←"] : ["←", "→"];
  const rows: [string[], string][] = [
    [[back, fwd], t.kb.day],
    [["↑", "↓"], t.kb.week],
    [["PageUp", "PageDown"], t.kb.month],
    [[`Shift ${back}`, `Shift ${fwd}`], t.kb.month],
    [["Shift ↑", "Shift ↓"], t.kb.year],
    [["Home", "End"], t.kb.monthEdges],
    [["T"], t.kb.today],
    [["B"], t.kb.back],
    [["N"], t.kb.newEvent],
    [["Enter"], t.kb.open],
    [["M"], t.kb.mode],
    [["C"], t.kb.panel],
    [[","], t.kb.settings],
    [["?"], t.kb.help],
    [["Esc"], t.kb.close],
    [[`${mod} Enter`], t.kb.save],
  ];
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="kb-title" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="grabber" aria-hidden />
        <header className="sheet-bar">
          <span />
          <h2 id="kb-title">{t.kb.title}</h2>
          <button type="button" className="bar-btn strong" onClick={onClose} autoFocus>{t.done}</button>
        </header>
        <div className="sheet-body">
          <section className="group">
            {rows.map(([keys, label], i) => (
              <div className="row" key={i}>
                <span className="row-label">{label}</span>
                {/* The group follows the reading direction (so "previous / next" lines up with the label); each key reads LTR. */}
                <span className="kbd-group">
                  {keys.map((k, j) => <span key={j}>{j > 0 && <span className="kbd-sep">/</span>}<kbd dir="ltr">{k}</kbd></span>)}
                </span>
              </div>
            ))}
          </section>
          <p className="muted small" style={{ margin: "0 0.9rem" }}>{t.kb.note}</p>
        </div>
      </div>
    </div>
  );
}
