import { describe, expect, it } from "vitest";
import ref from "./fixtures/extras-hebcal.json";
import { parashot } from "@/core/holidays/parasha";
import { omerDays, specialShabbatot, SPECIAL_NAMES } from "@/core/holidays/extras";
import { computedOccurrences } from "@/core/holidays/computed";
import { gregorian } from "@/core/calendars/gregorian";
import { hebrew } from "@/core/calendars/hebrew";
import { emptyDocument, jewishCollection, JEWISH_COLLECTION_ID } from "@/core/events/schema";
import { addCollection, addEvent, changeCollection } from "@/core/events/store";
import { buildCollectionsIcs } from "@/core/export/ics";
import { importBackup } from "@/core/events/import";
import { cityById } from "@/core/zmanim/cities";

/** tests/fixtures/extras-hebcal.json comes from scripts/extras-reference.mjs (@hebcal/core), 5780–5840. */
type Ref = { il: [string, string][]; diaspora: [string, string][]; omer: [string, number][]; special: [string, string][] };
const r = ref as unknown as Ref;
const iso = (d: number) => { const g = gregorian.fromEpochDay(d); return `${g.year}-${g.monthCode.slice(1)}-${String(g.day).padStart(2, "0")}`; };
const years = { start: hebrew.toEpochDay({ year: 5780, monthCode: "M01", day: 1 }), end: hebrew.toEpochDay({ year: 5841, monthCode: "M01", day: 1 }) };

describe("weekly Torah portion: 60 years, identical to Hebcal", () => {
  for (const region of ["il", "diaspora"] as const) {
    it(region === "il" ? "Israel" : "diaspora", () => {
      const ours = parashot(years, region).map((x) => `${iso(x.epochDay)} ${x.en}`);
      expect(ours).toEqual(r[region].map(([d, n]) => `${d} ${n}`));
    });
  }
  it("Hebrew names join with a dash", () => {
    const vp = parashot(years, "diaspora").find((x) => x.en === "Vayakhel-Pekudei")!;
    expect(vp.he).toBe("ויקהל–פקודי");
  });
});

describe("Omer and special Shabbatot: 60 years, identical to Hebcal", () => {
  it("Omer", () => {
    expect(omerDays(years).map((o) => `${iso(o.epochDay)} ${o.n}`)).toEqual(r.omer.map(([d, n]) => `${d} ${n}`));
  });
  it("special Shabbatot", () => {
    const ours = specialShabbatot(years, "il").map((x) => `${iso(x.epochDay)} ${SPECIAL_NAMES[x.id][0]}`).sort();
    expect(ours).toEqual(r.special.map(([d, n]) => `${d} ${n}`).sort());
  });
  it("Omer labels in Hebrew numerals", () => {
    const cal = { ...jewishCollection(), jewish: { region: "il" as const, categories: ["omer" as const] } };
    const labels = computedOccurrences(cal, years).slice(0, 49).map((o) => o.he);
    expect(labels[0]).toBe("ספירת העומר: א׳ בעומר");
    expect(labels[14]).toBe("ספירת העומר: ט״ו בעומר");
    expect(labels[32]).toBe("ספירת העומר: ל״ג בעומר");
    expect(labels[48]).toBe("ספירת העומר: מ״ט בעומר");
  });
});

