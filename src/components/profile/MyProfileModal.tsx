"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { ACCOUNT_TYPE_DEFS } from "@/lib/usersGroups/types";
import { saveProfileDetails, type ProfileDetailsInput } from "@/lib/usersGroups/queries";
import type { OnboardingAnswers } from "@/lib/dashboard/onboarding";
import OnboardingModal from "@/components/dashboard/OnboardingModal";

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";

// Only the columns this modal needs -- a subset of EditProfileModal's admin
// PROFILE_COLUMNS, plus use_cases/onboarding_survey to seed a survey retake.
const SELF_PROFILE_COLUMNS =
  "id,name,email,username,date_of_birth,present_address,permanent_address,postal_code,avatar_url,account_types,use_cases,onboarding_survey";

type SelfProfile = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  date_of_birth: string | null;
  present_address: string | null;
  permanent_address: string | null;
  postal_code: string | null;
  avatar_url: string | null;
  account_types: string[] | null;
  use_cases: string[] | null;
  onboarding_survey: Record<string, unknown> | null;
};

// Self-service counterpart to the admin-only EditProfileModal (Users &
// Groups) -- "port over all profile edits from Webflow" for the signed-in
// user themselves, opened from TopBar's account dropdown. Same field set,
// same saveProfileDetails() mutation (RLS already permits a user to update
// every column on their own row except `role`), but this one fetches its
// own data instead of receiving a Profile prop. Also exposes a "Retake
// Survey" action that reuses OnboardingModal ("the same survey" shown at
// signup) in its controlled/retake mode.
export default function MyProfileModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useProfile();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SelfProfile | null>(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [presentAddress, setPresentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [accountTypes, setAccountTypes] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [retakeOpen, setRetakeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);

      const { data } = await supabase.from("profiles").select(SELF_PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        const p = data as unknown as SelfProfile;
        setProfile(p);
        setName(p.name ?? "");
        setUsername(p.username ?? "");
        setEmail(p.email ?? "");
        setDob(p.date_of_birth ?? "");
        setPresentAddress(p.present_address ?? "");
        setPermanentAddress(p.permanent_address ?? "");
        setPostalCode(p.postal_code ?? "");
        setAvatarUrl(p.avatar_url ?? "");
        setAccountTypes(p.account_types ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleType(key: string) {
    setAccountTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const supabase = createClient();
    const input: ProfileDetailsInput = {
      name,
      username: username || null,
      email,
      date_of_birth: dob || null,
      present_address: presentAddress || null,
      permanent_address: permanentAddress || null,
      postal_code: postalCode || null,
      avatar_url: avatarUrl || null,
      account_types: accountTypes,
    };
    const { error: err } = await saveProfileDetails(supabase, userId, input);
    setSaving(false);
    if (err) {
      setError("Could not save. Try again.");
      return;
    }
    setSavedMessage("Saved.");
    await refresh(); // updates TopBar's avatar/name/email immediately
  }

  async function reloadAfterRetake() {
    setRetakeOpen(false);
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select(SELF_PROFILE_COLUMNS).eq("id", userId).maybeSingle();
    if (data) setProfile(data as unknown as SelfProfile);
    await refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-text-primary">My Profile</h2>
        <div className="mb-5 text-xs text-text-muted">Update your account and personal details.</div>

        {loading ? (
          <div className="py-6 text-sm text-text-muted">Loading…</div>
        ) : (
          <>
            <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Account</h3>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Email</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} />
            </div>

            <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Personal Details</h3>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Date of Birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Present Address</label>
              <input
                type="text"
                value={presentAddress}
                onChange={(e) => setPresentAddress(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Permanent Address</label>
              <input
                type="text"
                value={permanentAddress}
                onChange={(e) => setPermanentAddress(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Postal Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            {/* Avatar URL is intentionally not shown here -- it's a raw
                storage/database URL and the user asked not to display those.
                The value is still loaded and saved back unchanged (via
                avatarUrl state below) so this form never wipes it out. */}

            <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Account Types</h3>
            <div className="mb-2 flex flex-col gap-1">
              {ACCOUNT_TYPE_DEFS.map((t) => (
                <label key={t.key} className="flex items-center gap-2.5 py-1.5 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={accountTypes.includes(t.key)}
                    onChange={() => toggleType(t.key)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  {t.label}
                </label>
              ))}
            </div>

            <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Onboarding Survey</h3>
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-card-border p-3">
              <p className="text-xs text-text-muted">
                Retake the same welcome survey you saw when you signed up, to update what dashboard features we show
                you.
              </p>
              <button
                type="button"
                onClick={() => setRetakeOpen(true)}
                className="shrink-0 rounded-lg border border-card-border px-3 py-2 text-xs font-semibold text-text-primary"
              >
                Retake Survey
              </button>
            </div>

            {error && <div className="mt-3 text-xs text-[#e05656]">{error}</div>}
            {savedMessage && !error && <div className="mt-3 text-xs text-[#3ddc97]">{savedMessage}</div>}

            <div className="mt-6 flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-semibold text-text-muted"
              >
                Close
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#4f8cff" }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </>
        )}
      </div>

      {retakeOpen && (
        <OnboardingModal
          forceOpen
          initialUseCases={profile?.use_cases ?? null}
          initialAnswers={(profile?.onboarding_survey as OnboardingAnswers | null) ?? null}
          onClose={reloadAfterRetake}
        />
      )}
    </div>
  );
}
