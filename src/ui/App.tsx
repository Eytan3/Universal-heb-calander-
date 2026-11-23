"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCalendar, gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate, CalendarId, Locale, YearMonth } from "@/core/calendars/types";
import { byDay, expandAll } from "@/core/events/expand";
import { describeRule } from "@/core/events/describe";
import type { EventInput, UCEvent } from "@/core/events/schema";
import { todayEpochDay, type EpochDay } from "@/core/time/epochDay";
import { EventEditor } from "./EventEditor";
import { STRINGS } from "./i18n";
import { MonthView } from "./MonthView";
import { SettingsDialog } from "./SettingsDialog";
import { isPreview } from "./preview";
import { applyTheme, readTheme, type Theme } from "./theme";
import { AuthRequiredError, chooseRepository, setEditToken, type EventRepository } from "./repository";

type EditorState = { existing?: UCEvent; date: CalendarDate } | null;

const MODE_KEY = "universal-calendar:mode";

const ymOf = (calendar: CalendarId, day: EpochDay): YearMonth => {
  const d = getCalendar(calendar).fromEpochDay(day);
  return { year: d.year, monthCode: d.monthCode };
};

export default function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [today, setToday] = useState<EpochDay | null>(null);
  const [repo, setRepo] = useState<EventRepository | null>(null);
  const [events, setEvents] = useState<UCEvent[]>([]);
  /** Display mode: the main calendar of the single month view; the other appears as secondary labels. */
  const [primary, setPrimary] = useState<CalendarId>("hebrew");
  const [ym, setYm] = useState<YearMonth | null>(null);
  const [selected, setSelected] = useState<EpochDay | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [needToken, setNeedToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Lazy init so the first effect never overwrites the saved choice (theme isn't in the SSR markup).
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "system" : readTheme()));
  const [addCalendar, setAddCalendar] = useState<CalendarId>("hebrew");
  const t = STRINGS[locale];

  useEffect(() => {
    const saved = (() => { try { return localStorage.getItem("universal-calendar:locale"); } catch { return null; } })();
    if (saved === "he" || saved === "en") setLocale(saved);
    const d = todayEpochDay();
    setToday(d);
    setSelected(d);
    const savedMode = (() => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } })();
    const mode: CalendarId = savedMode === "gregory" ? "gregory" : "hebrew";
    setPrimary(mode);
    setAddCalendar(mode);
    setYm(ymOf(mode, d));
    chooseRepository().then(setRepo);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    try { localStorage.setItem("universal-calendar:locale", locale); } catch { /* ignore */ }
  }, [locale]);

  useEffect(() => applyTheme(theme), [theme]);

  const reload = useCallback(async () => {
    if (!repo) return;
    try { setEvents(await repo.list()); setLoadError(null); } catch (e) { setLoadError((e as Error).message); }
  }, [repo]);
  useEffect(() => { reload(); }, [reload]);

  const guarded = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      if (e instanceof AuthRequiredError) setNeedToken(true);
      throw e;
    }
  }, [reload]);

  const eventsByUid = useMemo(() => new Map(events.map((e) => [e.uid, e])), [events]);

  // Expand over the visible month (in whichever calendar is primary), then index by absolute day.
  const occurrences = useMemo(() => {
    if (!ym) return new Map();
    const first = getCalendar(primary).toEpochDay({ ...ym, day: 1 });
    return byDay(expandAll(events, { start: first - 1, end: first + 32 }));
  }, [events, ym, primary]);

  // The day list (like Apple Calendar's list under the month): occurrences on the selected day.
  const dayEvents = useMemo(() => (selected === null ? [] : expandAll(events, { start: selected, end: selected + 1 })), [events, selected]);

  if (today === null || !ym) return <main className="loading">{t.loading}</main>;

  const selectDay = (date: CalendarDate, day: EpochDay) => { setSelected(day); setAddCalendar(date.calendar); };
  const addOnDay = (date: CalendarDate, day: EpochDay) => { selectDay(date, day); setEditor({ date }); };
  const openEvent = (uid: string, day: EpochDay) => {
    const ev = eventsByUid.get(uid);
    if (ev) { setSelected(day); setEditor({ existing: ev, date: ev.start }); }
  };

  /** Switch Hebrew·Gregorian ⇄ Gregorian·Hebrew, staying on the same absolute day. */
  const switchMode = (mode: CalendarId) => {
    if (mode === primary) return;
    const anchor = selected ?? getCalendar(primary).toEpochDay({ ...ym, day: 1 });
    setPrimary(mode);
    setAddCalendar(mode);
    setYm(ymOf(mode, anchor));
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  };
  const mainCal = getCalendar(primary);
  const otherCal = primary === "hebrew" ? gregorian : hebrew;

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>{t.appName}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className="top-actions">
          <button type="button" className={`mode-toggle cal-${primary}`} onClick={() => switchMode(primary === "hebrew" ? "gregory" : "hebrew")}
            title={t.modeSwitchTo(t.modes[primary === "hebrew" ? "gregory" : "hebrew"])} aria-label={`${t.modeLabel}: ${t.modes[primary]}. ${t.modeSwitchTo(t.modes[primary === "hebrew" ? "gregory" : "hebrew"])}`}>
            <span className="arrows" aria-hidden>⇄</span>
            <span>{t.modes[primary]}</span>
          </button>
          <button type="button" className="lang" onClick={() => setShowSettings(true)} aria-label={t.settings}>
            <span aria-hidden>⚙︎</span> {t.settings}
          </button>
        </div>
      </header>

      {repo?.kind === "browser" && <p className="banner warn">{isPreview() ? t.previewNote : t.browserOnly}</p>}
      {loadError && <p className="banner error">{loadError}</p>}
      {needToken && (
        <form className="banner warn token" onSubmit={(e) => { e.preventDefault(); setEditToken(tokenDraft); setNeedToken(false); }}>
          <span>{t.tokenNeeded}</span>
          <input type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} aria-label="token" />
          <button type="submit">{t.tokenSave}</button>
        </form>
      )}

      <MonthView key={primary} cal={mainCal} other={otherCal} ym={ym} onNavigate={setYm} locale={locale} t={t} today={today}
        selected={selected} occurrences={occurrences} events={eventsByUid} onDayClick={selectDay} onDayDoubleClick={addOnDay} onEventClick={openEvent} />

      {selected !== null && (() => {
        const g = gregorian.fromEpochDay(selected);
        const weekday = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(Date.UTC(g.year, Number(g.monthCode.slice(1)) - 1, g.day));
        return (
          <section className={`panel day-list cal-${primary}`} aria-live="polite">
            <header className="day-head">
              <div>
                <h2>{selected === today ? `${t.todayTitle} · ${weekday}` : weekday}</h2>
                <p className="day-dates" dir="auto">
                  <strong>{mainCal.formatDate(mainCal.fromEpochDay(selected), locale)}</strong> · {otherCal.formatDate(otherCal.fromEpochDay(selected), locale)}
                </p>
              </div>
              <button type="button" className="add" onClick={() => setEditor({ date: getCalendar(addCalendar).fromEpochDay(selected) })}>
                + {t.addOnDay}
              </button>
            </header>
            {dayEvents.length === 0 ? <p className="muted">{t.noEventsDay}</p> : (
              <ul className="upcoming">
                {dayEvents.map((o) => {
                  const ev = eventsByUid.get(o.eventUid)!;
                  const native = getCalendar(o.native.calendar);
                  return (
                    <li key={o.eventUid + o.key}>
                      <button type="button" className={`up-item cal-${ev.start.calendar}`} onClick={() => setEditor({ existing: ev, date: ev.start })}>
                        <span className="up-title" dir="auto">{ev.title}</span>
                        <span className="up-when">{native.calendarName(locale)}</span>
                        <span className="up-dates" dir="auto">
                          {describeRule(ev, locale)}
                          {o.adjustment !== "none" && ` · ${t.occurrenceAdjusted}`}
                          {ev.description ? ` · ${ev.description}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted small">{t.dayHint}</p>
          </section>
        );
      })()}

      {editor && repo && (
        <EventEditor
          key={editor.existing?.uid ?? `new-${editor.date.calendar}-${editor.date.year}-${editor.date.monthCode}-${editor.date.day}`}
          locale={locale} t={t} today={today} existing={editor.existing} initialDate={editor.date}
          onClose={() => setEditor(null)}
          onSave={(input: EventInput) => guarded(() => (editor.existing ? repo.update(editor.existing.uid, input) : repo.create(input)))}
          onDelete={editor.existing ? () => guarded(() => repo.remove(editor.existing!.uid)) : undefined}
        />
      )}
      {showSettings && (
        <SettingsDialog t={t} locale={locale} onLocale={setLocale} theme={theme} onTheme={setTheme} repo={repo} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}