describe("export matrix: every combination of calendar kinds and formats", () => {
  const range = { start: hebrew.toEpochDay({ year: 5787, monthCode: "M01", day: 1 }), end: hebrew.toEpochDay({ year: 5788, monthCode: "M01", day: 1 }) };
  function fullDoc() {
    const doc = emptyDocument();
    const jlm = cityById("jerusalem")!;
    changeCollection(doc, JEWISH_COLLECTION_ID, { name: "", color: "#5e35b1", jewish: {
      region: "il", categories: ["major", "minor", "fast", "modern", "roshchodesh", "parasha", "special", "omer"],
      zmanim: { place: { name: "ירושלים", lat: jlm.lat, lon: jlm.lon, tz: jlm.tz, cityId: jlm.id }, candleMinutes: 40, havdalah: { degrees: 8.5 } } } });
    addCollection(doc, { name: "עבודה", color: "#00897b" }, "work");
    addEvent(doc, { title: "יומולדת", start: { calendar: "hebrew", year: 5750, monthCode: "M03", day: 16 }, recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "hebrew" }] }, "bd");
    addEvent(doc, { title: "ישיבה", collectionId: "work", start: { calendar: "gregory", year: 2026, monthCode: "M10", day: 5 }, showWithoutTime: false, startTime: "09:30", durationMinutes: 60, timeZone: "Asia/Jerusalem",
      recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "weekly", rscale: "gregory" }] }, "mtg");
    addEvent(doc, { title: "חופש", collectionId: "work", start: { calendar: "gregory", year: 2027, monthCode: "M08", day: 1 }, recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "daily", rscale: "gregory", until: { calendar: "gregory", year: 2027, monthCode: "M08", day: 7 } }] }, "vac");
    return doc;
  }
  const valid = (ics: string) => {
    const lines = ics.split("\r\n");
    expect(lines.at(-1)).toBe("");
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const u = ics.replace(/\r\n /g, "").split("\r\n");
    expect(u.filter((l) => l === "BEGIN:VEVENT").length).toBe(u.filter((l) => l === "END:VEVENT").length);
    for (const l of u.filter((x) => x.startsWith("DTSTART"))) expect(l).toMatch(/^DTSTART(;VALUE=DATE:\d{8}|:\d{8}T\d{6}Z)$/);
    const uids = u.filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
    return u;
  };

  for (const [label, ids] of [["all", null], ["personal", ["personal"]], ["work", ["work"]], ["computed", [JEWISH_COLLECTION_ID]], ["work+computed", ["work", JEWISH_COLLECTION_ID]]] as const) {
    it(`.ics — ${label}`, () => {
      const u = valid(buildCollectionsIcs(fullDoc(), ids as string[] | null, { range, calendarName: "x", locale: "he" }));
      const want = (k: string) => ids === null || (ids as readonly string[]).includes(k);
      expect(u.some((l) => l.startsWith("SUMMARY:יומולדת"))).toBe(want("personal"));
      expect(u.some((l) => l === "SUMMARY:ישיבה")).toBe(want("work"));
      expect(u.some((l) => l.startsWith("UID:holiday.parasha."))).toBe(want(JEWISH_COLLECTION_ID));
      expect(u.some((l) => l.startsWith("UID:holiday.candles."))).toBe(want(JEWISH_COLLECTION_ID));
      expect(u.some((l) => l.startsWith("UID:holiday.omer."))).toBe(want(JEWISH_COLLECTION_ID));
      expect(u.some((l) => l.startsWith("UID:holiday.special-zachor."))).toBe(want(JEWISH_COLLECTION_ID));
      if (want("work")) expect(u.filter((l) => l === "SUMMARY:ישיבה").length).toBeGreaterThan(40); // weekly, timed → materialised
      if (want("work")) expect(u.some((l) => l.startsWith("RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20270807"))).toBe(true);
    });
  }

  it(".json — backup of everything restores everything", () => {
    const doc = fullDoc();
    const file = JSON.parse(JSON.stringify({ schemaVersion: doc.schemaVersion, exported: "x", collections: doc.collections, events: doc.events }));
    const target = emptyDocument();
    target.collections = target.collections.filter((c) => c.kind !== "jewish"); // a "clean" target
    let n = 0;
    const res = importBackup(target, file, () => `id${++n}`);
    expect(res.errors).toEqual([]);
    expect(res.added).toBe(3);
    const before = buildCollectionsIcs(doc, null, { range, calendarName: "x", locale: "he" }).replace(/^(DTSTAMP|LAST-MODIFIED|CREATED|UID).*$/gm, "");
    const after = buildCollectionsIcs(target, null, { range, calendarName: "x", locale: "he" }).replace(/^(DTSTAMP|LAST-MODIFIED|CREATED|UID).*$/gm, "");
    const norm = (s: string) => s.replace(/\r\n /g, "").split("\r\n").filter((l) => l && !/^(DTSTAMP|LAST-MODIFIED|CREATED|UID|SEQUENCE)/.test(l)).sort().join("\n");
    expect(norm(after)).toBe(norm(before)); // same entries, same dates and times
  });
});
