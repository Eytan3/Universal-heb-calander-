"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCalendar, gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate, CalendarId, Locale, YearMonth } from "@/core/calendars/types";
import { byDay, expandAll, expandEvent, type Occurrence } from "@/core/events/expand";
import { describeRule } from "@/core/events/describe";
import { emptyDocument, type EventInput, type EventStoreDocument, type UCEvent } from "@/core/events/schema";
import type { HolidayOccurrence } from "@/core/holidays/registry";
import { computedOccurrences } from "@/core/holidays/computed";
import { holidayInfo, holidayLink } from "@/core/holidays/info";
import { CalendarsPanel, displayName } from "./CalendarsPanel";
import { readLegacyHolidayPrefs, readViewPrefs, saveViewPrefs, DEFAULT_VIEW, type ViewPrefs } from "./viewPrefs";
import { todayEpochDay, type EpochDay } from "@/core/time/epochDay";
import { KeyboardHelp } from "./KeyboardHelp";
import { EventEditor, type Scope } from "./EventEditor";
import { STRINGS, type Strings } from "./i18n";
import { MonthView } from "./MonthView";
import { SettingsDialog } from "./SettingsDialog";
import { importFromFile } from "./importFile";
import { BackIcon } from "./BackIcon";
import { deviceTimeZone, endOf, formatInstant, formatTime, minutesOf } from "@/core/time/zoned";

/** "10:00–11:30", "22:00–01:00 +1", "יום שלם"; the zone is named when it is not the device's own. */
function timeLabel(ev: UCEvent, o: { startTime?: string; durationMinutes?: number }, locale: Locale, t: Strings): string {
  if (ev.showWithoutTime !== false || !ev.startTime) return t.allDayLabel;
  const start = o.startTime ?? ev.startTime;
  const end = endOf(start, o.durationMinutes ?? ev.durationMinutes ?? 60);
  const zone = ev.timeZone && ev.timeZone !== deviceTimeZone() ? ` (${ev.timeZone.split("/").pop()!.replace(/_/g, " ")})` : "";
  const range = (o.durationMinutes ?? ev.durationMinutes) === 0 ? formatTime(start, locale) : `${formatTime(start, locale)}–${formatTime(end.hhmm, locale)}${end.dayOffset ? " +1" : ""}`;
  return range + zone;
}
import { isPreview } from "./preview";
import { applyTheme, readTheme, type Theme } from "./theme";
import { DEFAULT_JEWISH_SETTINGS, isComputed, JEWISH_COLLECTION_ID, JEWISH_COLOR } from "@/core/events/schema";
import { AuthRequiredError, chooseRepository, goToLogin, serverInfo, setEditToken, type EventRepository } from "./repository";

