"use client";

import { useState } from "react";
import { TRI_STATE_FIELD_DEFS, USE_CASE_DEFS, type Profile, type TriState } from "@/lib/usersGroups/types";
import type { SurveyInput } from "@/lib/usersGroups/queries";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function triFromValue(v: unknown): TriState {
  return v === true ? true : v === false ? false : null;
}

// Ported from the live script's openSurveyModal(): lets an admin view and
// adjust what a user answered in the onboarding survey (use cases picked,
// plus demographic tri-state questions), since those answers drive which
// dashboard modules that user sees. Writes back to profiles.use_cases /
// profiles.onboarding_survey, the same columns the onboarding modal itself
// writes to.
export default function SurveyModal({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (id: string, input: SurveyInput) => Promise<{ error: string | null }>;
}) {
  const survey = (profile.onboarding_survey ?? {}) as Record<string, unknown>;
  const [useCases, setUseCases] = useState<string[]>(profile.use_cases ?? []);
  const [nationality, setNationality] = useState((survey.nationality as string) ?? "");
  const [triStates, setTriStates] = useState<Record<string, TriState>>(() => {
    const init: Record<string, TriState> = {};
    for (const f of TRI_STATE_FIELD_DEFS) init[f.key] = triFromValue(survey[f.key]);
    return init;
  });
  const [retake, setRetake] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUseCase(key: string) {
    setUseCases((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const completedText = profile.onboarding_completed_at
    ? `Survey completed ${fmtDate(profile.onboarding_completed_at)}`
    : "Hasn't completed the onboarding survey yet.";

  async function handleSave() {
    setSaving(true);
    setError(null);
    const newSurvey: Record<string, unknown> = { ...triStates, nationality: nationality.trim() || null };
    const { error: err } = await onSave(profile.id, {
      use_cases: useCases.length ? useCases : null,
      onboarding_survey: newSurvey,
      retake,
    });
    setSaving(false);
    if (err) {
      setError("Could not save. Try again.");
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
        <h2 className="mb-1 text-lg font-bold text-text-primary">Survey &amp; Profile</h2>
        <div className="mb-5 text-xs text-text-muted">
          {profile.name || profile.email || profile.id} · {completedText}
        </div>

        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-text-muted">What they use the app for</h3>
        <div className="mb-2 flex flex-col gap-1">
          {USE_CASE_DEFS.map((uc) => (
            <label key={uc.key} className="flex items-center gap-2.5 py-1.5 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={useCases.includes(uc.key)}
                onChange={() => toggleUseCase(uc.key)}
                className="h-4 w-4 cursor-pointer"
              />
              {uc.label}
            </label>
          ))}
        </div>

        <h3 className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">Demographics</h3>
        <div className="mb-2 flex items-center gap-2.5 py-1.5 text-sm">
          <label className="flex-1 text-text-primary">Nationality</label>
          <input
            type="text"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="e.g. American"
            className="w-[150px] rounded-md border border-card-border bg-[#0d0f17] px-2 py-1.5 text-sm text-text-primary outline-none"
          />
        </div>
        {TRI_STATE_FIELD_DEFS.map((f) => (
          <div key={f.key} className="flex items-center gap-2.5 py-1.5 text-sm">
            <label className="flex-1 text-text-primary">{f.label}</label>
            <select
              value={triStates[f.key] === true ? "true" : triStates[f.key] === false ? "false" : ""}
              onChange={(e) =>
                setTriStates((prev) => ({
                  ...prev,
                  [f.key]: e.target.value === "true" ? true : e.target.value === "false" ? false : null,
                }))
              }
              className="w-[150px] rounded-md border border-card-border bg-[#0d0f17] px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">— Not answered —</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        ))}

        <div className="mt-3.5 flex items-center gap-2.5 border-t border-white/10 pt-3.5">
          <input
            id="ug-svy-retake"
            type="checkbox"
            checked={retake}
            onChange={(e) => setRetake(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <label htmlFor="ug-svy-retake" className="cursor-pointer text-sm text-text-primary">
            Have them retake the survey on next login
          </label>
        </div>

        {error && <div className="mt-3 text-xs text-[#e05656]">{error}</div>}

        <div className="mt-6 flex items-center justify-between gap-2.5">
          <button type="button" onClick={onClose} className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-semibold text-text-muted">
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
