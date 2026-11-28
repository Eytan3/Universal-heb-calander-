"use client";
import { useState } from "react";
import type { Locale } from "@/core/calendars/types";
import type { Strings } from "./i18n";
import type { Theme } from "./theme";
import { isPreview } from "./preview";
import { getEditToken, goToLogin, logout, serverInfo, setEditToken, withFeedToken, type EventRepository } from "./repository";
import type { EventStoreDocument } from "@/core/events/schema";
import { exportIcs, exportJson } from "./export";
import { importFromFile } from "./importFile";

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
  /** Called after a successful import so the calendar reloads. */
  onImported: () => Promise<void> | void;
}

export function SettingsDialog({ t, locale, onLocale, theme, onTheme, repo, doc, onClose, onImported }: Props) {
  const [importState, setImportState] = useState<{ busy?: boolean; message?: string; problems?: string[]; error?: boolean } | null>(null);
  const readOnly = repo?.kind === "server" && serverInfo.login === "viewer";

  async function importFile(file: File) {
    if (!repo) return;
    setImportState({ busy: true });
    setImportState(await importFromFile(repo, file, t, onImported));
  }
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(getEditToken());
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const feedUrl = withFeedToken(`${origin}/calendar.ics`);
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="grabber" aria-hidden />
        <header className="sheet-bar">
          <span />
          <h2 id="settings-title">{t.settings}</h2>
          <button type="button" className="bar-btn strong" onClick={onClose} autoFocus>{t.done}</button>
        </header>
        <div className="sheet-body">
          <h3 className="group-title">{t.languageLabel}</h3>
          <section className="group">
            <div className="row">
              <div className="segmented full">
                {(["he", "en"] as Locale[]).map((l) => (
                  <button type="button" key={l} className={l === locale ? "on neutral" : ""} aria-pressed={l === locale} onClick={() => onLocale(l)} lang={l}>
                    {l === "he" ? "עברית" : "English"}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <h3 className="group-title">{t.themeLabel}</h3>
          <section className="group">
            <div className="row">
              <div className="segmented full">
                {(["system", "light", "dark"] as Theme[]).map((th) => (
                  <button type="button" key={th} className={th === theme ? "on neutral" : ""} aria-pressed={th === theme} onClick={() => onTheme(th)}>
                    {t.themes[th]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <h3 className="group-title">{t.feed}</h3>
          <section className="group">
            {repo?.kind === "server" ? (
              <>
                <div className="row feed-row">
                  <code dir="ltr">{webcalUrl}</code>
                  <button type="button" className="link-btn" onClick={() => { navigator.clipboard?.writeText(webcalUrl).then(() => setCopied(true), () => undefined); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
                <div className="row sub">{t.feedHelp} {serverInfo.feedToken ? t.login.feedPrivate : t.feedPublicNote}</div>
              </>
            ) : <div className="row sub">{isPreview() ? t.previewNote : t.browserOnly}</div>}
          </section>

          {!readOnly && (
            <>
              <h3 className="group-title">{t.importTitle}</h3>
              <section className="group">
                <label className={`row link-row${importState?.busy ? " disabled" : ""}`}>
                  {importState?.busy ? t.importWorking : t.importButton}
                  <input type="file" accept=".json,application/json" hidden disabled={importState?.busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
                </label>
                {importState?.message && (
                  <div className={`row sub${importState.error ? " import-error" : ""}`} role="status">
                    <div>
                      {importState.message}
                      {importState.problems && importState.problems.length > 0 && (
                        <>
                          <br />{t.importProblems(importState.problems.length)}
                          <ul className="import-problems">{importState.problems.slice(0, 10).map((p, i) => <li key={i} dir="auto">{p}</li>)}</ul>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="row sub">{t.importHelp}</div>
              </section>
            </>
          )}

          <h3 className="group-title">{t.exportTitle}</h3>
          <section className="group">
            <button type="button" className="row link-row" onClick={() => exportIcs(doc, null, t.appName, locale)}>{t.exportIcs}</button>
            <button type="button" className="row link-row" onClick={() => exportJson(doc, doc.collections, t.appName)}>{t.exportJson}</button>
            <div className="row sub">{t.exportHelp(doc.events.length)}{isPreview() ? ` ${t.exportPreviewNote}` : ""}</div>
          </section>

          <h3 className="group-title">{t.storageLabel}</h3>
          <section className="group">
            <div className="row sub">{repo?.kind === "server" ? t.serverStorage(repo.storage) : t.storageBrowser}</div>
          </section>

          {serverInfo.login === "viewer" && (
            <>
              <h3 className="group-title">{t.login.account}</h3>
              <section className="group">
                <div className="row sub">{t.login.viewOnly}</div>
                <button type="button" className="row link-row" onClick={goToLogin}>{t.login.signInToEdit}</button>
              </section>
            </>
          )}

          {serverInfo.login === "signed-in" && (
            <>
              <h3 className="group-title">{t.login.account}</h3>
              <section className="group">
                <div className="row sub">{t.login.signedInAs(serverInfo.user)}</div>
                <button type="button" className="row danger-row" onClick={() => void logout()}>{t.login.logout}</button>
              </section>
            </>
          )}

          {repo?.kind === "server" && serverInfo.login === "off" && (
            <>
              <h3 className="group-title">{t.editTokenLabel}</h3>
              <section className="group">
                <div className="row">
                  <input className="row-input" type="password" dir="ltr" value={token} placeholder="••••••"
                    onChange={(e) => { setToken(e.target.value); setEditToken(e.target.value); }} aria-label={t.editTokenLabel} />
                  <button type="button" className="link-btn" onClick={() => { setToken(""); setEditToken(""); }}>{t.clearToken}</button>
                </div>
                <div className="row sub">{t.editTokenHelp}</div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
