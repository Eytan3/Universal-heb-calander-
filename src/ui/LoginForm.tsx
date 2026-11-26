"use client";

import { useEffect, useState } from "react";
import { STRINGS } from "./i18n";
import { syncThemeColor } from "./theme";
import type { Locale } from "@/core/calendars/types";

/** Only same-site paths may be used as the post-login destination (no open redirects). */
function safeNext(raw: string | null): string {
  return raw && /^\/(?![/\\])/.test(raw) ? raw : "/";
}

export default function LoginForm() {
  const [locale, setLocale] = useState<Locale>("he");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = STRINGS[locale];

  useEffect(() => syncThemeColor(), []);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("universal-calendar:locale"); } catch { /* ignore */ }
    const l: Locale = saved === "en" || saved === "he" ? saved : navigator.language.startsWith("he") ? "he" : "en";
    setLocale(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  }, [locale]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password }), cache: "no-store" });
      if (res.ok) {
        window.location.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(res.status === 429 ? t.login.tooMany(body.retryAfter ?? 30) : res.status === 401 ? t.login.wrong : body.error ?? t.login.failed);
      setPassword("");
    } catch {
      setError(t.login.failed);
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <svg viewBox="0 0 64 64" aria-hidden><rect x="6" y="10" width="52" height="46" rx="12" /><path d="M6 24h52M20 6v10M44 6v10" /></svg>
          <h1>{t.appName}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className="group">
          <label className="row login-row">
            <span>{t.login.user}</span>
            <input dir="auto" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="row login-row">
            <span>{t.login.password}</span>
            <input dir="auto" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="login-submit" disabled={busy}>{busy ? t.login.working : t.login.submit}</button>
        <a className="link-btn login-lang" href="/">{t.login.back}</a>
        <button type="button" className="link-btn login-lang" onClick={() => {
          const l: Locale = locale === "he" ? "en" : "he";
          setLocale(l);
          try { localStorage.setItem("universal-calendar:locale", l); } catch { /* ignore */ }
        }}>{locale === "he" ? "English" : "עברית"}</button>
      </form>
    </main>
  );
}
