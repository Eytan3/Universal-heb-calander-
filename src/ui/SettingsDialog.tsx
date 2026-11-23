"use client";
import { useState } from "react";
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";
import { getEditToken, setEditToken, type EventRepository } from "./repository";

interface Props {
  t: Strings;
  locale: Locale;
  onLocale: (l: Locale) => void;
  repo: EventRepository | null;
  onClose: () => void;
}

export function SettingsDialog({ t, locale, onLocale, repo, onClose }: Props) {
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
          <h3>{t.feed}</h3>
          {repo?.kind === "server" ? (
            <>
              <p className="muted">{t.feedHelp}</p>
              <div className="feed-row">
                <code dir="ltr">{webcalUrl}</code>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(webcalUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? t.copied : t.copy}
                </button>
              </div>
              <p className="muted small">{t.feedPublicNote} <a href={feedUrl}>calendar.ics</a></p>
            </>
          ) : <p className="muted">{t.browserOnly}</p>}
        </section>

        <section className="settings-section">
          <h3>{t.storageLabel}</h3>
          <p className="muted">{repo?.kind === "server" ? t.serverStorage(repo.storage) : t.browserOnly}</p>
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
