"use client";
/**
 * A month grid for ANY calendar adapter. The grid is built from the adapter's own
 * month structure (its first day, its length) — never from Gregorian boundaries.
 * Each cell is an absolute EpochDay, so events and selection line up across views.
 */
import type { CalendarAdapter, CalendarDate, Locale, YearMonth } from "@/core/calendars/types";
import type { Occurrence } from "@/core/events/expand";
import type { UCEvent } from "@/core/events/schema";
import type { HolidayOccurrence } from "@/core/holidays/types";
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
}

const WEEK_SUN = Array.from({ length: 7 }, (_, i) => Date.UTC(2023, 0, 1 + i)); // 2023-01-01 was a Sunday

export function MonthView(p: Props) {
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
  const isLeapCal = cal.id === "hebrew";

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div key={`pad${i}`} className="cell pad" aria-hidden />);
  for (let d = 1; d <= daysInMonth; d++) {
    const day = first + d - 1;
    const o = other.fromEpochDay(day);
    const showOtherMonth = o.day === 1 || d === 1;
    const occ = p.occurrences.get(day) ?? [];
    const hol = p.holidays.get(day) ?? [];
    const cls = ["cell", day === p.today && "today", day === p.selected && "selected", weekdayOf(day) === 6 && "shabbat"].filter(Boolean).join(" ");
    const nativeDate: CalendarDate = { calendar: cal.id, year: ym.year, monthCode: ym.monthCode, day: d };
    cells.push(
      <div key={day} className={cls}>
        <button
          type="button"
          className="cell-hit"
          aria-label={`${cal.formatDate(nativeDate, locale)} · ${other.formatDate(o, locale)}`}
          onClick={() => p.onDayClick(nativeDate, day)}
          onDoubleClick={() => p.onDayDoubleClick(nativeDate, day)}
        />
        <div className="cell-head">
          <span className="primary">{cal.formatDayNumber(d, locale)}</span>
          <span className={showOtherMonth ? "secondary strong" : "secondary"}>
            {other.formatDayNumber(o.day, locale)}
            {showOtherMonth ? ` ${other.monthName(o, locale, "short")}` : ""}
          </span>
        </div>
        {hol.length > 0 && (
          <ul className="holidays">
            {hol.map((h) => (
              <li key={h.id + h.epochDay} className={`holiday hcat-${h.category}${h.yomTov ? " yomtov" : ""}`} dir="auto" title={locale === "he" ? h.he : h.en}>
                {locale === "he" ? h.he : h.en}
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
                  title={`${ev.title} — ${describeRule(ev, locale)}${x.adjustment !== "none" ? ` (${t.occurrenceAdjusted})` : ""}`}
                  onClick={() => p.onEventClick(ev.uid, day)}
                >
                  {x.adjustment !== "none" && <span aria-hidden>↷ </span>}
                  {ev.title}
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
      <header className="month-head">
        <div className="month-title-row">
          <span className={`cal-badge cal-${cal.id}`}>{cal.calendarName(locale)}</span>
          <h2>
            {cal.monthName(ym, locale)} {cal.formatYear(ym.year, locale)}
          </h2>
        </div>
          {/* One elongated pill for month navigation: ‹ Today › (mirrors automatically in RTL). */}
          <div className="month-nav" role="group" aria-label={t.month}>
            <button type="button" className="nav-arrow" aria-label={t.prev} title={t.prev} onClick={() => p.onNavigate(cal.addMonths(ym, -1))}>
              <svg viewBox="0 0 16 16" aria-hidden className="flip"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
            </button>
            <button type="button" className="nav-today" onClick={() => { goTo(p.today); p.onDayClick(cal.fromEpochDay(p.today), p.today); }}>{t.today}</button>
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
          <input
            aria-label={t.year}
            className="year-input"
            type="number"
            min={cal.minYear}
            max={cal.maxYear}
            value={ym.year}
            onChange={(e) => {
              const y = Number(e.target.value);
              if (!Number.isInteger(y) || y < cal.minYear || y > cal.maxYear) return;
              const code = cal.daysInMonth(y, ym.monthCode) === null
                ? cal.substituteMissingMonth(y, ym.monthCode, "forward") ?? cal.monthsInYear(y)[0].monthCode
                : ym.monthCode; // e.g. Adar I → Adar in a common Hebrew year
              p.onNavigate({ year: y, monthCode: code });
            }}
          />
        </div>
        {/* Second line: month details, and "go to selected day" — kept out of the top row so the
            month/year pickers never move. */}
        <div className="month-meta-row">
          <p className="month-meta">
            {t.days(daysInMonth)}
            {isLeapCal && <> · {cal.isLeapYear(ym.year) ? t.leapYear : t.commonYear}</>}
            {" · "}
            <span dir="auto">{span}</span>
          </p>
          {selectedOutside && (
            <button type="button" className="goto-selected" onClick={() => goTo(p.selected!)}>{t.goToSelected} ↩</button>
          )}
        </div>
      </header>
      <div className="grid" role="grid">
        {WEEK_SUN.map((ms) => (
          <div key={ms} className="weekday" role="columnheader">{weekdayFmt.format(ms)}</div>
        ))}
        {cells}
      </div>
    </section>
  );
}
