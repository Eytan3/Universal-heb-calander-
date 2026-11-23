"use client";
/**
 * Side panel (modelled on Apple Calendar's calendar list): the user's own calendars,
 * each with colour, show/hide, its own ICS link and export; plus built-in calendars
 * (holidays) that can be switched off completely for a clean calendar.
 */
import { useState } from "react";
import { COLLECTION_COLORS, type Collection, type EventStoreDocument } from "@/core/events/schema";
import { HOLIDAY_CATEGORIES, type HolidayCategory } from "@/core/holidays/types";
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";
import type { HolidayPrefs } from "./viewPrefs";
import { exportIcs, exportJson } from "./export";
import { withFeedToken } from "./repository";

interface Props {
  /** Closes the panel (used by the sheet's Done button on phones). */
  onClose: () => void;
  t: Strings;
  locale: Locale;
  doc: EventStoreDocument;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  holidays: HolidayPrefs;
  onHolidays: (h: HolidayPrefs) => void;
  /** Feed links only exist when events live on the server. */
  serverFeeds: boolean;
  /** The holidays feed needs only the server code, not storage. */
  holidayFeed: boolean;
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (id: string, name: string, color: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function displayName(c: Collection, t: Strings) {
  return c.name || (c.id === "personal" ? t.defaultCollection : t.newCalendar);
}

function Check({ on, color, label, onClick }: { on: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={`cal-check${on ? " on" : ""}`}
      style={{ "--c": color } as React.CSSProperties} onClick={onClick}>
      {on && <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>}
    </button>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }, () => undefined);
  return { copied, copy };
}

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
const webcal = (path: string) => withFeedToken(`${origin()}${path}`).replace(/^https?:/, "webcal:");

export function CalendarsPanel(p: Props) {
  const { t, doc } = p;
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; color: string } | null>(null);
  const [creating, setCreating] = useState<{ name: string; color: string } | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  const counts = new Map<string, number>();
  for (const e of doc.events) counts.set(e.collectionId, (counts.get(e.collectionId) ?? 0) + 1);

  const openOptions = (c: Collection) => {
    setArmedDelete(null);
    if (open === c.id) { setOpen(null); return; }
    setOpen(c.id);
    setDraft({ name: c.name, color: c.color });
  };

  const holidayFeed = `/holidays.ics?region=${p.holidays.region}&categories=${p.holidays.categories.join(",")}&lang=${p.locale}`;

