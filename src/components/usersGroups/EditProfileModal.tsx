"use client";

import { useState } from "react";
import { ACCOUNT_TYPE_DEFS, type Profile } from "@/lib/usersGroups/types";
import type { ProfileDetailsInput } from "@/lib/usersGroups/queries";
import { HANDLE_HINT, isHandleTakenError, validateHandle } from "@/lib/profile/handle";

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";

// Ported from the live script's openEditModal(): covers every profiles
// column the inline row doesn't (handle, DOB, addresses, postal code,
// avatar URL, account types) so an admin can fully manage a profile's
// record in one place.
export default function EditProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (id: string, input: ProfileDetailsInput) => Promise<{ error: string | null }>;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [dob, setDob] = useState(profile.date_of_birth ?? "");
  const [presentAddress, setPresentAddress] = useState(profile.present_address ?? "");
  const [permanentAddress, setPermanentAddress] = useState(profile.permanent_address ?? "");
  const [postalCode, setPostalCode] = useState(profile.postal_code ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [accountTypes, setAccountTypes] = useState<string[]>(profile.account_types ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleType(key: string) {
    setAccountTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    setError(null);

    const handleError = validateHandle(username);
    if (handleError) {
      setError(handleError);
      return;
    }

    setSaving(true);
    const { error: err } = await onSave(profile.id, {
      name,
      username: username.trim() || null,
      email,
      date_of_birth: dob || null,
      present_address: presentAddress || null,
      permanent_address: permanentAddress || null,
      postal_code: postalCode || null,
      avatar_url: avatarUrl || null,
      account_types: accountTypes,
    });
    setSaving(false);
    if (err) {
      setError(isHandleTakenError(err) ? "That handle is already taken." : "Could not save. Try again.");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-text-primary">Edit Profile</h2>
        <div className="mb-5 text-xs text-text-muted">{profile.name || profile.email || profile.id}</div>

        <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Account</h3>
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} />
        </div>
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Handle</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={FIELD_CLASS} />
          <p className="mt-1 text-[11px] text-text-muted">
            {HANDLE_HINT} Identifies this member on Game-a-Fi leaderboards, leagues, and tournaments.
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
          <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={FIELD_CLASS} />
        </div>
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-text-muted">Avatar URL</label>
          <input type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className={FIELD_CLASS} />
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

        {error && <div className="mt-3 text-xs text-[#e05656]">{error}</div>}

        <div className="mt-6 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-semibold text-text-muted"
          >
            Cancel
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
      </div>
    </div>
  );
}
