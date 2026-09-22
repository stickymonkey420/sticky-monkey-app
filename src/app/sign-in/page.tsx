"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const inputClass =
  "w-full rounded-lg border border-card-border bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-[#4f8cff] focus:outline-none";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
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

      <p className="mt-5 text-center text-sm text-text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" style={{ color: "#4f8cff" }}>
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}
