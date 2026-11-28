"use client";
/**
 * Side panel (modelled on Apple Calendar's calendar list). One list for every calendar:
 *  - regular calendars hold the user's events;
 *  - computed calendars (Jewish holidays …) fill themselves in from rules and have settings instead.
 * Each has a colour, show/hide, its own feed link, export and delete. Export can combine any of them.
 */
import { useState } from "react";
import {
  COLLECTION_COLORS, DEFAULT_JEWISH_SETTINGS, isComputed, JEWISH_COLOR,
  type Collection, type CollectionInput, type EventStoreDocument, type JewishCalendarSettings,
} from "@/core/events/schema";
import { HOLIDAY_CATEGORIES, type HolidayCategory } from "@/core/holidays/types";
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";
import { exportIcs, exportJson } from "./export";
import { withFeedToken } from "./repository";
import type { ImportOutcome } from "./importFile";

interface Props {
  /** Closes the panel (used by the sheet's Done button on phones). */
  onClose: () => void;
  t: Strings;
  locale: Locale;
  doc: EventStoreDocument;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  /** Feed links only exist when calendars live on the server. */
  serverFeeds: boolean;
  onCreate: (input: CollectionInput) => Promise<void>;
  onUpdate: (id: string, input: CollectionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Viewer of a public calendar (not signed in): links and exports only, no changes. */
  readOnly?: boolean;
  /** Import a .json backup (absent when importing is not allowed). */
  onImportFile?: (file: File) => Promise<ImportOutcome>;
}

export function displayName(c: Collection, t: Strings) {
  return c.name || (isComputed(c) ? t.holidaysName : c.id === "personal" ? t.defaultCollection : t.newCalendar);
}

type Draft = { name: string; color: string; kind: "events" | "jewish"; jewish: JewishCalendarSettings };

/** Region + categories of a computed Jewish calendar (like Hebcal's options). */
function JewishSettings({ t, value, onChange }: { t: Strings; value: JewishCalendarSettings; onChange: (v: JewishCalendarSettings) => void }) {
  return (
    <>
      <span className="muted small">{t.region}</span>
      <div className="segmented small-seg">
        {(["il", "diaspora"] as const).map((r) => (
          <button key={r} type="button" className={value.region === r ? "on neutral" : ""} aria-pressed={value.region === r}
            onClick={() => onChange({ ...value, region: r })}>{t.regions[r]}</button>
        ))}
      </div>
      <div className="cat-list">
        {HOLIDAY_CATEGORIES.map((c: HolidayCategory) => {
          const on = value.categories.includes(c);
          return (
            <label key={c} className="cat-item">
              <input type="checkbox" checked={on} onChange={() => onChange({
                ...value, categories: on ? value.categories.filter((x) => x !== c) : HOLIDAY_CATEGORIES.filter((x) => x === c || value.categories.includes(x)),
              })} />
              <span>{t.holidayCats[c]}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function Swatches({ t, value, onChange }: { t: Strings; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={t.colorLabel}>
      {COLLECTION_COLORS.map((col) => (
        <button key={col} type="button" role="radio" aria-checked={value === col} aria-label={col}
          className={value === col ? "swatch on" : "swatch"} style={{ background: col }} onClick={() => onChange(col)} />
      ))}
    </div>
  );
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ busy?: boolean } & Partial<ImportOutcome> | null>(null);
  // Export: which calendars to include (all by default)
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const { copied, copy } = useCopy();

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  const counts = new Map<string, number>();
  for (const e of doc.events) counts.set(e.collectionId, (counts.get(e.collectionId) ?? 0) + 1);
  const eventCalendars = doc.collections.filter((c) => !isComputed(c)).length;

  const openOptions = (c: Collection) => {
    setArmedDelete(null);
    if (open === c.id) { setOpen(null); return; }
    setOpen(c.id);
    setDraft({ name: c.name, color: c.color, kind: isComputed(c) ? "jewish" : "events", jewish: c.jewish ?? DEFAULT_JEWISH_SETTINGS });
  };
  const save = (c: Collection, d: Draft) => p.onUpdate(c.id, { name: d.name.trim(), color: d.color, ...(isComputed(c) ? { jewish: d.jewish } : {}) });

  const chosen = doc.collections.filter((c) => !excluded.has(c.id));
  const allChosen = chosen.length === doc.collections.length;

  return (
    <aside className="sidebar" id="calendars-panel" aria-label={t.calendars}>
      <div className="grabber" aria-hidden />
      <header className="side-bar">
        <h2>{t.calendars}</h2>
        <button type="button" className="bar-btn strong" onClick={p.onClose}>{t.done}</button>
      </header>
      <ul className="cal-list">
        {doc.collections.map((c) => {
          const name = displayName(c, t);
          const isOpen = open === c.id;
          const computed = isComputed(c);
          return (
            <li key={c.id} className={isOpen ? "open" : ""}>
              <div className="cal-row">
                <Check on={!p.hidden.has(c.id)} color={c.color} label={`${t.show}: ${name}`} onClick={() => p.onToggle(c.id)} />
                <span className="cal-name" dir="auto">{name}</span>
                <span className="cal-count">{computed ? t.computedTag : counts.get(c.id) ?? 0}</span>
                <button type="button" className="cal-more" aria-expanded={isOpen} aria-label={`${t.options}: ${name}`} onClick={() => openOptions(c)}>⋯</button>
              </div>
              {isOpen && draft && (
                <div className="cal-options">
                  {!p.readOnly && (<>
                  <input value={draft.name} placeholder={computed ? t.holidaysName : t.calendarNamePh} maxLength={60} aria-label={t.calendarNamePh}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <Swatches t={t} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
                  {computed && <JewishSettings t={t} value={draft.jewish} onChange={(jewish) => setDraft({ ...draft, jewish })} />}
                  <button type="button" className="opt primary-opt" onClick={() => run(async () => { await save(c, draft); setOpen(null); })}>{t.done}</button>
                  </>)}
                  {p.serverFeeds && (
                    <button type="button" className="opt" onClick={() => copy(c.id, webcal(`/calendar.ics?collection=${c.id}&lang=${p.locale}`))}>
                      {copied === c.id ? t.linkCopied : `🔗 ${t.appleLink}`}
                    </button>
                  )}
                  <button type="button" className="opt" onClick={() => exportIcs(doc, [c.id], name, p.locale)}>⤓ {t.exportIcs}</button>
                  <button type="button" className="opt" onClick={() => exportJson(doc, [c], name)}>⤓ {t.exportJson}</button>
                  {p.readOnly ? null : computed || eventCalendars > 1 ? (
                    <button type="button" className={armedDelete === c.id ? "opt danger armed" : "opt danger"}
                      onClick={() => armedDelete === c.id ? run(async () => { await p.onDelete(c.id); setOpen(null); }) : setArmedDelete(c.id)}>
                      {armedDelete === c.id ? (computed ? `${t.deleteComputed}?` : t.confirmDeleteCalendar(counts.get(c.id) ?? 0)) : computed ? t.deleteComputed : t.deleteCalendar}
                    </button>
                  ) : <p className="muted small">{t.lastCalendar}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {p.readOnly ? null : creating ? (
        <form className="cal-options new" onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await p.onCreate({ name: creating.name.trim(), color: creating.color, kind: creating.kind, ...(creating.kind === "jewish" ? { jewish: creating.jewish } : {}) });
            setCreating(null);
          });
        }}>
          <span className="muted small">{t.calendarType}</span>
          <div className="segmented small-seg">
            {(["events", "jewish"] as const).map((k) => (
              <button key={k} type="button" className={creating.kind === k ? "on neutral" : ""} aria-pressed={creating.kind === k}
                onClick={() => setCreating({ ...creating, kind: k, color: k === "jewish" && !doc.collections.some((c) => c.color === JEWISH_COLOR) ? JEWISH_COLOR : creating.color })}>
                {k === "events" ? t.kindEvents : t.kindJewish}
              </button>
            ))}
          </div>
          <input autoFocus value={creating.name} placeholder={creating.kind === "jewish" ? t.holidaysName : t.calendarNamePh} maxLength={60} aria-label={t.calendarNamePh}
            onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
          <Swatches t={t} value={creating.color} onChange={(color) => setCreating({ ...creating, color })} />
          {creating.kind === "jewish" && (<>
            <p className="muted small">{t.kindHelpJewish}</p>
            <JewishSettings t={t} value={creating.jewish} onChange={(jewish) => setCreating({ ...creating, jewish })} />
          </>)}
          <div className="row-actions">
            <button type="button" className="opt" onClick={() => setCreating(null)}>{t.cancel}</button>
            <button type="submit" className="opt primary-opt" disabled={creating.kind === "events" && !creating.name.trim()}>{t.create}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="side-add" onClick={() => {
          const used = new Set(doc.collections.map((c) => c.color));
          setCreating({ name: "", color: COLLECTION_COLORS.find((c) => !used.has(c)) ?? COLLECTION_COLORS[0], kind: "events", jewish: { ...DEFAULT_JEWISH_SETTINGS, categories: [...DEFAULT_JEWISH_SETTINGS.categories] } });
        }}>+ {t.newCalendar}</button>
      )}

      <div className="side-export">
        <span className="muted small">{t.exportAll} · {t.exportPick}</span>
        <div className="export-pick">
          {doc.collections.map((c) => (
            <label key={c.id} className="cat-item">
              <input type="checkbox" checked={!excluded.has(c.id)} onChange={() => {
                const next = new Set(excluded);
                if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                setExcluded(next);
              }} />
              <span className="pick-dot" style={{ background: c.color }} aria-hidden />
              <span dir="auto">{displayName(c, t)}</span>
            </label>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="opt" dir="ltr" disabled={!chosen.length}
            onClick={() => exportIcs(doc, allChosen ? null : chosen.map((c) => c.id), t.appName, p.locale)}>.ics</button>
          <button type="button" className="opt" dir="ltr" disabled={!chosen.length} onClick={() => exportJson(doc, chosen, t.appName)}>.json</button>
        </div>
        <span className="muted small">{t.exportNote}</span>
      </div>
      {p.onImportFile && !p.readOnly && (
        <div className="side-export">
          <span className="muted small">{t.importTitle}</span>
          <div className="row-actions">
            <label className={`opt${importing?.busy ? " disabled" : ""}`}>
              {importing?.busy ? t.importWorking : t.importButton}
              <input type="file" accept=".json,application/json" hidden disabled={importing?.busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (f && p.onImportFile) { setImporting({ busy: true }); void p.onImportFile(f).then(setImporting); }
                }} />
            </label>
          </div>
          {importing?.message && (
            <span className={`small${importing.error ? " import-error" : " muted"}`} role="status">
              {importing.message}
              {importing.problems && importing.problems.length > 0 && <> {t.importProblems(importing.problems.length)} {importing.problems.slice(0, 5).join(" · ")}</>}
            </span>
          )}
        </div>
      )}

      {error && <p className="error small" role="alert">{error}</p>}
    </aside>
  );
}
