"use client";
/**
 * A month grid for ANY calendar adapter. The grid is built from the adapter's own
 * month structure (its first day, its length) — never from Gregorian boundaries.
 * Each cell is an absolute EpochDay, so events and selection line up across views.
 */
import { useRef, useState } from "react";
import { YearInput } from "./YearInput";
import { BackIcon } from "./BackIcon";
import type { CalendarAdapter, CalendarDate, Locale, YearMonth } from "@/core/calendars/types";
import type { Occurrence } from "@/core/events/expand";
import type { UCEvent } from "@/core/events/schema";
import type { HolidayOccurrence } from "@/core/holidays/types";
import { JEWISH_COLOR } from "@/core/events/schema";
import { formatTime, minutesOf } from "@/core/time/zoned";
import { holidayInfo, holidayText } from "@/core/holidays/info";
import { describeRule } from "@/core/events/describe";
import { weekdayOf, type EpochDay } from "@/core/time/epochDay";
import type { Strings } from "./i18n";

interface Props {
  cal: CalendarAdapter;
  other: CalendarAdapter;
  ym: YearMonth;
  onNavigate: (ym: YearMonth) => void;
  locale: Locale;
  t: Strings;
  today: EpochDay;
  selected: EpochDay | null;
  occurrences: Map<EpochDay, Occurrence[]>;
  events: Map<string, UCEvent>;
  /** Built-in holidays to show (empty map = clean calendar). */
  holidays: Map<EpochDay, HolidayOccurrence[]>;
  /** Colour of each user calendar, by collection id. */
  colors: Map<string, string>;
  /** Single click: select the day (shows its events in the day list). */
  onDayClick: (date: CalendarDate, day: EpochDay) => void;
  /** Double click: open the editor for a new event on that day. */
  onDayDoubleClick: (date: CalendarDate, day: EpochDay) => void;
  onEventClick: (uid: string, day: EpochDay) => void;
  /** "Today" pressed: jump to today, remembering where the user was. */
  onToday: () => void;
  /** The day the user was on before pressing Today (null when there is none to go back to). */
  returnTo: EpochDay | null;
  onReturn: () => void;
}

const WEEK_SUN = Array.from({ length: 7 }, (_, i) => Date.UTC(2023, 0, 1 + i)); // 2023-01-01 was a Sunday

