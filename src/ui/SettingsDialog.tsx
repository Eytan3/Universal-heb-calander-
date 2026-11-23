"use client";
import { useState } from "react";
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";
import type { Theme } from "./theme";
import { isPreview } from "./preview";
import { getEditToken, setEditToken, type EventRepository } from "./repository";
import type { EventStoreDocument } from "@/core/events/schema";
import { exportIcs, exportJson } from "./export";

interface Props {
  t: Strings;
  locale: Locale;
  onLocale: (l: Locale) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  repo: EventRepository | null;
  /** The user's own events and calendars (for export; never includes built-in holidays). */
  doc: EventStoreDocument;
  onClose: () => void;
}

export function SettingsDialog({ t, locale, onLocale, theme, onTheme, repo, doc, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(getEditToken());
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const feedUrl = `${origin}/calendar.ics`;
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="settings-title">{t.settings}</h2>

        <section className="settings-section">
          <h3>{t.languageLabel}</h3>
          <div className="segmented">
            {(["he", "en"] as Locale[]).map((l) => (
              <button type="button" key={l} className={l === locale ? "on neutral" : ""} aria-pressed={l === locale} onClick={() => onLocale(l)} lang={l}>
                {l === "he" ? "עברית" : "English"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>{t.themeLabel}</h3>
          <div className="segmented">
            {(["system", "light", "dark"] as Theme[]).map((th) => (
              <button type="button" key={th} className={th === theme ? "on neutral" : ""} aria-pressed={th === theme} onClick={() => onTheme(th)}>
                {t.themes[th]}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>{t.feed}</h3>
          {repo?.kind === "server" ? (
            <>
              <p className="muted">{t.feedHelp}</p>
              <div className="feed-row">
                <code dir="ltr">{webcalUrl}</code>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(webcalUrl).then(() => setCopied(true), () => undefined); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? t.copied : t.copy}
                </button>
              </div>
              <p className="muted small">{t.feedPublicNote} <a href={feedUrl}>calendar.ics</a></p>
            </>
          ) : <p className="muted">{isPreview() ? t.previewNote : t.browserOnly}</p>}
        </section>

        <section className="settings-section">
          <h3>{t.exportTitle}</h3>
          <p className="muted small">{t.exportHelp(doc.events.length)}</p>
          <div className="feed-row">
            <button type="button" onClick={() => exportIcs(doc.events, t.appName)}>{t.exportIcs}</button>
            <button type="button" onClick={() => exportJson(doc, doc.collections, t.appName)}>{t.exportJson}</button>
          </div>
          {isPreview() && <p className="muted small">{t.exportPreviewNote}</p>}
        </section>

        <section className="settings-section">
          <h3>{t.storageLabel}</h3>
          <p className="muted">{repo?.kind === "server" ? t.serverStorage(repo.storage) : t.storageBrowser}</p>
        </section>

        {repo?.kind === "server" && (
          <section className="settings-section">
            <h3>{t.editTokenLabel}</h3>
            <p className="muted small">{t.editTokenHelp}</p>
            <div className="feed-row">
              <input type="password" dir="ltr" value={token} onChange={(e) => { setToken(e.target.value); setEditToken(e.target.value); }} aria-label={t.editTokenLabel} />
              <button type="button" onClick={() => { setToken(""); setEditToken(""); }}>{t.clearToken}</button>
            </div>
          </section>
        )}

        <div className="actions">
          <span className="spacer" />
          <button type="button" className="primary" onClick={onClose} autoFocus>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
