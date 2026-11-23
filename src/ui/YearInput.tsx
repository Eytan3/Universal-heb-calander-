"use client";
import { useEffect, useState } from "react";

/**
 * A year field that can actually be typed into. It keeps its own draft text and only
 * commits a valid year: immediately once 4+ digits form a valid year (so typing "5790"
 * or using the spinner works live), otherwise on Enter/blur. Invalid drafts revert.
 */
export function YearInput(p: {
  value: number; min: number; max: number; onCommit: (year: number) => void; className?: string; ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(p.value));
  useEffect(() => setDraft(String(p.value)), [p.value]);

  const valid = (text: string) => {
    const n = Number(text);
    return text.trim() !== "" && Number.isInteger(n) && n >= p.min && n <= p.max ? n : null;
  };
  const commit = (text: string) => {
    const n = valid(text);
    if (n === null) setDraft(String(p.value));
    else if (n !== p.value) p.onCommit(n);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      className={p.className}
      aria-label={p.ariaLabel}
      min={p.min}
      max={p.max}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = valid(text);
        if (n !== null && text.replace(/^-/, "").length >= 4 && n !== p.value) p.onCommit(n);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
    />
  );
}
