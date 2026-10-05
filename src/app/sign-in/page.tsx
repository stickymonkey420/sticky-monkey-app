"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";
import AuthPromises from "@/components/auth/AuthPromises";
import Turnstile, { CAPTCHA_ENABLED } from "@/components/auth/Turnstile";

const inputClass =
  "w-full rounded-lg border border-card-border bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-[#4f8cff] focus:outline-none";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // Two-factor step: shown after a correct password when the account has an
  // authenticator, or when the server sent us here (?mfa=1) mid-session.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function startMfaIfNeeded(): Promise<boolean> {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2")) return false;
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) return false;
    setMfaFactorId(factor.id);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!new URLSearchParams(window.location.search).has("mfa")) return;
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled || !(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2")) return;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (!cancelled && factors?.totp?.[0]) setMfaFactorId(factors.totp[0].id);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function finishSignIn() {
    const supabase = createClient();
    // No-op for a normal account (the RPC checks profiles.is_demo itself
    // and returns immediately if false). For a demo account, this wipes
    // and reseeds its "core money views" data back to the fabricated
    // baseline every time it signs in, so edits made last session never
    // stick around. Fire-and-forget-ish: awaited so the dashboard never
    // renders a half-reset demo account, but a failure here shouldn't
    // block a real sign-in, so it's logged rather than surfaced as an
    // error.
    const { error: resetError } = await supabase.rpc("reset_demo_data_if_needed");
    if (resetError) {
      console.error("[sign-in] reset_demo_data_if_needed failed", resetError);
    }
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Please wait for the security check to finish.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    // Clear any existing session before attempting the new one. Without
    // this, someone already signed in as account A who mistypes account
    // B's password stays fully signed in as A after the "failed" attempt
    // -- easy to mistake for the wrong credentials having worked. Signing
    // out first guarantees a failed attempt actually leaves no one signed
    // in, matching the error shown on screen. (Signing in with account A's
    // own correct credentials afterward is a normal no-op re-login.)
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      // Tokens are single-use: get a fresh one for the next attempt.
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      setLoading(false);
      setError(error.message);
      return;
    }
    if (await startMfaIfNeeded()) {
      setLoading(false);
      return;
    }
    await finishSignIn();
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || loading) return;
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode.trim() });
    if (error) {
      setLoading(false);
      setMfaCode("");
      setError("That code didn't work. Check your authenticator app and try again.");
      return;
    }
    await finishSignIn();
  }

  async function cancelMfa() {
    await createClient().auth.signOut();
    setMfaFactorId(null);
    setMfaCode("");
    setPassword("");
    setError(null);
    setLoading(false);
  }


  if (mfaFactorId) {
    return (
      <AuthCard title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app.">
        <form onSubmit={verifyMfa} className="flex flex-col gap-3.5">
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            aria-label="Authenticator code"
            className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
          />
          {error && <div className="text-sm" style={{ color: "#ff6b6b" }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || mfaCode.length !== 6}
            className="mt-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-text-muted">
          <button type="button" onClick={cancelMfa} style={{ color: "#4f8cff" }}>
            Use a different account
          </button>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-text-muted" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs" style={{ color: "#4f8cff" }}>
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
          />
        </div>

        <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

        {error && <div className="text-sm" style={{ color: "#ff6b6b" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "#4f8cff" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <AuthPromises />

      <p className="mt-5 text-center text-sm text-text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" style={{ color: "#4f8cff" }}>
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}