type EditorState = { existing?: UCEvent; date: CalendarDate; occurrence?: Occurrence } | null;

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
  const [showKeys, setShowKeys] = useState(false);
  /** Latest keyboard handler (reassigned every render so it sees current state). */
  const keyHandler = useRef<((e: KeyboardEvent) => void) | null>(null);
  /** Day to focus after a keyboard move, so the focus ring and screen readers follow the selection. */
  const focusDay = useRef<EpochDay | null>(null);
  /** Where the user was before pressing Today, so they can jump back (Apple-like, but without losing the place). */
  const [returnTo, setReturnTo] = useState<EpochDay | null>(null);
  // Lazy init so the first effect never overwrites the saved choice (theme isn't in the SSR markup).
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "system" : readTheme()));
  const [addCalendar, setAddCalendar] = useState<CalendarId>("hebrew");
  const t = STRINGS[locale];
  // Phone day list: holiday cards show just their title; a tap opens the explanation
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => setOpenCards((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // iPhone: a sheet is a full-screen page (see globals.css) — it starts at the top
  useEffect(() => { window.scrollTo(0, 0); }, [editor, showSettings, showKeys]);

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
    chooseRepository().then(setRepo, (e: Error) => setLoadError(e.message));
  }, []);

  const updateView = (v: ViewPrefs) => { setView(v); saveViewPrefs(v); };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    try { localStorage.setItem("universal-calendar:locale", locale); } catch { /* ignore */ }
  }, [locale]);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (focusDay.current === null) return;
    const el = document.querySelector<HTMLElement>(`.cell-hit[data-day="${focusDay.current}"]`);
    focusDay.current = null;
    el?.focus({ preventScroll: false });
  });

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

  // One-time move of this browser's old holiday settings into the computed calendar (v2 → v3).
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !repo || !doc.collections.length) return;
    const legacy = readLegacyHolidayPrefs();
    if (!legacy) { migrated.current = true; return; }
    const jc = doc.collections.find((c) => c.id === JEWISH_COLLECTION_ID && isComputed(c));
    if (!jc) return; // wait until the migrated document has loaded
    migrated.current = true;
    const differs = legacy.region !== DEFAULT_JEWISH_SETTINGS.region || legacy.categories.join() !== DEFAULT_JEWISH_SETTINGS.categories.join();
    const untouched = JSON.stringify(jc.jewish) === JSON.stringify(DEFAULT_JEWISH_SETTINGS);
    const canEdit = !(repo.kind === "server" && serverInfo.login === "viewer");
    const next = legacy.enabled || view.hiddenCollections.includes(jc.id) ? view : { ...view, hiddenCollections: [...view.hiddenCollections, jc.id] };
    saveViewPrefs(next);
    setView(next);
    if (differs && untouched && canEdit) {
      void repo.updateCollection(jc.id, { name: jc.name, color: jc.color, jewish: { region: legacy.region, categories: legacy.categories } }).then(reload, () => undefined);
    }
  }, [repo, doc.collections, view, reload]);

  // Hidden calendars are filtered for display only; nothing is deleted.
  const hidden = useMemo(() => new Set(view.hiddenCollections), [view.hiddenCollections]);
  const events = useMemo(() => doc.events.filter((e) => !hidden.has(e.collectionId)), [doc.events, hidden]);
  const eventsByUid = useMemo(() => new Map(doc.events.map((e) => [e.uid, e])), [doc.events]);
  const colors = useMemo(() => new Map(doc.collections.map((c) => [c.id, c.color])), [doc.collections]);
  // Computed calendars (holidays …) shown like any calendar: each from its own settings, in its own colour.
  // The same holiday from two such calendars on one day is shown once.
  const shownComputed = useMemo(() => doc.collections.filter((c) => isComputed(c) && !hidden.has(c.id)), [doc.collections, hidden]);
  const holidaysIn = useCallback((start: EpochDay, end: EpochDay) => {
    const m = new Map<EpochDay, HolidayOccurrence[]>();
    const seen = new Set<string>();
    for (const c of shownComputed) {
      for (const h of computedOccurrences(c, { start, end })) {
        const k = `${h.id}.${h.epochDay}`;
        if (seen.has(k)) continue;
        seen.add(k);
        m.set(h.epochDay, [...(m.get(h.epochDay) ?? []), { ...h, color: c.color }]);
      }
    }
    return m;
  }, [shownComputed]);

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
  // All-day first, then by start time (as in Apple Calendar's list).
  const dayEvents = useMemo(() => {
    if (selected === null) return [];
    const start = (o: { eventUid: string; startTime?: string }) => {
      const ev = eventsByUid.get(o.eventUid);
      return ev?.showWithoutTime === false ? minutesOf(o.startTime ?? ev.startTime ?? "00:00") : -1;
    };
    return expandAll(events, { start: selected, end: selected + 1 }).sort((a, b) => start(a) - start(b));
  }, [events, selected, eventsByUid]);
  const dayHolidays = selected === null ? [] : monthHolidays.get(selected) ?? holidaysIn(selected, selected + 1).get(selected) ?? [];

  if (today === null || !ym) return <main className="loading">{t.loading}</main>;

  /** Login is on and this visitor is not signed in: they may look, not change (the server enforces it too). */
  const readOnly = repo?.kind === "server" && serverInfo.login === "viewer";
  // Picking a day yourself sets a new place, so the "back to" point is no longer needed.
  const selectDay = (date: CalendarDate, day: EpochDay) => { setSelected(day); setAddCalendar(date.calendar); setReturnTo(null); };
  const addOnDay = (date: CalendarDate, day: EpochDay) => { selectDay(date, day); if (!readOnly) setEditor({ date }); };
  /** Open an event on the occurrence shown on `day` (repeating events edit that occurrence, Apple-style). */
  const openEvent = (uid: string, day: EpochDay) => {
    const ev = eventsByUid.get(uid);
    if (!ev) return;
    setSelected(day);
    if (readOnly) return; // viewers read the details in the day list
    const occurrence = ev.recurrenceRules?.length ? expandEvent(ev, { start: day, end: day + 1 })[0] : undefined;
    setEditor({ existing: ev, date: ev.start, occurrence });
  };

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed"); } catch { /* ignore */ }
  };
  /** New event on the selected day (or today), in the main calendar. */
  const addOnSelected = () => readOnly ? goToLogin() : setEditor({ date: getCalendar(addCalendar).fromEpochDay(selected ?? today) });
  const goToday = () => {
    if (selected !== null && selected !== today) setReturnTo(selected);
    setYm(ymOf(primary, today)); setSelected(today); setAddCalendar(primary);
  };
  const goBack = () => {
    if (returnTo === null) return;
    setYm(ymOf(primary, returnTo)); setSelected(returnTo); setReturnTo(null);
  };

  // ── Keyboard control (layout-independent: letters are matched by physical key, e.code) ──
  /** Select a day; the view follows it into another month when needed. */
  const moveTo = (day: EpochDay) => {
    setSelected(day);
    setAddCalendar(primary);
    const target = ymOf(primary, day);
    if (target.year !== ym.year || target.monthCode !== ym.monthCode) setYm(target);
    focusDay.current = day;
  };
  /** Same day-of-month, `delta` months (in the main calendar) away; clamped to the month's length. */
  const moveMonths = (delta: number) => {
    const cal = getCalendar(primary);
    const cur = cal.fromEpochDay(selected ?? today);
    const ymNext = cal.addMonths({ year: cur.year, monthCode: cur.monthCode }, delta);
    const day = Math.min(cur.day, cal.daysInMonth(ymNext.year, ymNext.monthCode)!);
    moveTo(cal.toEpochDay({ ...ymNext, day }));
  };
  const moveYears = (delta: number) => moveMonths(delta * getCalendar(primary).monthsInYear(getCalendar(primary).fromEpochDay(selected ?? today).year).length);
  const anySheet = Boolean(editor || showSettings || showKeys);
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // A sheet that already handled Escape (e.g. closing its action sheet) marks the event.
      if (e.defaultPrevented) return;
      if (showKeys) setShowKeys(false);
      else if (editor) setEditor(null);
      else if (showSettings) setShowSettings(false);
      else if (sidebarOpen) toggleSidebar();
      return;
    }
    if (anySheet || e.defaultPrevented) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(tgt.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser/OS shortcuts alone
    const rtl = document.documentElement.dir === "rtl";
    const cur = selected ?? today;
    const cal = getCalendar(primary);
    const step = (k: string) => (k === "ArrowRight" ? (rtl ? -1 : 1) : (rtl ? 1 : -1));
    let handled = true;
    switch (e.key) {
      case "ArrowLeft": case "ArrowRight":
        if (e.shiftKey) moveMonths(step(e.key)); else moveTo(cur + step(e.key));
        break;
      case "ArrowUp": if (e.shiftKey) moveYears(-1); else moveTo(cur - 7); break;
      case "ArrowDown": if (e.shiftKey) moveYears(1); else moveTo(cur + 7); break;
      case "PageUp": moveMonths(-1); break;
      case "PageDown": moveMonths(1); break;
      case "Home": { const d = cal.fromEpochDay(cur); moveTo(cal.toEpochDay({ ...d, day: 1 })); break; }
      case "End": { const d = cal.fromEpochDay(cur); moveTo(cal.toEpochDay({ ...d, day: cal.daysInMonth(d.year, d.monthCode)! })); break; }
      case "Enter": {
        if (tgt && tgt.tagName === "BUTTON" && !tgt.classList.contains("cell-hit")) { handled = false; break; } // let focused buttons work
        const first = dayEvents[0];
        if (readOnly) handled = false; else if (first) openEvent(first.eventUid, cur); else setEditor({ date: cal.fromEpochDay(cur) });
        break;
      }
      default:
        switch (e.code) {
          case "KeyT": goToday(); focusDay.current = today; break;
          case "KeyB": if (returnTo !== null) { focusDay.current = returnTo; goBack(); } else handled = false; break;
          case "KeyN": if (readOnly) handled = false; else setEditor({ date: cal.fromEpochDay(cur) }); break;
          case "KeyM": switchMode(primary === "hebrew" ? "gregory" : "hebrew"); break;
          case "KeyC": toggleSidebar(); break;
          case "Comma": setShowSettings(true); break;
          case "Slash": if (e.shiftKey || e.key === "?") setShowKeys(true); else handled = false; break;
          default: handled = false;
        }
    }
    if (handled) e.preventDefault();
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

  // Phone: the Today button is "smart". Right after pressing Today (while the view still shows today),
  // it offers "Back" to where the user was; once they move on themselves, it is plain Today again.
  const todayYm = ymOf(primary, today);
  const canGoBack = returnTo !== null && selected === today && ym.year === todayYm.year && ym.monthCode === todayYm.monthCode;
  const backLabel = canGoBack ? t.backTo(mainCal.formatDate(mainCal.fromEpochDay(returnTo!), locale)) : "";
  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <h1>{t.appName}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className="top-actions">
          <button type="button" className={`glass-btn sidebar-toggle${sidebarOpen ? " on" : ""}`} aria-expanded={sidebarOpen} aria-controls="calendars-panel"
            title={t.calendars} onClick={toggleSidebar}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="3" /><path d="M7.5 3.5v13" /></svg>
            <span className="label">{t.calendars}</span>
          </button>
          <button type="button" className={`glass-btn mode-toggle cal-${primary}`} onClick={() => switchMode(primary === "hebrew" ? "gregory" : "hebrew")}
            title={t.modeSwitchTo(t.modes[primary === "hebrew" ? "gregory" : "hebrew"])} aria-label={`${t.modeLabel}: ${t.modes[primary]}. ${t.modeSwitchTo(t.modes[primary === "hebrew" ? "gregory" : "hebrew"])}`}>
            <span>{t.calShort[primary]}</span>
            <span className="arrows" aria-hidden>⇄</span>
            <span className="other">{t.calShort[primary === "hebrew" ? "gregory" : "hebrew"]}</span>
          </button>
          <button type="button" className="glass-btn icon-only kb-btn" onClick={() => setShowKeys(true)} aria-label={t.kb.title} title={`${t.kb.title} (?)`}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.3 10h.01M12.6 10h.01M15.9 10h.01M18 10h.01M6.5 14h.01M17.5 14h.01M9 14h6" /></svg>
          </button>
          <button type="button" className="glass-btn icon-only" onClick={() => setShowSettings(true)} aria-label={t.settings} title={t.settings}>
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
          {readOnly ? (
            <button type="button" className="glass-btn signin-btn" onClick={goToLogin} title={t.login.viewOnly}>
              <svg viewBox="0 0 20 20" aria-hidden><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
              <span className="label">{t.login.signInToEdit}</span>
            </button>
          ) : (
            <button type="button" className="add-fab" onClick={addOnSelected} aria-label={t.newEvent} title={t.newEvent}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M10 4v12M4 10h12" /></svg>
            </button>
          )}
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
      {sidebarOpen && <div className="side-backdrop" onClick={toggleSidebar} aria-hidden />}
      {sidebarOpen && <CalendarsPanel onClose={toggleSidebar} t={t} locale={locale} doc={doc} hidden={hidden}
        onToggle={(id) => updateView({ ...view, hiddenCollections: hidden.has(id) ? view.hiddenCollections.filter((x) => x !== id) : [...view.hiddenCollections, id] })}
        serverFeeds={repo?.kind === "server"} readOnly={readOnly}
        onImportFile={repo ? (f) => importFromFile(repo, f, t, reload) : undefined}
        onCreate={(input) => guarded(() => repo!.createCollection(input))}
        onUpdate={(id, input) => guarded(() => repo!.updateCollection(id, input))}
        onDelete={(id) => guarded(() => repo!.removeCollection(id))} />}
      <div className="main-col">
      <MonthView key={primary} cal={mainCal} other={otherCal} ym={ym} onNavigate={setYm} locale={locale} t={t} today={today}
        selected={selected} occurrences={occurrences} events={eventsByUid} holidays={monthHolidays} colors={colors}
        onDayClick={selectDay} onDayDoubleClick={addOnDay} onEventClick={openEvent}
        onToday={goToday} returnTo={returnTo} onReturn={goBack} />

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
            </header>
            <div className="day-scroll">
            {dayHolidays.length > 0 && (
              <ul className="holiday-cards">
                {dayHolidays.map((h) => {
                  const info = holidayInfo(h.id);
                  const link = holidayLink(h.id, locale);
                  return (
                    <li key={h.id + (h.at ?? "")} className={`holiday-card hcat-${h.category}${info ? " has-info" : ""}${openCards.has(h.id) ? " open" : ""}`}
                      onClick={(e) => { if (info && !(e.target as Element).closest("a")) toggleCard(h.id); }}
                      style={h.color && h.color !== JEWISH_COLOR ? ({ "--hc": h.color } as React.CSSProperties) : undefined}>
                      <span className="holiday-icon" aria-hidden>{info?.emoji ?? "✡"}</span>
                      <div className="holiday-body">
                        <strong dir="auto">
                          {locale === "he" ? h.he : h.en}
                          {h.at !== undefined && <span className="zman-time"> {formatInstant(h.at, h.timeZone!, locale)}</span>}
                          {h.yomTov && <span className="yomtov-badge">{t.yomTov}</span>}
                        </strong>
                        {info && <p dir="auto">{info[locale]}</p>}
                        {link && <a href={link} target="_blank" rel="noopener noreferrer">{t.readMore}</a>}
                      </div>
                    </li>
                  );
                })}
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
                        onClick={() => openEvent(ev.uid, o.epochDay)}>
                        <span className="up-title" dir="auto">{o.title ?? ev.title}</span>
                        <span className={`up-when${ev.showWithoutTime === false ? " timed" : ""}`}>{timeLabel(ev, o, locale, t)}</span>
                        <span className="up-dates" dir="auto">
                          {(() => { const c = doc.collections.find((x) => x.id === ev.collectionId); return c ? `${displayName(c, t)} · ` : ""; })()}
                          {native.calendarName(locale)} · {describeRule(ev, locale)}
                          {o.adjustment !== "none" && ` · ${t.occurrenceAdjusted}`}
                          {(o.description ?? ev.description) ? ` · ${o.description ?? ev.description}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={`muted small${readOnly ? "" : " day-hint"}`}>{readOnly ? t.login.viewOnly : t.dayHint}</p>
            </div>
          </section>
        );
      })()}
      </div>
      </div>

      <nav className="bottom-bar" aria-label={t.calendars}>
        {canGoBack ? (
          <button type="button" className="glass-btn today-btn" onClick={goBack} aria-label={backLabel} title={backLabel}>
            <BackIcon /> {t.back}
          </button>
        ) : (
          <button type="button" className="glass-btn today-btn" onClick={goToday}>{t.today}</button>
        )}
        <button type="button" className={`glass-btn${sidebarOpen ? " on" : ""}`} onClick={toggleSidebar} aria-expanded={sidebarOpen}>{t.calendars}</button>
        {readOnly ? (
          <button type="button" className="glass-btn" onClick={goToLogin} aria-label={t.login.signInToEdit}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
          </button>
        ) : (
          <button type="button" className="add-fab" onClick={addOnSelected} aria-label={t.newEvent}>
            <svg viewBox="0 0 20 20" aria-hidden><path d="M10 4v12M4 10h12" /></svg>
          </button>
        )}
      </nav>

      {editor && repo && (
        <EventEditor
          key={editor.existing?.uid ?? `new-${editor.date.calendar}-${editor.date.year}-${editor.date.monthCode}-${editor.date.day}`}
          locale={locale} t={t} today={today} existing={editor.existing} initialDate={editor.date}
          collections={doc.collections.filter((c) => !isComputed(c)).map((c) => ({ id: c.id, name: displayName(c, t), color: c.color }))}
          defaultCollectionId={doc.collections.find((c) => !isComputed(c) && !hidden.has(c.id))?.id ?? doc.collections.find((c) => !isComputed(c))!.id}
          onClose={() => setEditor(null)}
          occurrence={editor.occurrence}
          onSave={(input: EventInput, scope?: Scope) => guarded(() => {
            const ex = editor.existing;
            if (!ex) return repo.create(input);
            if (scope && editor.occurrence) return repo.occurrenceAction(ex.uid, scope === "this" ? "edit-this" : "edit-future", editor.occurrence.recurrenceId, input);
            return repo.update(ex.uid, input);
          })}
          onDelete={editor.existing ? (scope?: Scope) => guarded(() => {
            const ex = editor.existing!;
            if (scope && editor.occurrence) return repo.occurrenceAction(ex.uid, scope === "this" ? "delete-this" : "delete-future", editor.occurrence.recurrenceId);
            return repo.remove(ex.uid);
          }) : undefined}
        />
      )}
      {showKeys && <KeyboardHelp t={t} locale={locale} onClose={() => setShowKeys(false)} />}
      {showSettings && (
        <SettingsDialog t={t} locale={locale} onLocale={setLocale} theme={theme} onTheme={setTheme} repo={repo} doc={doc} onClose={() => setShowSettings(false)} onImported={reload} />
      )}
    </main>
  );
}
