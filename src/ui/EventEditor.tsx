"use client";
/**
 * Event editor as a sheet (bottom sheet on phones), with grouped rows.
 * Repeat options follow Apple Calendar's model: Never / Every Day / Every Week /
 * Every 2 Weeks / Every Month / Every Year / Custom…, plus "End Repeat" (never or on a date).
 * A repeat always starts from the event's own date. Months and years are counted in the
 * event's calendar (a Hebrew monthly event follows Hebrew months).
 */
import { useMemo, useState } from "react";
import { CALENDAR_IDS, getCalendar } from "@/core/calendars/registry";
import type { CalendarAdapter, CalendarDate, CalendarId, Locale, SkipPolicy } from "@/core/calendars/types";
import { describeRule } from "@/core/events/describe";
import { expandEvent, ruleMayHitMissingDate } from "@/core/events/expand";
import { createEvent, FREQUENCIES, validateEventInput, type EventInput, type Frequency, type UCEvent } from "@/core/events/schema";
import type { EpochDay } from "@/core/time/epochDay";
import type { Strings } from "./i18n";
import { YearInput } from "./YearInput";

interface Props {
  locale: Locale;
  t: Strings;
  today: EpochDay;
  existing?: UCEvent;
  initialDate: CalendarDate;
  onSave: (input: EventInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  collections: { id: string; name: string; color: string }[];
  defaultCollectionId: string;
}

type Preset = "never" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";
const PRESETS: Record<Exclude<Preset, "never" | "custom">, { frequency: Frequency; interval: number }> = {
  daily: { frequency: "daily", interval: 1 },
  weekly: { frequency: "weekly", interval: 1 },
  biweekly: { frequency: "weekly", interval: 2 },
  monthly: { frequency: "monthly", interval: 1 },
  yearly: { frequency: "yearly", interval: 1 },
};
function presetOf(frequency?: Frequency, interval = 1): Preset {
  if (!frequency) return "never";
  const hit = (Object.entries(PRESETS) as [Preset, { frequency: Frequency; interval: number }][])
    .find(([, v]) => v.frequency === frequency && v.interval === interval);
  return hit ? hit[0] : "custom";
}

/** Day / month / year pickers for a date in one calendar. */
function DateFields({ cal, value, onChange, locale, t }: {
  cal: CalendarAdapter; value: CalendarDate; onChange: (d: CalendarDate) => void; locale: Locale; t: Strings;
}) {
  const set = (part: Partial<CalendarDate>) => {
    const next = { ...value, ...part };
    if (cal.daysInMonth(next.year, next.monthCode) === null) // e.g. Adar I in a common Hebrew year
      next.monthCode = cal.substituteMissingMonth(next.year, next.monthCode, "forward") ?? cal.monthsInYear(next.year)[0].monthCode;
    next.day = Math.min(next.day, cal.daysInMonth(next.year, next.monthCode)!);
    onChange(next);
  };
  const days = cal.daysInMonth(value.year, value.monthCode) ?? 29;
  return (
    <div className="date-fields">
      <select aria-label={t.day} value={value.day} onChange={(e) => set({ day: Number(e.target.value) })}>
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{cal.formatDayNumber(d, locale)}</option>)}
      </select>
      <select aria-label={t.month} value={value.monthCode} onChange={(e) => set({ monthCode: e.target.value })}>
        {cal.monthsInYear(value.year).map((m) => (
          <option key={m.monthCode} value={m.monthCode}>{cal.monthName({ year: value.year, monthCode: m.monthCode }, locale)}</option>
        ))}
      </select>
      <YearInput className="year" value={value.year} min={cal.minYear} max={cal.maxYear} ariaLabel={t.year} onCommit={(y) => set({ year: y })} />
    </div>
  );
}

