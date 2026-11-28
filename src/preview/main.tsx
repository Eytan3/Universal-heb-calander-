/**
 * Entry point for the standalone preview: the same App, with no server.
 * Events live in this browser's localStorage; a few samples are added on first visit.
 */
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { createEvent, defaultCollection, jewishCollection, SCHEMA_VERSION, type EventInput } from "@/core/events/schema";
import { gregorian, hebrew } from "@/core/calendars/registry";
import { todayEpochDay } from "@/core/time/epochDay";
import App from "@/ui/App";

(window as { __UC_PREVIEW__?: boolean }).__UC_PREVIEW__ = true;

function seedOnce() {
  const KEY = "universal-calendar:events:v1";
  try {
    if (localStorage.getItem(KEY) || localStorage.getItem("universal-calendar:seeded")) return;
    const today = todayEpochDay();
    const h = hebrew.fromEpochDay(today + 2);
    const g = gregorian.fromEpochDay(today + 10);
    const samples: EventInput[] = [
      { title: "יום הולדת עברי", start: h, recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "hebrew", skip: "forward" }] },
      { title: "Wedding anniversary", start: g, recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "gregory", skip: "backward" }] },
      { title: "פגישה", start: gregorian.fromEpochDay(today) },
    ];
    const events = samples.map((s, i) => createEvent(s, `sample-${i + 1}`));
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, collections: [defaultCollection(), jewishCollection()], events }));
    localStorage.setItem("universal-calendar:seeded", "1");
  } catch {
    /* storage unavailable: start empty */
  }
}

seedOnce();
createRoot(document.getElementById("root")!).render(<App />);
