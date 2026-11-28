"use client";
/**
 * A month grid for ANY calendar adapter. The grid is built from the adapter's own
 * month structure (its first day, its length) — never from Gregorian boundaries.
 * Each cell is an absolute EpochDay, so events and selection line up across views.
 */
import { useEffect, useRef, useState } from "react";
import { YearInput } from "./YearInput";
import { BackIcon } from "./BackIcon";
import type { CalendarAdapter, CalendarDate, Locale, YearMonth } from "@/core/calendars/types";
import type { Occurrence } from "@/core/events/expand";
import type { UCEvent } from "@/core/events/schema";
import type { HolidayOccurrence } from "@/core/holidays/types";
import { JEWISH_COLOR } from "@/core/events/schema";
import { formatInstant, formatTime, minutesOf } from "@/core/time/zoned";
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

  // ── The months are one vertical strip on touch screens, like iOS: the previous and next months sit
  // right above and below this one (no empty rows between), the finger moves the strip 1:1, and on
  // release it settles on the nearest month (a flick is enough to move on).
  const [offset, setOffset] = useState(0); // px the strip is moved (negative = towards the next month)
  const [settle, setSettle] = useState<-1 | 0 | 1 | null>(null); // animating to prev / back / next
  const touch = useRef<{ x: number; y: number; axis: "y" | "x" | null; rowH: number; last: [number, number][] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowHRef = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || settle !== null) { touch.current = null; return; }
    const rowH = (wrapRef.current?.clientHeight ?? 0) / 6;
    rowHRef.current = rowH;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, rowH, last: [[e.timeStamp, 0]] };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t0 = touch.current;
    if (!t0) return;
    const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
    if (!t0.axis && Math.hypot(dx, dy) > 8) t0.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    if (t0.axis !== "y") return;
    t0.last = [...t0.last.slice(-4), [e.timeStamp, dy]];
    setOffset(dy);
  };
  const onTouchEnd = () => {
    const t0 = touch.current;
    touch.current = null;
    if (t0?.axis !== "y" || !t0.rowH) { if (offset) setOffset(0); return; }
    const [[ta, ya], [tb, yb]] = [t0.last[0], t0.last[t0.last.length - 1]];
    const v = tb > ta ? (yb - ya) / (tb - ta) : 0; // px/ms, negative = upwards
    const toNext = rows(ym) * t0.rowH, toPrev = rows(prevYm) * t0.rowH;
    const dir: -1 | 0 | 1 =
      offset < -toNext / 2 || (v < -0.35 && offset < -12) ? 1 :
      offset > toPrev / 2 || (v > 0.35 && offset > 12) ? -1 : 0;
    const target = dir === 1 ? -toNext : dir === -1 ? toPrev : 0;
    if (target === offset) { finish(dir); return; }
    setSettle(dir);
    setOffset(target);
  };
  // Safety net: if the browser skips transitionend (tab hidden, interrupted), still finish
  useEffect(() => {
    if (settle === null) return;
    const id = setTimeout(() => finish(settle), 500);
    return () => clearTimeout(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  /** The strip has arrived: switch the month and put the strip back, in one render (nothing flickers). */
  const finish = (dir: -1 | 0 | 1) => {
    setSettle(null);
    setOffset(0);
    if (dir !== 0) p.onNavigate(dir === 1 ? nextYm : prevYm);
  };
  const { cal, other, ym, locale, t } = p;
  const prevYm = cal.addMonths(ym, -1), nextYm = cal.addMonths(ym, 1);
  /** How many week rows a month takes. */
  function rows(m: YearMonth) {
    const f = cal.toEpochDay({ year: m.year, monthCode: m.monthCode, day: 1 });
    return Math.ceil((weekdayOf(f) + cal.daysInMonth(m.year, m.monthCode)!) / 7);
  }
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

  function monthCells(m: YearMonth): React.ReactNode[] {
  const first = cal.toEpochDay({ year: m.year, monthCode: m.monthCode, day: 1 });
  const daysInMonth = cal.daysInMonth(m.year, m.monthCode)!;
  const lead = weekdayOf(first);
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
    // Weekly / daily entries (Shabbat times, portion, Omer) would mark half the month: holidays only.
    const dayHol = hol.filter((h) => h.category !== "zmanim" && h.category !== "parasha" && h.category !== "omer" && h.category !== "special");
    const dotColors = [...(dayHol.length ? [dayHol[0].color ?? "var(--holiday)"] : []),
      ...occ.map((x) => p.colors.get(p.events.get(x.eventUid)?.collectionId ?? "") ?? "var(--hebrew)")].slice(0, 4);
    const nativeDate: CalendarDate = { calendar: cal.id, year: m.year, monthCode: m.monthCode, day: d };
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
                title={`${locale === "he" ? h.he : h.en}${h.at !== undefined ? ` ${formatInstant(h.at, h.timeZone!, locale)}` : ""} — ${holidayText(h.id, locale)}`}>
                <span className="h-emoji" aria-hidden>{holidayInfo(h.id)?.emoji}</span>{" "}
                {/* Candle lighting / havdalah: just the time in the cell (the name is in the tooltip and the day list) */}
                {h.at !== undefined ? <span className="h-time">{formatInstant(h.at, h.timeZone!, locale)}</span> : locale === "he" ? h.he : h.en}
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
  return cells;
  }

  // While dragging, the title follows the month nearest to the middle
  const shownYm = (() => {
    const rowH = rowHRef.current;
    if (!rowH || (!offset && settle === null)) return ym;
    if (offset < -(rows(ym) * rowH) / 2) return nextYm;
    if (offset > (rows(prevYm) * rowH) / 2) return prevYm;
    return settle === 1 ? nextYm : settle === -1 ? prevYm : ym;
  })();

  return (
    <section className={`month cal-${cal.id}`} aria-label={cal.calendarName(locale)}>
      <header className={`month-head${pickersOpen ? " pickers-open" : ""}`}>
        <div className="month-title-row">
          <h2>
            {/* On phones the month/year pickers are tucked away (like iOS); tapping the title shows them. */}
            <button type="button" className="title-btn" aria-expanded={pickersOpen} onClick={() => setPickersOpen((v) => !v)}>
              {cal.monthName(shownYm, locale)} {cal.formatYear(shownYm.year, locale)}
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
      <div className="grid-wrap" ref={wrapRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className={`strip${settle !== null ? " settling" : ""}${offset !== 0 || settle !== null ? " moving" : ""}`}
          style={{ "--off": `${offset}px`, "--prev-rows": rows(prevYm), "--rows": rows(ym) } as React.CSSProperties}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget && settle !== null) finish(settle); }}>
          {/* Neighbours: shown only on touch screens, dimmed, not interactive */}
          <div className="grid side prev" aria-hidden inert key={`p${prevYm.year}-${prevYm.monthCode}`}>{monthCells(prevYm)}</div>
          <div className="grid" role="grid" key={`${ym.year}-${ym.monthCode}`}>{monthCells(ym)}</div>
          <div className="grid side next" aria-hidden inert key={`n${nextYm.year}-${nextYm.monthCode}`}>{monthCells(nextYm)}</div>
        </div>
      </div>
    </section>
  );
}
