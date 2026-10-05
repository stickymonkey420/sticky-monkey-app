"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";
import Turnstile, { CAPTCHA_ENABLED } from "@/components/auth/Turnstile";

const inputClass =
  "w-full rounded-lg border border-card-border bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-[#4f8cff] focus:outline-none";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Please wait for the security check to finish.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
      ...(captchaToken ? { captchaToken } : {}),
    });
    setLoading(false);
    if (error) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="Almost there.">
        <p className="text-sm text-text-muted">
          If an account exists for <span className="text-text-primary">{email}</span>, we sent a
          link to reset your password.
        </p>
        <p className="mt-5 text-center text-sm text-text-muted">
          <Link href="/sign-in" style={{ color: "#4f8cff" }}>
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to set a new one.">
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

        <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

        {error && <div className="text-sm" style={{ color: "#ff6b6b" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "#4f8cff" }}
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        <Link href="/sign-in" style={{ color: "#4f8cff" }}>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