export function EventEditor(p: Props) {
  const { t, locale } = p;
  const ex = p.existing;
  const exRule = ex?.recurrenceRules?.[0];
  const [title, setTitle] = useState(ex?.title ?? "");
  const [description, setDescription] = useState(ex?.description ?? "");
  const [date, setDate] = useState<CalendarDate>(ex?.start ?? p.initialDate);
  // Apple's default for a new event: does not repeat.
  const [preset, setPreset] = useState<Preset>(presetOf(exRule?.frequency, exRule?.interval));
  const [customFreq, setCustomFreq] = useState<Frequency>(exRule?.frequency ?? "weekly");
  const [customInterval, setCustomInterval] = useState<number>(exRule?.interval ?? 1);
  const [until, setUntil] = useState<CalendarDate | null>(exRule?.until ?? null);
  const [skip, setSkip] = useState<SkipPolicy>(exRule?.skip ?? "forward");
  const [collectionId, setCollectionId] = useState(ex?.collectionId ?? p.defaultCollectionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const cal = getCalendar(date.calendar);
  const frequency: Frequency | null = preset === "never" ? null : preset === "custom" ? customFreq : PRESETS[preset].frequency;
  const interval = preset === "custom" ? customInterval : 1 + (preset === "biweekly" ? 1 : 0);
  // An end date is kept in the event's calendar and never before the start.
  const untilDate = until && frequency ? (cal.toEpochDay(until) >= cal.toEpochDay(date) ? until : date) : null;

  /** Switching the calendar re-expresses the same absolute days (start and end) in the other calendar. */
  function switchCalendar(id: CalendarId) {
    if (id === date.calendar) return;
    const target = getCalendar(id);
    setDate(target.fromEpochDay(cal.toEpochDay(date)));
    if (until) setUntil(target.fromEpochDay(getCalendar(until.calendar).toEpochDay(until)));
  }

  const input: EventInput = {
    title,
    description: description || undefined,
    start: date,
    collectionId,
    recurrenceRules: frequency
      ? [{
          "@type": "RecurrenceRule", frequency, interval, rscale: date.calendar,
          ...(frequency === "monthly" || frequency === "yearly" ? { skip } : {}),
          // An older rule's "repeats from" date is preserved untouched (no longer offered in the UI).
          ...(exRule?.from && exRule.from.calendar === date.calendar ? { from: exRule.from } : {}),
          ...(untilDate ? { until: untilDate } : {}),
        }]
      : undefined,
  };
  const draft = useMemo(() => {
    const v = validateEventInput({ ...input, title: input.title || "—" });
    return v.ok ? createEvent(v.value, "draft") : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(input)]);
  const missing = frequency !== null && ruleMayHitMissingDate(cal, date, frequency);

  const preview = useMemo(() => {
    if (!draft || !frequency) return [];
    const horizon = frequency === "daily" ? 40 * interval : frequency === "weekly" ? 300 * interval : 366 * 12 * (frequency === "yearly" ? interval : 1);
    return expandEvent(draft, { start: Math.min(p.today, cal.toEpochDay(date)), end: p.today + horizon }).slice(0, 4);
  }, [draft, frequency, interval, p.today, cal, date]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validateEventInput(input);
    if (!v.ok) { setError(v.errors.join(", ")); return; }
    setBusy(true);
    setError(null);
    try { await p.onSave(v.value); p.onClose(); }
    catch (err) { setError(`${t.errorPrefix} ${(err as Error).message}`); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!p.onDelete) return;
    // In-sheet two-step confirmation (window.confirm is blocked in sandboxed frames).
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setBusy(true);
    try { await p.onDelete(); p.onClose(); } catch (err) { setError(`${t.errorPrefix} ${(err as Error).message}`); setBusy(false); }
  }

  const otherCals = CALENDAR_IDS.filter((c) => c !== date.calendar).map((c) => getCalendar(c));
  const collection = p.collections.find((c) => c.id === collectionId);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <form className="sheet" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="editor-title" onKeyDown={(e) => e.key === "Escape" && p.onClose()}>
        <div className="grabber" aria-hidden />
        <header className="sheet-bar">
          <button type="button" className="bar-btn" onClick={p.onClose} disabled={busy}>{t.cancel}</button>
          <h2 id="editor-title">{ex ? t.editEvent : t.newEvent}</h2>
          <button type="submit" className="bar-btn strong" disabled={busy || !title.trim()}>{busy ? t.saving : ex ? t.done : t.add}</button>
        </header>

        <div className="sheet-body">
          <section className="group">
            <input className="row-input title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t.titlePlaceholder} maxLength={200} required aria-label={t.title} dir="auto" />
          </section>

          <section className="group">
            <div className="row">
              <span className="row-label">{t.calendar}</span>
              <div className="segmented">
                {CALENDAR_IDS.slice().reverse().map((id) => (
                  <button type="button" key={id} className={id === date.calendar ? `on cal-${id}` : ""} aria-pressed={id === date.calendar} onClick={() => switchCalendar(id)}>
                    {getCalendar(id).calendarName(locale)}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="row-label">{t.date}</span>
              <DateFields cal={cal} value={date} onChange={setDate} locale={locale} t={t} />
            </div>
            <div className="row sub" dir="auto">
              {cal.formatDate(date, locale)}
              {otherCals.map((oc) => <span key={oc.id}> · {oc.formatDate(oc.fromEpochDay(cal.toEpochDay(date)), locale)}</span>)}
            </div>
          </section>

          <section className="group">
            <label className="row">
              <span className="row-label">{t.repeat}</span>
              <select className="row-select" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                {(["never", "daily", "weekly", "biweekly", "monthly", "yearly", "custom"] as Preset[]).map((k) => (
                  <option key={k} value={k}>{t.repeatPresets[k]}</option>
                ))}
              </select>
            </label>
            {preset === "custom" && (
              <div className="row">
                <span className="row-label">{t.every}</span>
                <div className="every-input">
                  <input type="number" min={1} max={1000} value={customInterval} aria-label={t.every}
                    onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 1000) setCustomInterval(n); }} />
                  <select value={customFreq} onChange={(e) => setCustomFreq(e.target.value as Frequency)} aria-label={t.repeat}>
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{t.unit[f](customInterval)}</option>)}
                  </select>
                </div>
              </div>
            )}
            {frequency && (
              <label className="row">
                <span className="row-label">{t.endRepeat}</span>
                <select className="row-select" value={untilDate ? "date" : "never"}
                  onChange={(e) => setUntil(e.target.value === "date" ? cal.fromEpochDay(Math.max(cal.toEpochDay(date), p.today) + 365) : null)}>
                  <option value="never">{t.endNever}</option>
                  <option value="date">{t.endOnDate}</option>
                </select>
              </label>
            )}
            {frequency && untilDate && (
              <div className="row">
                <span className="row-label">{t.endDate}</span>
                <DateFields cal={cal} value={untilDate} onChange={setUntil} locale={locale} t={t} />
              </div>
            )}
            {missing && (
              <label className="row">
                <span className="row-label">{t.missingShort}</span>
                <select className="row-select" value={skip} onChange={(e) => setSkip(e.target.value as SkipPolicy)} title={t.missingPolicy}>
                  {(["forward", "backward", "omit"] as SkipPolicy[]).map((s) => <option key={s} value={s}>{t.skipShort[s]}</option>)}
                </select>
              </label>
            )}
            {frequency && draft && <div className="row sub" dir="auto">{describeRule(draft, locale, missing)}</div>}
          </section>

          {p.collections.length > 1 && (
            <section className="group">
              <label className="row">
                <span className="row-label">{t.calendarField}</span>
                <span className="dot" style={{ background: collection?.color }} aria-hidden />
                <select className="row-select" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                  {p.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </section>
          )}

          <section className="group">
            <textarea className="row-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t.notes} aria-label={t.notes} maxLength={5000} dir="auto" />
          </section>

          {preview.length > 0 && (
            <>
              <h3 className="group-title">{t.preview}</h3>
              <section className="group">
                {preview.map((o) => (
                  <div className="row preview-row" key={o.key}>
                    <strong dir="auto">{cal.formatDate(o.native, locale)}</strong>
                    <span className="row-value" dir="auto">
                      {otherCals.map((oc) => oc.formatDate(oc.fromEpochDay(o.epochDay), locale)).join(" · ")}
                      {o.adjustment !== "none" && ` (${t.occurrenceAdjusted})`}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          {p.onDelete && (
            <section className="group">
              <button type="button" className={`row danger-row${confirmingDelete ? " armed" : ""}`} onClick={remove} disabled={busy}>
                {confirmingDelete ? t.confirmDelete : t.deleteEvent}
              </button>
            </section>
          )}
        </div>
      </form>
    </div>
  );
}
