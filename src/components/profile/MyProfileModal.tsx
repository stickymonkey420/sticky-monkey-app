"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { HANDLE_HINT, isHandleTakenError, validateHandle } from "@/lib/profile/handle";
import { X_HANDLE_HINT, normalizeXHandle, validateXHandle } from "@/lib/profile/xHandle";
import { ACCOUNT_TYPE_DEFS } from "@/lib/usersGroups/types";
import { saveProfileDetails, updateAvatarUrl, type ProfileDetailsInput } from "@/lib/usersGroups/queries";
import type { OnboardingAnswers } from "@/lib/dashboard/onboarding";
import OnboardingModal from "@/components/dashboard/OnboardingModal";

// Max upload size for a profile photo. The `avatars` storage bucket itself
// has no size limit configured, so this is enforced client-side only --
// generous enough for a phone photo, small enough to keep the public
// bucket from filling up with anything huge.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";

// Only the columns this modal needs -- a subset of EditProfileModal's admin
// PROFILE_COLUMNS, plus use_cases/onboarding_survey to seed a survey retake.
const SELF_PROFILE_COLUMNS =
  "id,name,email,username,date_of_birth,present_address,permanent_address,postal_code,avatar_url,account_types,use_cases,onboarding_survey,x_handle,is_demo";

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
  x_handle: string | null;
  is_demo: boolean | null;
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
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [clearingDemoData, setClearingDemoData] = useState(false);
  const [clearDemoError, setClearDemoError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [presentAddress, setPresentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [xHandle, setXHandle] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [retakeOpen, setRetakeOpen] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setXHandle(p.x_handle ?? "");
        setIsDemo(p.is_demo ?? false);
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
    setError(null);
    setSavedMessage(null);

    const handleError = validateHandle(username);
    if (handleError) {
      setError(handleError);
      return;
    }
    const normalizedXHandle = normalizeXHandle(xHandle);
    const xHandleError = validateXHandle(normalizedXHandle);
    if (xHandleError) {
      setError(xHandleError);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const input: ProfileDetailsInput = {
      name,
      username: username.trim() || null,
      email,
      date_of_birth: dob || null,
      present_address: presentAddress || null,
      permanent_address: permanentAddress || null,
      postal_code: postalCode || null,
      avatar_url: avatarUrl || null,
      account_types: accountTypes,
      x_handle: normalizedXHandle || null,
    };
    const { error: err } = await saveProfileDetails(supabase, userId, input);
    setSaving(false);
    if (err) {
      setError(isHandleTakenError(err) ? "That handle is already taken." : "Could not save. Try again.");
      return;
    }
    setSavedMessage("Saved.");
    await refresh(); // updates TopBar's avatar/name/email immediately
  }

  // Uploads a new photo to the `avatars` storage bucket (public read;
  // write restricted by RLS to `{auth.uid()}/...` paths -- see the bucket's
  // storage policies) and saves the resulting public URL immediately,
  // rather than waiting for the surrounding form's "Save Changes". This
  // matches how TopBar/ProfileSummaryCard expect to see the update: via
  // useProfile().refresh(), which both already subscribe to.
  async function uploadAvatarFile(file: File) {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image must be 5MB or smaller.");
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    const supabase = createClient();

    // Always store under a fixed "avatar.<ext>" name (upsert) so repeated
    // uploads don't pile up. Extension can still change between uploads
    // (png -> jpg, say), so clear out whatever's already in this user's
    // folder first -- otherwise the old file would just sit there orphaned
    // under its old extension forever.
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/avatar.${ext}`;

    const { data: existing } = await supabase.storage.from("avatars").list(userId);
    if (existing && existing.length) {
      await supabase.storage.from("avatars").remove(existing.map((f) => `${userId}/${f.name}`));
    }

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) {
      setAvatarUploading(false);
      setAvatarError("Upload failed. Try again.");
      return;
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust: the path (and so the base URL) is the same on every
    // upload because of the upsert above, so without this the browser
    // would keep showing the previous cached image after a new one saves.
    const freshUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: saveErr } = await updateAvatarUrl(supabase, userId, freshUrl);
    setAvatarUploading(false);
    if (saveErr) {
      setAvatarError("Uploaded, but couldn't save to your profile. Try again.");
      return;
    }
    setAvatarUrl(freshUrl);
    await refresh(); // updates TopBar's avatar immediately
  }

  function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (file) uploadAvatarFile(file);
  }

  async function removeAvatar() {
    if (!userId) return;
    setAvatarError(null);
    setAvatarUploading(true);
    const supabase = createClient();

    const { data: existing } = await supabase.storage.from("avatars").list(userId);
    if (existing && existing.length) {
      await supabase.storage.from("avatars").remove(existing.map((f) => `${userId}/${f.name}`));
    }

    const { error: saveErr } = await updateAvatarUrl(supabase, userId, null);
    setAvatarUploading(false);
    if (saveErr) {
      setAvatarError("Couldn't remove photo. Try again.");
      return;
    }
    setAvatarUrl("");
    await refresh();
  }

  // Self-service counterpart to the sign-in reset (reset_demo_data_if_needed):
  // wipes the fabricated demo dataset and flips is_demo off server-side
  // (clear_demo_data RPC), so the next sign-in never reseeds it back. A
  // full reload afterward is deliberate -- every "core money views" page
  // (Dashboard, Wallet, Card Center, Investments, Income, Options) is
  // reading data this just deleted out from under it.
  async function handleClearDemoData() {
    if (!userId || clearingDemoData) return;
    const ok = await confirm({
      title: "Clear demo data?",
      message:
        "This permanently deletes all of the sample bank, card, investment, and options data on this account so you can start entering your own. This can't be undone.",
      confirmLabel: "Clear Demo Data",
      danger: true,
    });
    if (!ok) return;

    setClearDemoError(null);
    setClearingDemoData(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("clear_demo_data");
    if (error) {
      setClearingDemoData(false);
      console.error("[My Profile] clear_demo_data failed", error);
      setClearDemoError("Could not clear demo data. Please try again.");
      return;
    }
    // Full reload rather than router.push -- every "core money views" page
    // (this one included, if already on Dashboard) holds client-fetched
    // state read from tables clear_demo_data just emptied, and a client
    // navigation alone wouldn't force those to refetch.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
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
            <div className="mb-5 flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl || DEFAULT_AVATAR_URL}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-[10px] font-semibold text-white">
                    …
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-60"
                  >
                    {avatarUploading ? "Uploading…" : "Change Photo"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      disabled={avatarUploading}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onAvatarFileSelected}
                  className="hidden"
                />
                {avatarError ? (
                  <div className="text-[11px] text-[#e05656]">{avatarError}</div>
                ) : (
                  <div className="text-[11px] text-text-muted">JPG or PNG, up to 5MB.</div>
                )}
              </div>
            </div>

            <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Account</h3>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">Handle</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sandmonkey15"
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-[11px] text-text-muted">
                {HANDLE_HINT} Used to identify you on Game-a-Fi leaderboards, leagues, and tournaments instead of
                your name.
              </p>
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-muted">X (Twitter) Handle</label>
              <input
                type="text"
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                placeholder="e.g. sandmonkey15"
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-[11px] text-text-muted">
                {X_HANDLE_HINT} Optional -- lets &ldquo;Share to X&rdquo; links on Trade Off @mention you directly.
              </p>
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

            {isDemo && (
              <>
                <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Demo Account</h3>
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-card-border p-3">
                  <p className="text-xs text-text-muted">
                    This account is loaded with sample bank, card, and investment data. Clear it to start entering
                    your own -- it won&apos;t come back the next time you sign in.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearDemoData}
                    disabled={clearingDemoData}
                    className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: "#ff5c7a" }}
                  >
                    {clearingDemoData ? "Clearing…" : "Clear Demo Data"}
                  </button>
                </div>
                {clearDemoError && <div className="mb-2 text-xs text-[#e05656]">{clearDemoError}</div>}
              </>
            )}

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