export function MonthView(p: Props) {
  const [pickersOpen, setPickersOpen] = useState(false);

  // ── Swipe between months (touch screens), like iOS: swipe up → next month, down → previous.
  // The grid follows the finger; past a threshold the month changes and the new one slides in.
  const [drag, setDrag] = useState(0);
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const touch = useRef<{ x: number; y: number; axis: "y" | "x" | null } | null>(null);
  const SWIPE = 56; // px
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) { touch.current = null; return; }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t0 = touch.current;
    if (!t0) return;
    const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
    if (!t0.axis && Math.hypot(dx, dy) > 8) t0.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    if (t0.axis === "y") setDrag(dy * 0.55); // follow the finger, a little damped
  };
  const onTouchEnd = () => {
    const t0 = touch.current;
    touch.current = null;
    if (t0?.axis === "y" && Math.abs(drag) * (1 / 0.55) > SWIPE) {
      const dir = drag < 0 ? "next" : "prev";
      setSlide(dir);
      p.onNavigate(cal.addMonths(ym, dir === "next" ? 1 : -1));
    }
    setDrag(0);
  };
  const { cal, other, ym, locale, t } = p;
  const months = cal.monthsInYear(ym.year);
  const daysInMonth = cal.daysInMonth(ym.year, ym.monthCode)!;
  const first = cal.toEpochDay({ year: ym.year, monthCode: ym.monthCode, day: 1 });
  const last = first + daysInMonth - 1;
  const lead = weekdayOf(first);
  const weekdayFmt = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", { weekday: locale === "he" ? "narrow" : "short", timeZone: "UTC" });

  const otherFirst = other.fromEpochDay(first);
  const otherLast = other.fromEpochDay(last);
  const span = `${other.formatDate(otherFirst, locale)} – ${other.formatDate(otherLast, locale)}`;

  const goTo = (day: EpochDay) => {
    const d = cal.fromEpochDay(day);
    p.onNavigate({ year: d.year, monthCode: d.monthCode });
  };
  const selectedOutside = p.selected !== null && (p.selected < first || p.selected > last);
  /** A day to jump back to: the selected day when it is outside this month, else the place before "Today". */
  const jumpDay = selectedOutside ? p.selected! : p.returnTo !== null && p.returnTo !== p.selected ? p.returnTo : null;
  const jump = jumpDay === null ? null : (() => {
    const d = cal.fromEpochDay(jumpDay);
    const full = cal.formatDate(d, locale);
    return {
      short: `${cal.formatDayNumber(d.day, locale)} ${cal.monthName({ year: d.year, monthCode: d.monthCode }, locale)}${d.year !== ym.year ? ` ${cal.formatYear(d.year, locale)}` : ""}`,
      full: selectedOutside ? `${t.goToSelected}: ${full}` : t.backTo(full),
      go: selectedOutside ? () => goTo(jumpDay) : p.onReturn,
    };
  })();
  const isLeapCal = cal.id === "hebrew";

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div key={`pad${i}`} className="cell pad" aria-hidden />);
  for (let d = 1; d <= daysInMonth; d++) {
    const day = first + d - 1;
    const o = other.fromEpochDay(day);
    const showOtherMonth = o.day === 1 || d === 1;
    // All-day first, then by start time (Apple Calendar's order)
    const at = (x: Occurrence) => { const ev = p.events.get(x.eventUid); return ev?.showWithoutTime === false ? minutesOf(x.startTime ?? ev.startTime ?? "00:00") : -1; };
    const occ = [...(p.occurrences.get(day) ?? [])].sort((a, b) => at(a) - at(b));
    const hol = p.holidays.get(day) ?? [];
    const cls = ["cell", day === p.today && "today", day === p.selected && "selected", weekdayOf(day) === 6 && "shabbat",
      hol.some((h) => h.yomTov) && "yomtov-day"].filter(Boolean).join(" ");
    // Phone (compact) view: one rounded strip under the day, split into segments — the holiday colour first,
    // then one segment per event in its calendar's colour (at most four).
    const dotColors = [...(hol.length ? [hol[0].color ?? "var(--holiday)"] : []),
      ...occ.map((x) => p.colors.get(p.events.get(x.eventUid)?.collectionId ?? "") ?? "var(--hebrew)")].slice(0, 4);
    const nativeDate: CalendarDate = { calendar: cal.id, year: ym.year, monthCode: ym.monthCode, day: d };
    cells.push(
      <div key={day} className={cls}>
        <button
          type="button"
          className="cell-hit"
          data-day={day}
          tabIndex={day === (p.selected ?? p.today) ? 0 : -1}
          aria-selected={day === p.selected}
          aria-current={day === p.today ? "date" : undefined}
          aria-label={`${cal.formatDate(nativeDate, locale)} · ${other.formatDate(o, locale)}`}
          onClick={() => p.onDayClick(nativeDate, day)}
          onDoubleClick={() => p.onDayDoubleClick(nativeDate, day)}
        />
        <div className="cell-head">
          {(() => {
            const label = cal.formatDayNumber(d, locale);
            // Length decides the text size, so the today / selected marker is always a true circle
            return <span className="primary" data-len={[...label].length >= 3 ? "long" : undefined}>{label}</span>;
          })()}
          <span className={showOtherMonth ? "secondary strong" : "secondary"}>
            {other.formatDayNumber(o.day, locale)}
            {showOtherMonth ? ` ${other.monthName(o, locale, "short")}` : ""}
          </span>
        </div>
        {dotColors.length > 0 && (
          <span className="daybar" aria-hidden>
            {dotColors.map((c, i) => <i key={i} style={{ "--c": c } as React.CSSProperties} />)}
          </span>
        )}
        {hol.length > 0 && (
          <ul className="holidays">
            {hol.map((h) => (
              <li key={h.id + h.epochDay} className={`holiday hcat-${h.category}${h.yomTov ? " yomtov" : ""}`} dir="auto"
                style={h.color && h.color !== JEWISH_COLOR ? ({ "--hc": h.color } as React.CSSProperties) : undefined}
                title={`${locale === "he" ? h.he : h.en} — ${holidayText(h.id, locale)}`}>
                <span className="h-emoji" aria-hidden>{holidayInfo(h.id)?.emoji}</span> {locale === "he" ? h.he : h.en}
              </li>
            ))}
          </ul>
        )}
        <ul className="chips">
          {occ.map((x) => {
            const ev = p.events.get(x.eventUid);
            if (!ev) return null;
            return (
              <li key={x.eventUid + x.key}>
                <button
                  type="button"
                  className="chip"
                  style={{ "--c": p.colors.get(ev.collectionId) ?? "var(--hebrew)" } as React.CSSProperties}
                  dir="auto"
                  title={`${x.title ?? ev.title} — ${describeRule(ev, locale)}${x.adjustment !== "none" ? ` (${t.occurrenceAdjusted})` : ""}`}
                  onClick={() => p.onEventClick(ev.uid, day)}
                >
                  {x.adjustment !== "none" && <span aria-hidden>↷ </span>}
                  {ev.showWithoutTime === false && ev.startTime && <span className="chip-time">{formatTime(x.startTime ?? ev.startTime, locale)} </span>}
                  {x.title ?? ev.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
    );
  }

  return (
    <section className={`month cal-${cal.id}`} aria-label={cal.calendarName(locale)}>
      <header className={`month-head${pickersOpen ? " pickers-open" : ""}`}>
        <div className="month-title-row">
          <h2>
            {/* On phones the month/year pickers are tucked away (like iOS); tapping the title shows them. */}
            <button type="button" className="title-btn" aria-expanded={pickersOpen} onClick={() => setPickersOpen((v) => !v)}>
              {cal.monthName(ym, locale)} {cal.formatYear(ym.year, locale)}
              <svg className="title-chev" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
            </button>
          </h2>
        </div>
          {/* One elongated pill for month navigation: ‹ Today › (mirrors automatically in RTL). */}
          <div className="month-nav" role="group" aria-label={t.month}>
            <button type="button" className="nav-arrow" aria-label={t.prev} title={t.prev} onClick={() => p.onNavigate(cal.addMonths(ym, -1))}>
              <svg viewBox="0 0 16 16" aria-hidden className="flip"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
            </button>
            <button type="button" className="nav-today" onClick={p.onToday}>{t.today}</button>
            <button type="button" className="nav-arrow" aria-label={t.next} title={t.next} onClick={() => p.onNavigate(cal.addMonths(ym, 1))}>
              <svg viewBox="0 0 16 16" aria-hidden className="flip"><path d="M6 3.5L10.5 8 6 12.5" /></svg>
            </button>
          </div>
        <div className="month-controls">
          <select aria-label={t.month} value={ym.monthCode} onChange={(e) => p.onNavigate({ year: ym.year, monthCode: e.target.value })}>
            {months.map((m) => (
              <option key={m.monthCode} value={m.monthCode}>{cal.monthName({ year: ym.year, monthCode: m.monthCode }, locale)}</option>
            ))}
          </select>
          <YearInput
            ariaLabel={t.year}
            className="year-input"
            value={ym.year}
            min={cal.minYear}
            max={cal.maxYear}
            onCommit={(y) => {
              const code = cal.daysInMonth(y, ym.monthCode) === null
                ? cal.substituteMissingMonth(y, ym.monthCode, "forward") ?? cal.monthsInYear(y)[0].monthCode
                : ym.monthCode; // e.g. Adar I → Adar in a common Hebrew year
              p.onNavigate({ year: y, monthCode: code });
            }}
          />
          {/* "Back to a day": beside the pickers, positioned out of the flow — it appears and disappears
              without moving the pickers or pushing the grid down. Short label (day + month); full date in the tooltip. */}
          {jump && (
            <button type="button" className="goto-selected" onClick={jump.go} title={jump.full} aria-label={jump.full}>
              <BackIcon /> {jump.short}
            </button>
          )}
        </div>
        {/* Second line: month details only (fixed height, so the grid never jumps). */}
        <div className="month-meta-row">
          <p className="month-meta">
            {t.days(daysInMonth)}
            {isLeapCal && <> · {cal.isLeapYear(ym.year) ? t.leapYear : t.commonYear}</>}
            {" · "}
            <span dir="auto">{span}</span>
          </p>
        </div>
      </header>
      {/* The weekday row stays still; only the days move when swiping between months. */}
      <div className="weekdays" aria-hidden>
        {WEEK_SUN.map((ms) => (
          <div key={ms} className="weekday">{weekdayFmt.format(ms)}</div>
        ))}
      </div>
      <div className="grid-wrap" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className={`grid${slide ? ` slide-${slide}` : ""}${drag ? " dragging" : ""}`} role="grid"
          key={`${ym.year}-${ym.monthCode}`}
          style={drag ? { transform: `translateY(${drag}px)`, opacity: Math.max(0.35, 1 - Math.abs(drag) / 260) } : undefined}
          onAnimationEnd={() => setSlide(null)}>
          {cells}
        </div>
      </div>
    </section>
  );
}
