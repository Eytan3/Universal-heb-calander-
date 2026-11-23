"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCalendar, gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate, CalendarId, Locale, YearMonth } from "@/core/calendars/types";
import { byDay, expandAll } from "@/core/events/expand";
import { describeRule } from "@/core/events/describe";
import { emptyDocument, type EventInput, type EventStoreDocument, type UCEvent } from "@/core/events/schema";
import { jewishHolidays, type HolidayOccurrence } from "@/core/holidays/registry";
import { CalendarsPanel, displayName } from "./CalendarsPanel";
import { readViewPrefs, saveViewPrefs, DEFAULT_VIEW, type ViewPrefs } from "./viewPrefs";
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
const SIDEBAR_KEY = "universal-calendar:sidebar";

const ymOf = (calendar: CalendarId, day: EpochDay): YearMonth => {
  const d = getCalendar(calendar).fromEpochDay(day);
  return { year: d.year, monthCode: d.monthCode };
};

export default function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [today, setToday] = useState<EpochDay | null>(null);
  const [repo, setRepo] = useState<EventRepository | null>(null);
  const [doc, setDoc] = useState<EventStoreDocument>(() => emptyDocument());
  const [view, setView] = useState<ViewPrefs>(DEFAULT_VIEW);
  /** The calendars panel is closed by default for a clean look; the choice is remembered. */
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setView(readViewPrefs());
    try { setSidebarOpen(localStorage.getItem(SIDEBAR_KEY) === "open"); } catch { /* ignore */ }
    chooseRepository().then(setRepo);
  }, []);

  const updateView = (v: ViewPrefs) => { setView(v); saveViewPrefs(v); };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    try { localStorage.setItem("universal-calendar:locale", locale); } catch { /* ignore */ }
  }, [locale]);

  useEffect(() => applyTheme(theme), [theme]);

  // Keep "today" correct when the tab stays open past midnight.
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayEpochDay();
      setToday((prev) => (prev !== null && prev !== d ? d : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    if (!repo) return;
    try { setDoc(await repo.load()); setLoadError(null); setNeedToken(false); }
    catch (e) { if (e instanceof AuthRequiredError) setNeedToken(true); else setLoadError((e as Error).message); }
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

  // Hidden calendars are filtered for display only; nothing is deleted.
  const hidden = useMemo(() => new Set(view.hiddenCollections), [view.hiddenCollections]);
  const events = useMemo(() => doc.events.filter((e) => !hidden.has(e.collectionId)), [doc.events, hidden]);
  const eventsByUid = useMemo(() => new Map(doc.events.map((e) => [e.uid, e])), [doc.events]);
  const colors = useMemo(() => new Map(doc.collections.map((c) => [c.id, c.color])), [doc.collections]);
  const holidayOpts = view.holidays.enabled ? view.holidays : { ...view.holidays, categories: [] };
  const holidaysIn = useCallback((start: EpochDay, end: EpochDay) => {
    const m = new Map<EpochDay, HolidayOccurrence[]>();
    for (const h of jewishHolidays.occurrences({ start, end }, holidayOpts)) m.set(h.epochDay, [...(m.get(h.epochDay) ?? []), h]);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(holidayOpts)]);

  // Expand over the visible month (in whichever calendar is primary), then index by absolute day.
  const occurrences = useMemo(() => {
    if (!ym) return new Map();
    const first = getCalendar(primary).toEpochDay({ ...ym, day: 1 });
    return byDay(expandAll(events, { start: first - 1, end: first + 32 }));
  }, [events, ym, primary]);
  const monthHolidays = useMemo(() => {
    if (!ym) return new Map<EpochDay, HolidayOccurrence[]>();
    const first = getCalendar(primary).toEpochDay({ ...ym, day: 1 });
    return holidaysIn(first - 1, first + 32);
  }, [holidaysIn, ym, primary]);

  // The day list (like Apple Calendar's list under the month): occurrences on the selected day.
  const dayEvents = useMemo(() => (selected === null ? [] : expandAll(events, { start: selected, end: selected + 1 })), [events, selected]);
  const dayHolidays = selected === null ? [] : monthHolidays.get(selected) ?? holidaysIn(selected, selected + 1).get(selected) ?? [];

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
          <button type="button" className={`sidebar-toggle${sidebarOpen ? " on" : ""}`} aria-expanded={sidebarOpen} aria-controls="calendars-panel"
            title={t.calendars} onClick={() => {
              const next = !sidebarOpen;
              setSidebarOpen(next);
              try { localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed"); } catch { /* ignore */ }
            }}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M7.5 3.5v13" /></svg>
            <span>{t.calendars}</span>
          </button>
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
        <form className="banner warn token" onSubmit={(e) => { e.preventDefault(); setEditToken(tokenDraft); setNeedToken(false); reload(); }}>
          <span>{t.tokenNeeded}</span>
          <input type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} aria-label="token" />
          <button type="submit">{t.tokenSave}</button>
        </form>
      )}

      <div className={`layout${sidebarOpen ? "" : " no-sidebar"}`}>
      {sidebarOpen && <CalendarsPanel t={t} locale={locale} doc={doc} hidden={hidden}
        onToggle={(id) => updateView({ ...view, hiddenCollections: hidden.has(id) ? view.hiddenCollections.filter((x) => x !== id) : [...view.hiddenCollections, id] })}
        holidays={view.holidays} onHolidays={(h) => updateView({ ...view, holidays: h })}
        serverFeeds={repo?.kind === "server"} holidayFeed={!isPreview()}
        onCreate={(name, color) => guarded(() => repo!.createCollection({ name, color }))}
        onUpdate={(id, name, color) => guarded(() => repo!.updateCollection(id, { name, color }))}
        onDelete={(id) => guarded(() => repo!.removeCollection(id))} />}
      <div className="main-col">
      <MonthView key={primary} cal={mainCal} other={otherCal} ym={ym} onNavigate={setYm} locale={locale} t={t} today={today}
        selected={selected} occurrences={occurrences} events={eventsByUid} holidays={monthHolidays} colors={colors}
        onDayClick={selectDay} onDayDoubleClick={addOnDay} onEventClick={openEvent} />

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
            {dayHolidays.length > 0 && (
              <ul className="day-holidays">
                {dayHolidays.map((h) => (
                  <li key={h.id} className={`holiday hcat-${h.category}${h.yomTov ? " yomtov" : ""}`} dir="auto">{locale === "he" ? h.he : h.en}</li>
                ))}
              </ul>
            )}
            {dayEvents.length === 0 ? (dayHolidays.length === 0 && <p className="muted">{t.noEventsDay}</p>) : (
              <ul className="upcoming">
                {dayEvents.map((o) => {
                  const ev = eventsByUid.get(o.eventUid)!;
                  const native = getCalendar(o.native.calendar);
                  return (
                    <li key={o.eventUid + o.key}>
                      <button type="button" className="up-item" style={{ "--c": colors.get(ev.collectionId) } as React.CSSProperties}
                        onClick={() => setEditor({ existing: ev, date: ev.start })}>
                        <span className="up-title" dir="auto">{ev.title}</span>
                        <span className="up-when">{(() => { const c = doc.collections.find((x) => x.id === ev.collectionId); return c ? displayName(c, t) : ""; })()} · {native.calendarName(locale)}</span>
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
      </div>
      </div>

      {editor && repo && (
        <EventEditor
          key={editor.existing?.uid ?? `new-${editor.date.calendar}-${editor.date.year}-${editor.date.monthCode}-${editor.date.day}`}
          locale={locale} t={t} today={today} existing={editor.existing} initialDate={editor.date}
          collections={doc.collections.map((c) => ({ id: c.id, name: displayName(c, t), color: c.color }))}
          defaultCollectionId={doc.collections.find((c) => !hidden.has(c.id))?.id ?? doc.collections[0].id}
          onClose={() => setEditor(null)}
          onSave={(input: EventInput) => guarded(() => (editor.existing ? repo.update(editor.existing.uid, input) : repo.create(input)))}
          onDelete={editor.existing ? () => guarded(() => repo.remove(editor.existing!.uid)) : undefined}
        />
      )}
      {showSettings && (
        <SettingsDialog t={t} locale={locale} onLocale={setLocale} theme={theme} onTheme={setTheme} repo={repo} doc={doc} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}
