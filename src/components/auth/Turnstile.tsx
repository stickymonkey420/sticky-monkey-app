"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile (free, invisible-first CAPTCHA) for the auth forms.
// Supabase Auth verifies the token server-side once "Bot and Abuse
// Protection" is enabled in the Supabase dashboard with the Turnstile secret.
//
// NEXT_PUBLIC_TURNSTILE_SITE_KEY (Vercel env) turns the widget on. Without it
// nothing renders and forms work as before, so deploy this first, then flip
// on CAPTCHA in Supabase.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const CAPTCHA_ENABLED = TURNSTILE_SITE_KEY.length > 0;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Turnstile failed to load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// `resetKey`: change it (e.g. increment after a failed submit) to get a fresh
// token -- each token is single-use.
export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!CAPTCHA_ENABLED) return;
    let cancelled = false;
    async function mount() {
      try {
        await loadScript();
      } catch {
        cb.current(null);
        return;
      }
      if (cancelled || !ref.current || !window.turnstile) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        appearance: "interaction-only",
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }
    mount();
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, [resetKey]);

  if (!CAPTCHA_ENABLED) return null;
  return <div ref={ref} className="flex min-h-0 justify-center" />;
}
