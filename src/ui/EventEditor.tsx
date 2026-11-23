"use client";
import { useMemo, useState } from "react";
import { CALENDAR_IDS, getCalendar } from "@/core/calendars/registry";
import type { CalendarDate, CalendarId, Locale, SkipPolicy } from "@/core/calendars/types";
import { expandEvent, ruleMayHitMissingDate } from "@/core/events/expand";
import { createEvent, FREQUENCIES, validateEventInput, type EventInput, type Frequency, type UCEvent } from "@/core/events/schema";
import { describeRule } from "@/core/events/describe";
import type { EpochDay } from "@/core/time/epochDay";
import type { Strings } from "./i18n";

interface Props {
  locale: Locale;
  t: Strings;
  today: EpochDay;
  existing?: UCEvent;
  initialDate: CalendarDate;
  onSave: (input: EventInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function EventEditor(p: Props) {
  const { t, locale } = p;
  const ex = p.existing;
  const [title, setTitle] = useState(ex?.title ?? "");
  const [description, setDescription] = useState(ex?.description ?? "");
  const [date, setDate] = useState<CalendarDate>(ex?.start ?? p.initialDate);
  const exRule = ex?.recurrenceRules?.[0];
  // "none" = one-time. New events default to yearly (birthdays, anniversaries).
  const [frequency, setFrequency] = useState<Frequency | "none">(ex ? exRule?.frequency ?? "none" : "yearly");
  const [interval, setInterval_] = useState<number>(exRule?.interval ?? 1);
  const [skip, setSkip] = useState<SkipPolicy>(ex?.recurrenceRules?.[0]?.skip ?? "forward");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const cal = getCalendar(date.calendar);
  const months = cal.monthsInYear(date.year);
  const days = cal.daysInMonth(date.year, date.monthCode) ?? 29;

  /** Changing the calendar re-expresses the SAME absolute day in the other calendar. */
  function switchCalendar(id: CalendarId) {
    if (id === date.calendar) return;
    const day = cal.toEpochDay(date);
    setDate(getCalendar(id).fromEpochDay(day));
  }
  function setPart(part: Partial<CalendarDate>) {
    const next = { ...date, ...part };
    if (cal.daysInMonth(next.year, next.monthCode) === null) // e.g. Adar I in a common Hebrew year
      next.monthCode = cal.substituteMissingMonth(next.year, next.monthCode, "forward") ?? cal.monthsInYear(next.year)[0].monthCode;
    next.day = Math.min(next.day, cal.daysInMonth(next.year, next.monthCode)!);
    setDate(next);
  }

  const input: EventInput = {
    title,
    description: description || undefined,
    start: date,
    recurrenceRules: frequency !== "none"
      ? [{ "@type": "RecurrenceRule", frequency, interval, rscale: date.calendar, ...(frequency === "monthly" || frequency === "yearly" ? { skip } : {}) }]
      : undefined,
  };
  const existingOrDraftRule = () => {
    const v = validateEventInput({ ...input, title: input.title || "x" });
    return v.ok ? <p className="hint" dir="auto">{describeRule(createEvent(v.value, "d"), locale)}</p> : null;
  };
  const missing = frequency !== "none" && ruleMayHitMissingDate(cal, date, frequency);

  const preview = useMemo(() => {
    const v = validateEventInput({ ...input, title: input.title || "preview" });
    if (!v.ok) return [];
    const e = createEvent(v.value, "preview");
    const horizon = frequency === "daily" ? 40 * interval : frequency === "weekly" ? 300 * interval : 366 * 12 * Math.max(1, frequency === "yearly" ? interval : 1);
    return expandEvent(e, { start: Math.min(p.today, cal.toEpochDay(date)), end: p.today + horizon }).slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(input), p.today]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validateEventInput(input);
    if (!v.ok) { setError(v.errors.join(", ")); return; }
    setBusy(true);
    setError(null);
    try {
      await p.onSave(v.value);
      p.onClose();
    } catch (err) {
      setError(`${t.errorPrefix} ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!p.onDelete) return;
    // In-dialog two-step confirmation (window.confirm is blocked in sandboxed frames).
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setBusy(true);
    try { await p.onDelete(); p.onClose(); } catch (err) { setError(`${t.errorPrefix} ${(err as Error).message}`); setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <form className="modal" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="editor-title" onKeyDown={(e) => e.key === "Escape" && p.onClose()}>
        <h2 id="editor-title">{ex ? t.editEvent : t.newEvent}</h2>

        <label className="field">
          <span>{t.title}</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.titlePlaceholder} maxLength={200} required />
        </label>

        <fieldset className="field">
          <legend>{t.calendar}</legend>
          <div className="segmented">
            {CALENDAR_IDS.slice().reverse().map((id) => (
              <button type="button" key={id} className={id === date.calendar ? `on cal-${id}` : ""} aria-pressed={id === date.calendar} onClick={() => switchCalendar(id)}>
                {getCalendar(id).calendarName(locale)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="date-row">
          <label className="field">
            <span>{t.day}</span>
            <select value={date.day} onChange={(e) => setPart({ day: Number(e.target.value) })}>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{cal.formatDayNumber(d, locale)}</option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>{t.month}</span>
            <select value={date.monthCode} onChange={(e) => setPart({ monthCode: e.target.value })}>
              {months.map((m) => (
                <option key={m.monthCode} value={m.monthCode}>{cal.monthName({ year: date.year, monthCode: m.monthCode }, locale)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.year}</span>
            <input type="number" value={date.year} min={cal.minYear} max={cal.maxYear}
              onChange={(e) => { const y = Number(e.target.value); if (Number.isInteger(y) && y >= cal.minYear && y <= cal.maxYear) setPart({ year: y }); }} />
          </label>
        </div>
        <p className="hint" dir="auto">{cal.formatDate(date, locale)}</p>

        <div className="repeat-row">
          <label className="field">
            <span>{t.repeat}</span>
            <select value={frequency} onChange={(e) => { setFrequency(e.target.value as Frequency | "none"); setInterval_(1); }}>
              <option value="none">{t.repeatNone}</option>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{t.freq[f]}</option>)}
            </select>
          </label>
          {frequency !== "none" && (
            <label className="field every">
              <span>{t.every}</span>
              <div className="every-input">
                <input type="number" min={1} max={1000} value={interval}
                  onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 1000) setInterval_(n); }} />
                <span>{t.unit[frequency](interval)}</span>
              </div>
            </label>
          )}
        </div>
        {frequency !== "none" && existingOrDraftRule()}

        {missing && (
          <label className="field">
            <span>{t.missingPolicy}</span>
            <select value={skip} onChange={(e) => setSkip(e.target.value as SkipPolicy)}>
              {(["forward", "backward", "omit"] as SkipPolicy[]).map((s) => <option key={s} value={s}>{t.skip[s]}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>{t.notes}</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </label>

        {preview.length > 0 && (
          <div className="preview">
            <h3>{t.preview}</h3>
            <ul>
              {preview.map((o) => {
                const others = CALENDAR_IDS.filter((c) => c !== date.calendar).map((c) => getCalendar(c));
                return (
                  <li key={o.key}>
                    <strong dir="auto">{cal.formatDate(o.native, locale)}</strong>
                    {others.map((oc) => <span key={oc.id} dir="auto"> · {oc.formatDate(oc.fromEpochDay(o.epochDay), locale)}</span>)}
                    {o.adjustment !== "none" && <em> ({t.occurrenceAdjusted})</em>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="actions">
          {p.onDelete && <button type="button" className={confirmingDelete ? "danger armed" : "danger"} onClick={remove} disabled={busy}>{confirmingDelete ? t.confirmDelete : t.delete}</button>}
          <span className="spacer" />
          <button type="button" onClick={p.onClose} disabled={busy}>{t.cancel}</button>
          <button type="submit" className="primary" disabled={busy || !title.trim()}>{busy ? t.saving : t.save}</button>
        </div>
      </form>
    </div>
  );
}
