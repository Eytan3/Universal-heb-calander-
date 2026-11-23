# Ittim (עִתִּים) — Architecture

> The app was renamed from "Universal Calendar". Storage keys (`universal-calendar:*`), the Redis key and the
> default ICS UID domain (`universal-calendar`) deliberately keep the old name, so saved events, settings and
> existing Apple Calendar subscriptions keep working.

> Time is universal. Calendars are interpretations of time. No calendar is the source of truth for another.
> The same absolute day can be represented in many calendars, but the meaning and recurrence of an event
> belong to the calendar in which it was defined.

This document records the data model, the standards it builds on, the decisions taken for the first MVP,
its known limitations, and how it is meant to grow.

---

## 1. Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ D. Presentation & export     src/ui/*  (month views, editor)                │
│                              src/core/export/ics.ts  (ICS output adapter)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ C. Calendar-neutral events   src/core/events/schema.ts   (definitions)      │
│                              src/core/events/expand.ts   (occurrences)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ B. Calendar engines          src/core/calendars/{hebrew,gregorian}.ts       │
│                              behind CalendarAdapter (types.ts), registry.ts │
├─────────────────────────────────────────────────────────────────────────────┤
│ A. Universal time axis       src/core/time/epochDay.ts                      │
└─────────────────────────────────────────────────────────────────────────────┘
  Infrastructure (separate):   src/server/storage.ts, src/app/** (Next.js routes)
```

`src/core` has **no** dependency on React, Next.js, storage or the network. It can be published as a
standalone package, run in a worker, or reused by a CalDAV server later.

Dependency direction is strictly downward: views and the ICS writer consume occurrences; occurrences are
computed from definitions via calendar engines; engines speak only in terms of the time axis.

---

## 2. Layer A — Universal time axis

Three different things are kept apart:

| Concept | Representation | Notes |
|---|---|---|
| Absolute instant | `Temporal.Instant` | Nanoseconds since the Unix epoch, UTC. Not used by v1 events (all-day only) but defined for timed events. |
| Absolute civil day | `EpochDay` (integer) | Days since 1970-01-01 in the ISO day count, the same integer Temporal calls "epoch days". |
| Calendar date | `CalendarDate { calendar, year, monthCode, day }` | Meaningful only within its calendar. |

**Why an integer day count?** A day count is the conventional calendar-neutral coordinate (Calendrical
Calculations' R.D. and ICU's Julian day number work the same way; Hebcal uses R.D. internally). Choosing
1970-01-01 as the origin is purely an implementation convenience that aligns with Temporal and Unix tools.
It does **not** make the Gregorian calendar semantically primary. The Hebrew adapter converts directly
between its own dates and the day count (`R.D. − 719163`) without going through a Gregorian date.

**Time zones** are explicit: `epochDayOfInstant(instant, timeZone)` requires an IANA zone. The server feed
uses `UC_TIMEZONE` (default `UTC`) only to decide what "today" is for the rolling window. The browser uses
the device's zone for "today".

### Day boundaries (sunset)

The Hebrew day runs from nightfall to nightfall. Every adapter declares a `dayBoundary`
(`"sunset"` for Hebrew, `"midnight"` for Gregorian), but **v1 computes only civil, midnight-based days**.
A Hebrew date is mapped to the civil day that holds its daylight hours. That is the universal convention of
printed Hebrew calendars, Hebcal and ICU. For example, 15 Kislev 5787 maps to civil day 2026-11-25, even
though halachically it begins on the evening of the 24th.

Sunset-aware placement (for example "this birthday begins tonight") needs a location and an astronomical
model. It is deliberately out of scope for v1. See §8.

---

## 3. Layer B — Calendar engines

### Interface

`CalendarAdapter` (src/core/calendars/types.ts) provides:

- identity: `id` (a CLDR/BCP-47 calendar id: `gregory`, `hebrew`), `dayBoundary`, `minYear`/`maxYear`
- validation: `isValid(date)`
- conversion: `toEpochDay(date)`, `fromEpochDay(day)`
- structure: `isLeapYear`, `monthsInYear(year)` (ordered, with lengths and leap flags), `daysInMonth`, `allMonthCodes`
- navigation: `addMonths(yearMonth, delta)`
- calendar-specific recurrence: `substituteMissingMonth(year, monthCode, skip)`
- formatting: `monthName` (long and short forms), `genericMonthName`, `formatYear`, `formatDayNumber`, `formatDate`, `calendarName`

### Month identity: Temporal month codes

Months are identified by **month code**, not by ordinal number, using the Temporal/ECMA-402 scheme. RFC 7529
uses the same scheme (`BYMONTH=5L`):

| Code | Hebrew month | Notes |
|---|---|---|
| M01 | Tishrei | Start of the year count |
| M02 | Cheshvan | 29 or 30 days |
| M03 | Kislev | 29 or 30 days |
| M04 | Tevet | |
| M05 | Shevat | |
| **M05L** | **Adar I** | Leap years only |
| M06 | Adar (common year) / **Adar II** (leap year) | |
| M07–M12 | Nisan … Elul | |

Ordinals shift in leap years (Nisan is the 7th or 8th month), but codes stay fixed. "15 Kislev" is therefore
`{ monthCode: "M03", day: 15 }` in every year.

### Libraries chosen

| Need | Choice | Why |
|---|---|---|
| Hebrew calendar | **@hebcal/hdate** (Hebcal, GPL-2.0-or-later — see README → License) | The reference open-source Hebrew calendar implementation, actively maintained, and it already includes the birthday and yahrzeit rules we will need next. It is the date core of `@hebcal/core`; we use the smaller package because holidays and zmanim are not needed yet. |
| Gregorian calendar and time axis | **temporal-polyfill** (FullCalendar, MIT) | Temporal is the ECMAScript standard (Stage 4, March 2026). It ships natively in Firefox 139+, Chrome 144+ and Node 26+, but not yet in stable Safari, so a small spec-compliant polyfill is used. When Safari ships Temporal, the import can switch to the global. |
| Localized names | **Intl** (ICU) | Built in. Gregorian month and weekday names in English and Hebrew. |
| Independent test oracle | `temporal-polyfill/full` (ICU's Hebrew calendar) | Used only in tests to cross-check Hebcal, so two independent implementations must agree. |
| ICS parsing (tests) | **ical.js** (Mozilla) | Proves that generated feeds parse correctly. |

**Considered and not chosen for the Hebrew engine:** Temporal's own `hebrew` calendar. It is
standards-perfect, but in non-native environments it depends on the polyfill's "full" build and on `Intl`
data for every conversion, which is heavier and harder to test. More importantly, it has no notion of
birthday or yahrzeit rules. Hebcal does, and those are the next domain features. ICU therefore serves as
the test oracle rather than the engine. Because both follow the same month-code model, swapping engines
later is a one-file change.

**Gotcha handled:** Hebcal silently normalises invalid input (for example, it turns `30 Kislev` in a
29-day year into `1 Tevet`). The adapter validates every date before handing it to Hebcal.

---

## 4. Layer C — Event model (schema v1)

### Example (as stored)

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "@type": "Event",
      "uid": "9b90bc9c-f47c-4896-ac18-f864503ccf35",
      "title": "Hebrew birthday",
      "showWithoutTime": true,
      "start": { "calendar": "hebrew", "year": 5787, "monthCode": "M03", "day": 15 },
      "recurrenceRules": [
        { "@type": "RecurrenceRule", "frequency": "yearly", "rscale": "hebrew", "interval": 1, "skip": "forward" }
      ],
      "created": "2026-11-23T11:54:21.572Z",
      "updated": "2026-11-23T11:54:21.572Z",
      "sequence": 0
    }
  ]
}
```

### Fields

| Field | Type | Meaning |
|---|---|---|
| `@type` | `"Event"` | JSCalendar object type. |
| `uid` | string | Stable identifier (UUID). Never reused. |
| `title`, `description` | string | JSCalendar names. |
| `showWithoutTime` | `true` | JSCalendar's all-day flag. v1 supports all-day events only. |
| `start` | `CalendarDate` | **The native date, in the event's own calendar.** |
| `recurrenceRules` | `[RecurrenceRule]?` | At most one in v1. Absent means a one-time event. |
| `recurrenceRules[0].frequency` | `daily`, `weekly`, `monthly` or `yearly` | See *Recurrence semantics*. |
| `recurrenceRules[0].rscale` | calendar id | The calendar the rule is evaluated in. Must equal `start.calendar`. |
| `recurrenceRules[0].interval` | int 1–1000 | Every N units (months and years counted in the event's calendar). |
| `recurrenceRules[0].from` | `CalendarDate`? | Repeats begin on this date (in the rule's calendar). The series stays anchored to `start`, and the original occurrence is kept. Kept for compatibility; the editor no longer sets it — like Apple Calendar, a repeat starts on the event's own date. Departure from JSCalendar (an RRULE equivalent would split the series). |
| `recurrenceRules[0].until` | `CalendarDate`? | "End Repeat": last day repeats may occur (inclusive), in the rule's calendar. Exported as RRULE `UNTIL` for daily/weekly. |
| `recurrenceRules[0].skip` | `omit`, `backward` or `forward` | RFC 7529 handling of dates missing in a month/year (monthly and yearly only). Absent means `omit` (the RFC default). |
| `recurrenceOverrides` | `{ [recurrenceId]: { excluded?, title?, description?, start? } }`? | Changes to single occurrences (JSCalendar's `recurrenceOverrides`). Keyed by the *recurrence id*: the EpochDay on which the series itself places the occurrence (JSCalendar keys by LocalDateTime; an absolute day keeps the key calendar-neutral). `excluded` deletes it; `start` moves it. |
| `created`, `updated` | RFC 3339 UTC | Server-managed. |
| `sequence` | int | Incremented on every edit. Exported as iCalendar `SEQUENCE`. |

**Generated occurrences are never stored.** They are recomputed deterministically from these fields.
The same definition always yields the same occurrences. That is why editing just works: change the
definition, and every view and the feed recompute.

### Standards alignment, and intentional departures

| Standard | What we adopt | Where we depart, and why |
|---|---|---|
| **JSCalendar** (RFC 8984; draft-ietf-calext-jscalendarbis) | Object shape and names: `@type`, `uid`, `title`, `description`, `showWithoutTime`, `recurrenceRules[]` with `frequency`, `interval`, `rscale`, `skip`. | **`start` is a structured native date, not an ISO `LocalDateTime` string.** JSCalendar's `start` plus `rscale` would make the ISO/Gregorian date the stored truth, with the Hebrew meaning re-derived from it. We store the Hebrew date itself so that the definition never depends on Gregorian conversion. A lossless mapping to JSCalendar exists: `start` = ISO date of the first occurrence, `rscale` = calendar. |
| **RFC 7529 (RSCALE)** | Leap-month codes (`5L`, which maps to `M05L`), `SKIP` semantics, evaluation order (month skip before day skip, then cascade). The §4.3.3 example (Adar I falling forward to Adar in common years) is implemented exactly. | RFC 7529 does not define BACKWARD for a missing leap month. We choose the preceding month (Shevat) by symmetry with FORWARD. RSCALE identifiers are uppercase CLDR names (`HEBREW`, `GREGORIAN`); internally we use the BCP-47/Temporal ids (`hebrew`, `gregory`). |
| **iCalendar (RFC 5545)** | Output format for the ICS feed. | The feed is derived output. We do not emit RRULE/RSCALE because Apple Calendar does not implement RSCALE. See §5. |

### Editing one occurrence vs. the future (Apple Calendar's model)

`applyOccurrenceAction` (`core/events/store.ts`, served by `POST /api/events/:uid/occurrences`) runs as
one atomic document change:
- **edit-this** stores only the differences (title, notes, day) as an override; editing back to the
  series values removes it. **delete-this** stores `excluded`.
- **edit-future** ends the series the day before the occurrence (`until`), drops its overrides from that
  day on, and creates a new event from the edited values; **delete-future** only ends the series. On the
  first occurrence both simply act on the whole event.
- The editor offers only *future* when the repeat rule itself changed.
- ICS: daily/weekly series get `EXDATE` for deleted occurrences and same-UID instances with
  `RECURRENCE-ID` for changed ones (RFC 5545 §3.8.4.4); materialised series carry the change directly.

### Recurrence semantics

| Frequency | Evaluated in | Meaning |
|---|---|---|
| `daily`, `weekly` | the absolute day axis | Every N days / 7·N days from the start day. Identical in every calendar, so no calendar choice is involved. |
| `monthly` | the event's calendar | The same day-of-month every N months *of that calendar*. A Hebrew monthly event follows Hebrew months, Adar I included in leap years. A day the month lacks (30th in a 29-day month, 31st) follows SKIP: omit, last day (backward) or 1st of next month (forward). |
| `yearly` | the event's calendar | As described below. |

The rest of this section describes yearly rules.

`expandEvent(event, range)` iterates **years of the event's own calendar**. For each year it resolves
`(monthCode, day)` with `resolveYearlyDate`:

1. **Missing month.** If the month does not exist that year (only Hebrew Adar I in a common year), the
   calendar-specific `substituteMissingMonth` applies the skip policy: forward → Adar (M06), backward →
   Shevat (M05), omit → no occurrence.
2. **Missing day.** If the day exceeds the month's length (30 Cheshvan, 30 Kislev, 30 Adar I → Adar,
   Gregorian 29 February), the skip policy applies again: forward → the 1st of the next month, backward →
   the last day of the month, omit → no occurrence.

Each occurrence carries an `adjustment` flag (`none`, `month-substituted`, `day-forward`, `day-backward`).
The UI marks adjusted occurrences.

**Adar in leap years.** An event defined in Adar of a common year (`M06`) falls in **Adar II** in leap
years. This follows from the month-code model (M06 is "the" Adar, the one adjacent to Nisan) and matches
the prevailing birthday custom.

**Validated equivalence:** for every possible birth date in 5780–5790 and 20 years after each (over 70,000
cases), `skip: "forward"` produces exactly the date Hebcal's `birthdayOrAnniversary` algorithm produces.
In other words, the generic RFC 7529 rule *is* the Hebrew birthday rule. The editor therefore defaults to
`forward`. It only shows the policy selector when the chosen date can actually be missing in some year.

### What is deliberately *not* applied generically

**Yahrzeit** (the anniversary of a death) is **not** an ordinary yearly recurrence. For example, a death
on 30 Cheshvan, when the first anniversary year has a 29-day Cheshvan, is observed on 29 Cheshvan, not
1 Kislev. A death in Adar of a common year is observed in Adar I or Adar II depending on custom. Applying
the generic rule would be silently wrong, so v1 offers no yahrzeit mode. It is planned as a separate rule
type that delegates to Hebcal's `getYahrzeit` (see §8).

---

## 5. Layer D — Presentation and export

### Month view and day list

`MonthView` is **one generic component** driven entirely by a `CalendarAdapter`. The UI shows a single
month view in one of two modes, *Hebrew · Gregorian* or *Gregorian · Hebrew*. The mode only chooses which
adapter is `cal` (the grid's own months) and which is `other` (the secondary label in each cell). In Hebrew
mode the grid is not a Gregorian grid with Hebrew labels. Its first cell is 1 Kislev, it has exactly as
many cells as Kislev has days that year, and the month selector lists that year's months (13 in a leap
year, including Adar I and Adar II). Every cell is an `EpochDay`, so:

- switching mode keeps the selected absolute day and re-expresses the visible month in the other calendar;
- events and "today" line up by absolute day, whatever the mode;
- each cell shows the other calendar's date, with the month name on the day that month starts.

The mode is a per-browser display preference (localStorage). It never affects stored events.

Under the month, a **day list** (modelled on Apple Calendar's list) shows the occurrences on the selected
day, which defaults to today. It is computed with the same `expandAll`, over a one-day range. Adding a third
calendar means adding a third mode.

### ICS feed (`GET /calendar.ics`)

- **Daily and weekly rules** are calendar-independent, so they are exported as one VEVENT with a standard
  `RRULE:FREQ=DAILY|WEEKLY;INTERVAL=n`, which every client expands itself.

- **Materialised occurrences.** Apple Calendar (and Google, and Outlook) do not implement RSCALE, so the
  feed contains one all-day `VEVENT` per occurrence, with `DTSTART;VALUE=DATE` and an exclusive
  `DTEND;VALUE=DATE` (next day), as RFC 5545 requires for all-day events.
- **Bounded rolling window.** By default the feed covers 365 days back and 1,098 days (3 years) forward,
  measured on the absolute day axis. Override with `UC_FEED_PAST_DAYS` / `UC_FEED_FUTURE_DAYS`.
- **Stable UIDs.** `UID = <event uid>.<calendar>-<native year>@<UC_UID_DOMAIN>`. An occurrence keeps its UID
  on every refresh. When an event is edited, the occurrence for "Kislev 5787" keeps its UID and *moves*,
  so clients update it instead of creating a duplicate. `SEQUENCE` and `LAST-MODIFIED` change on edit.
  `DTSTAMP` is the event's `updated` time, so unchanged events produce byte-identical VEVENTs.
- **Native semantics preserved for humans.** `DESCRIPTION` contains the native date (in English and in
  Hebrew) and the rule. `X-UNIVERSAL-CALENDAR-NATIVE-DATE` carries the machine-readable native date.
- `REFRESH-INTERVAL` (RFC 7986) and `X-PUBLISHED-TTL` suggest a 6-hour refresh.
- Lines are CRLF-terminated and folded at 75 octets without splitting UTF-8 sequences. Text is escaped
  according to RFC 5545 §3.3.11.

**Important:** UIDs embed `UC_UID_DOMAIN` (default `universal-calendar`), not the request host. Do not
change it after people have subscribed, or every occurrence will appear as new.

---

## 5b. Calendars (collections) and built-in holidays

**User calendars.** Schema v2 adds `collections: [{ id, name, color, created }]`, and each event has a
`collectionId`. JMAP for Calendars calls these objects "Calendars"; the code says *collection* because
"calendar" already means a calendar *system* (hebrew/gregory). Older v1 documents are migrated on load
(every event goes into the default `personal` collection). Show/hide is a per-browser display preference.
Each collection has its own feed (`/calendar.ics?collection=<id>`); `/calendar.ics` serves all of them.

**Built-in holidays** (`src/core/holidays/`) are a read-only, rule-based layer, never stored:
- Each holiday is a Hebrew date (month code + day, Adar as `M06`, Adar I as `M05L`), an optional day
  offset (Chanukah), an optional region (Israel / diaspora), a `since` year, and an optional **named shift
  rule**: fasts on Shabbat postponed to Sunday (Tzom Gedaliah, 17 Tammuz, Tish'a B'Av) or moved back to
  Thursday (Ta'anit Esther, Ta'anit Bechorot, also the Sigd); Yom HaShoah (Fri→Thu, Sun→Mon); Yom
  HaAtzma'ut (Fri/Sat→Thu, Mon→Tue from 5764) with Yom HaZikaron the day before; Leil Selichot.
  Rosh Chodesh is derived from month lengths.
- Categories: festivals (`major`), `minor`, `fast`, `modern` (national days), `roshchodesh`.
- **Verification:** `tests/holidays.test.ts` compares every holiday on every day of 5710–5899 with Hebcal
  (`@hebcal/core`, a dev-only dependency), in Israel and the diaspora. They match exactly.
- Not included yet: special Shabbatot, parashat hashavua, Omer count, candle-lighting times (need a
  location), and Israeli memorial days other than the main national days.
- `HOLIDAY_SETS` in `registry.ts` is where other sets (Islamic, Christian, national) would be added.

**Export** (`src/ui/export.ts`) covers only user events: `.ics` (five years back to ten ahead, daily and
weekly as RRULE) and a lossless `.json` backup in the store schema.

## 6. Persistence

The store is one small JSON document (`{ schemaVersion: 1, events: [...] }`), read and written whole.

| Backend | When | Notes |
|---|---|---|
| `file` | Local `next dev` / `next start`, any self-hosted Node server | `data/events.json` (or `UC_DATA_FILE`). Atomic write via temp file and rename. |
| `redis` | Redis credentials found in the environment (see `detectRedis`) | Upstash REST API (`*_REST_API_URL`/`TOKEN`, any prefix) or the standard Redis protocol (`REDIS_URL`, `KV_URL`, `*_REDIS_URL`) via node-redis. One key. Works on Vercel. |
| `none` | On Vercel with neither of the above | Server writes return 503. The UI switches to **browser storage** (localStorage) and states plainly that the ICS feed cannot see those events. |

**Why Upstash Redis?** Vercel's serverless file system is read-only apart from an ephemeral `/tmp`, so a
JSON file cannot persist there. Among the persistence options that integrate with Vercel, a single Redis
key is the smallest thing that works. There is no schema to migrate, no SQL and no SDK (plain `fetch`),
the free tier is ample for a personal calendar, and the same document shape is used everywhere. Upstash is
also usable outside Vercel, so there is no lock-in.

**Trade-offs:**
- Last write wins. Two simultaneous edits from different devices can overwrite each other. Within one
  server process writes are serialised. This is acceptable for a single-user prototype. The fix later is a
  per-event key or an optimistic `sequence` check.
- The whole document is rewritten on each change. This is fine up to thousands of events.
- Browser-storage mode is per browser and per device, and is invisible to the feed. That is by design.

**Access control (not authentication).** Without an account system, a public deployment would let anyone
edit. Two optional shared secrets cover the single-user case:
- `UC_EDIT_TOKEN`: writes require `Authorization: Bearer …`. The UI asks for the token once.
- `UC_FEED_TOKEN`: the feed requires `?token=…`. Use a different value, because the feed URL is stored in
  Apple Calendar.

---

## 7. Testing

`npm test` runs 36 tests (vitest):

- **Hebrew engine against ICU**: every day from 1900-01-01 to 2100-12-31 (73,414 days) converted by Hebcal
  and by ICU must agree, and must round-trip. Month lengths for 5600–5900 must agree. The leap-year pattern
  (7 in 19) must agree.
- **Gregorian engine** against `Date.UTC` day counts, 1600–2400.
- **Structure**: Adar I/II in leap years, variable Cheshvan and Kislev, Hebrew months spanning Gregorian
  month boundaries, invalid dates rejected, navigation across leap months and year ends.
- **Recurrence**: 15 Kislev stays 15 Kislev for 50 years and lands on the ICU-confirmed day; the Gregorian
  case is symmetric; 30 Cheshvan, Adar I and 29 February under all three skip policies; intervals; the
  birthday equivalence above; edits move occurrences without changing their identity; stored JSON contains
  no generated dates.
- **ICS**: parsed by ical.js; all-day DATE values; escaping and Hebrew text survive folding; CRLF and
  75-octet lines; UID uniqueness and stability across refreshes and edits.
- **Storage**: file round-trip; `none` mode refuses writes; Upstash REST protocol against a simulated server.

---

## 8. Limitations and future extensions

**Known limitations**
- No import yet for the `.json` backup (export only).
- The display mode is stored per browser, not per user.
- All-day events only. There are no timed events and no event time zones.
- Recurrence by day, week, month or year with an interval; no `until`/`count`, no "nth weekday of the month", and no exceptions (EXDATE).
- Civil (midnight) day boundaries only. There is no sunset or erev logic.
- No yahrzeit mode (intentionally; see §4).
- Single user; last write wins.
- The Upstash backend has been tested only against a simulated REST server in this environment, not
  against a live Upstash instance.
- Subscribing from Apple Calendar requires a public URL. It has not been tested against a real Apple
  Calendar client from this environment (see README).

**Extension path**
1. **More calendars.** Implement `CalendarAdapter` for `islamic-umalqura`, `persian`, `chinese` and
   others (ICU via Temporal is the natural engine), then register them in `registry.ts`. Month codes
   already handle Chinese leap months (`M04L`).
2. **Yahrzeit rule type.** `recurrenceRules[0]["x-uc-kind"] = "yahrzeit"` (or a separate field), with the
   rule computed by Hebcal's `getYahrzeit` and the custom selectable (Adar I or Adar II for deaths in a
   common-year Adar).
3. **Sunset boundaries.** Add an optional location to the event or user, use `@hebcal/noaa` for sunset,
   and show "begins at sunset on the previous evening" on the Gregorian side and in the ICS feed (as a
   timed `DTSTART` on the eve, if desired).
4. **Timed events.** Add `start.time` (local time) and `timeZone` (IANA). Expand to `Temporal.ZonedDateTime`.
5. **Interop.** A JSCalendar import/export mapper, and ICS export with `RRULE;RSCALE=HEBREW` as an
   alternative feed for clients that support RFC 7529.
6. **Storage.** Per-event keys and optimistic concurrency on `sequence`; CalDAV is possible later.


## Owner login

`src/server/auth.ts` implements a single-owner login configured only by environment variables
(`UC_USER`, `UC_PASSWORD`, optional `UC_SESSION_SECRET`). Sessions are stateless: the cookie
`ittim_session = v1.<user>.<expiry>.<HMAC>` is signed with a key derived from the credentials (Web Crypto,
so the same code runs in the proxy and in route handlers). Checks happen twice: `src/proxy.ts` gates every
page and API path (redirecting pages to `/login`, answering 401 for the API), and each API route calls
`guard()` again. Public paths: `/login`, `/api/login`, `/api/logout`, and the two feeds, which check their
own token. Credential comparison hashes both sides and compares digests in constant time. A half-configured
login (only one variable) fails closed.
