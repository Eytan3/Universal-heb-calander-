// Dev-only: writes tests/fixtures/extras-hebcal.json — Hebcal's weekly Torah portion (IL and diaspora),
// Omer count and special Shabbatot for 60 Hebrew years, used to verify our own rules.
//   node scripts/extras-reference.mjs
import { writeFileSync } from "node:fs";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";

const out = { generatedWith: "@hebcal/core", from: 5780, to: 5840, il: [], diaspora: [], omer: [], special: [] };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
for (const il of [true, false]) {
  const evs = HebrewCalendar.calendar({ start: new HDate(1, "Tishrei", 5780), end: new HDate(29, "Elul", 5840), sedrot: true, noHolidays: true, il });
  for (const e of evs) if (e.getFlags() & flags.PARSHA_HASHAVUA) (il ? out.il : out.diaspora).push([iso(e.getDate().greg()), e.getDesc().replace(/^Parashat /, "")]);
}
const evs = HebrewCalendar.calendar({ start: new HDate(1, "Tishrei", 5780), end: new HDate(29, "Elul", 5840), omer: true, il: true });
for (const e of evs) {
  if (e.getFlags() & flags.OMER_COUNT) out.omer.push([iso(e.getDate().greg()), e.omer]);
  if (e.getFlags() & flags.SPECIAL_SHABBAT) out.special.push([iso(e.getDate().greg()), e.getDesc()]);
}
writeFileSync(new URL("../tests/fixtures/extras-hebcal.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`IL ${out.il.length}, diaspora ${out.diaspora.length}, omer ${out.omer.length}, special ${out.special.length}`);
console.log(out.il.slice(0, 3), out.omer.slice(0, 2), [...new Set(out.special.map((x) => x[1]))]);