  return (
    <aside className="sidebar" id="calendars-panel" aria-label={t.calendars}>
      <div className="grabber" aria-hidden />
      <header className="side-bar">
        <h2>{t.calendars}</h2>
        <button type="button" className="bar-btn strong" onClick={p.onClose}>{t.done}</button>
      </header>
      <h2 className="side-title">{t.myCalendars}</h2>
      <ul className="cal-list">
        {doc.collections.map((c) => {
          const name = displayName(c, t);
          const isOpen = open === c.id;
          return (
            <li key={c.id} className={isOpen ? "open" : ""}>
              <div className="cal-row">
                <Check on={!p.hidden.has(c.id)} color={c.color} label={`${t.show}: ${name}`} onClick={() => p.onToggle(c.id)} />
                <span className="cal-name" dir="auto">{name}</span>
                <span className="cal-count">{counts.get(c.id) ?? 0}</span>
                <button type="button" className="cal-more" aria-expanded={isOpen} aria-label={`${t.options}: ${name}`} onClick={() => openOptions(c)}>⋯</button>
              </div>
              {isOpen && draft && (
                <div className="cal-options">
                  <input value={draft.name} placeholder={t.calendarNamePh} maxLength={60} aria-label={t.calendarNamePh}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <div className="swatches" role="radiogroup" aria-label={t.colorLabel}>
                    {COLLECTION_COLORS.map((col) => (
                      <button key={col} type="button" role="radio" aria-checked={draft.color === col} aria-label={col}
                        className={draft.color === col ? "swatch on" : "swatch"} style={{ background: col }} onClick={() => setDraft({ ...draft, color: col })} />
                    ))}
                  </div>
                  <button type="button" className="opt primary-opt" onClick={() => run(async () => { await p.onUpdate(c.id, draft.name, draft.color); setOpen(null); })}>{t.done}</button>
                  {p.serverFeeds && (
                    <button type="button" className="opt" onClick={() => copy(c.id, webcal(`/calendar.ics?collection=${c.id}`))}>
                      {copied === c.id ? t.linkCopied : `🔗 ${t.appleLink}`}
                    </button>
                  )}
                  <button type="button" className="opt" onClick={() => exportIcs(doc.events.filter((e) => e.collectionId === c.id), name)}>⤓ {t.exportIcs}</button>
                  <button type="button" className="opt" onClick={() => exportJson(doc, [c], name)}>⤓ {t.exportJson}</button>
                  {doc.collections.length > 1 ? (
                    <button type="button" className={armedDelete === c.id ? "opt danger armed" : "opt danger"}
                      onClick={() => armedDelete === c.id ? run(async () => { await p.onDelete(c.id); setOpen(null); }) : setArmedDelete(c.id)}>
                      {armedDelete === c.id ? t.confirmDeleteCalendar(counts.get(c.id) ?? 0) : t.deleteCalendar}
                    </button>
                  ) : <p className="muted small">{t.lastCalendar}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {creating ? (
        <form className="cal-options new" onSubmit={(e) => { e.preventDefault(); run(async () => { await p.onCreate(creating.name.trim(), creating.color); setCreating(null); }); }}>
          <input autoFocus value={creating.name} placeholder={t.calendarNamePh} maxLength={60} aria-label={t.calendarNamePh}
            onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
          <div className="swatches" role="radiogroup" aria-label={t.colorLabel}>
            {COLLECTION_COLORS.map((col) => (
              <button key={col} type="button" role="radio" aria-checked={creating.color === col} aria-label={col}
                className={creating.color === col ? "swatch on" : "swatch"} style={{ background: col }} onClick={() => setCreating({ ...creating, color: col })} />
            ))}
          </div>
          <div className="row-actions">
            <button type="button" className="opt" onClick={() => setCreating(null)}>{t.cancel}</button>
            <button type="submit" className="opt primary-opt" disabled={!creating.name.trim()}>{t.create}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="side-add" onClick={() => {
          const used = new Set(doc.collections.map((c) => c.color));
          setCreating({ name: "", color: COLLECTION_COLORS.find((c) => !used.has(c)) ?? COLLECTION_COLORS[0] });
        }}>+ {t.newCalendar}</button>
      )}

      <div className="side-export">
        <span className="muted small">{t.exportAll}</span>
        <div className="row-actions">
          <button type="button" className="opt" dir="ltr" onClick={() => exportIcs(doc.events, t.appName)}>.ics</button>
          <button type="button" className="opt" dir="ltr" onClick={() => exportJson(doc, doc.collections, t.appName)}>.json</button>
        </div>
        <span className="muted small">{t.exportNote}</span>
      </div>

      <h2 className="side-title">{t.builtIn}</h2>
      <ul className="cal-list">
        <li className={open === "holidays" ? "open" : ""}>
          <div className="cal-row">
            <Check on={p.holidays.enabled} color="var(--holiday)" label={`${t.show}: ${t.holidaysName}`}
              onClick={() => p.onHolidays({ ...p.holidays, enabled: !p.holidays.enabled })} />
            <span className="cal-name">{t.holidaysName}</span>
            <button type="button" className="cal-more" aria-expanded={open === "holidays"} aria-label={`${t.options}: ${t.holidaysName}`}
              onClick={() => setOpen(open === "holidays" ? null : "holidays")}>⋯</button>
          </div>
          {open === "holidays" && (
            <div className="cal-options">
              <span className="muted small">{t.region}</span>
              <div className="segmented small-seg">
                {(["il", "diaspora"] as const).map((r) => (
                  <button key={r} type="button" className={p.holidays.region === r ? "on neutral" : ""} aria-pressed={p.holidays.region === r}
                    onClick={() => p.onHolidays({ ...p.holidays, region: r })}>{t.regions[r]}</button>
                ))}
              </div>
              <div className="cat-list">
                {HOLIDAY_CATEGORIES.map((c: HolidayCategory) => {
                  const on = p.holidays.categories.includes(c);
                  return (
                    <label key={c} className="cat-item">
                      <input type="checkbox" checked={on} onChange={() => p.onHolidays({
                        ...p.holidays,
                        categories: on ? p.holidays.categories.filter((x) => x !== c) : [...p.holidays.categories, c],
                      })} />
                      <span>{t.holidayCats[c]}</span>
                    </label>
                  );
                })}
              </div>
              {p.holidayFeed && (
                <button type="button" className="opt" onClick={() => copy("holidays", webcal(holidayFeed))}>
                  {copied === "holidays" ? t.linkCopied : `🔗 ${t.appleLink}`}
                </button>
              )}
            </div>
          )}
        </li>
      </ul>
      {error && <p className="error small" role="alert">{error}</p>}
    </aside>
  );
}
