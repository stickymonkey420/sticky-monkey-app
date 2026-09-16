"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";
import { HANDLE_HINT, isHandleTakenError, validateHandle } from "@/lib/profile/handle";

const inputClass =
  "w-full rounded-lg border border-card-border bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-[#4f8cff] focus:outline-none";

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const handleError = validateHandle(handle);
    if (handleError) {
      setError(handleError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
        // Read by the handle_new_user() trigger (public.handle_new_user)
        // to seed profiles.name/username on insert -- "name" is the
        // combined display name used everywhere else in the app (Users &
        // Groups, TopBar, etc.), first_name/last_name ride along in
        // auth metadata only, for future use. "handle" is optional --
        // an empty string is coalesced to NULL by the trigger, same as
        // clearing it later in My Profile.
        data: {
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          handle: handle.trim(),
        },
      },
    });
    setLoading(false);

    if (error) {
      // A taken handle fails the whole signUp() call (the handle_new_user
      // trigger runs inside the same transaction as the auth.users
      // insert, so a unique-index violation there rolls the signup back
      // entirely -- no orphaned account, safe to just let them retry).
      setError(isHandleTakenError(error.message) ? "That handle is already taken. Try another." : error.message);
      return;
    }

    if (data.session) {
      // Email confirmation is disabled on this project -- already signed in.
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <AuthCard title="Check your email" subtitle="Almost there.">
        <p className="text-sm text-text-muted">
          We sent a confirmation link to <span className="text-text-primary">{email}</span>. Click
          it to finish creating your account.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create an account" subtitle="Get started with Sticky Monkey Finance.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="first-name">
              First name
            </label>
            <input
              id="first-name"
              type="text"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              placeholder="John"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="last-name">
              Last name
            </label>
            <input
              id="last-name"
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              placeholder="Doe"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="handle">
            Handle <span className="text-text-muted/60">(optional)</span>
          </label>
          <input
            id="handle"
            type="text"
            autoComplete="off"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className={inputClass}
            placeholder="jdoe"
          />
          <p className="mt-1 text-xs text-text-muted/70">
            Shown on Game-O-Fi leaderboards and matchups. {HANDLE_HINT} You can set or change this later too.
          </p>
        </div>
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
          <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted" htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" style={{ color: "#4f8cff" }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
