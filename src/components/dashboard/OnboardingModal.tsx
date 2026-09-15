"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { USE_CASES, YES_NO_QUESTIONS, buildUseCasesArray, type OnboardingAnswers } from "@/lib/dashboard/onboarding";

const PILL_BASE =
  "inline-block rounded-full border px-4 py-1.5 text-xs cursor-pointer mr-2 bg-transparent text-text-primary";
const PILL_ACTIVE = "border-[#4f8cff] bg-[#4f8cff] text-white";
const PILL_INACTIVE = "border-[rgba(148,158,189,0.5)]";

// Turns a profiles.use_cases array back into the checkbox-state shape this
// modal edits internally. Only recognized USE_CASES keys are seeded --
// "investment_income" can also appear because buildUseCasesArray() auto-adds
// it, which round-trips fine since it's a real USE_CASES key too.
function toSelectedMap(useCases: string[] | null | undefined): Record<string, boolean> {
  const selected: Record<string, boolean> = {};
  const validKeys = new Set(USE_CASES.map((u) => u.key));
  (useCases ?? []).forEach((key) => {
    if (validKeys.has(key)) selected[key] = true;
  });
  return selected;
}

// forceOpen/initialUseCases/initialAnswers/onClose let this exact same
// survey be reused as a "Retake Survey" flow from MyProfileModal (self-
// service profile editing) instead of only ever auto-triggering once at
// signup. With no props (the Dashboard's existing usage) this behaves
// exactly as before: it checks onboarding_completed_at itself and decides
// whether to show. When forceOpen is passed, that self-check is skipped
// entirely and the caller owns when this mounts/unmounts (conditional
// render + unmount, matching this app's established remount-instead-of-
// effect-reset pattern) -- so lazy useState initializers below are all
// that's needed to seed a retake with the user's current answers.
export default function OnboardingModal({
  forceOpen,
  initialUseCases,
  initialAnswers,
  onClose,
}: {
  forceOpen?: boolean;
  initialUseCases?: string[] | null;
  initialAnswers?: OnboardingAnswers | null;
  onClose?: () => void;
} = {}) {
  const [visible, setVisible] = useState(() => forceOpen ?? false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => toSelectedMap(initialUseCases));
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => initialAnswers ?? {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (forceOpen !== undefined) return; // controlled/retake mode -- caller decides visibility, not this check

    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .single();
      if (cancelled || error) return;
      if (!data?.onboarding_completed_at) setVisible(true);
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [forceOpen]);

  function toggleUseCase(key: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }

  function setYesNo(key: string, value: boolean) {
    setAnswers((prev) => {
      const current = prev[key];
      const next = { ...prev, [key]: current === value ? null : value };
      if (key === "sell_options_income" && next[key] !== true) {
        next.sell_options_track_in_app = null;
      }
      return next;
    });
  }

  async function save(includeSurvey: boolean) {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setVisible(false);
      onClose?.();
      return;
    }

    const useCases = buildUseCasesArray(selected, answers);
    const payload: Record<string, unknown> = {
      use_cases: useCases.length ? useCases : null,
      onboarding_completed_at: new Date().toISOString(),
    };
    if (includeSurvey) payload.onboarding_survey = answers;

    await supabase.from("profiles").update(payload).eq("id", user.id);
    setSaving(false);
    setVisible(false);
    onClose?.();
  }

  if (!visible) return null;

  const showFollowup = answers.sell_options_income === true;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-5">
      <div className="max-h-[86vh] w-full max-w-[480px] overflow-y-auto rounded-[30px] bg-card-bg p-8 text-text-primary shadow-2xl">
        {step === 1 && (
          <div>
            <h2 className="mb-1.5 text-xl font-bold">Welcome! What brings you here?</h2>
            <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
              Pick whatever applies — this just decides which dashboard features we show you. You
              can pick more than one, and change your mind later.
            </p>

            {USE_CASES.map((opt) => {
              const isSelected = !!selected[opt.key];
              return (
                <div
                  key={opt.key}
                  onClick={() => toggleUseCase(opt.key)}
                  className={`mb-2.5 flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${
                    isSelected ? "border-[#4f8cff] bg-[#4f8cff]/10" : "border-[rgba(148,158,189,0.35)]"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2 text-xs text-white ${
                      isSelected ? "border-[#4f8cff] bg-[#4f8cff]" : "border-[rgba(148,158,189,0.6)]"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="mt-0.5 text-xs text-text-muted">{opt.desc}</div>
                  </div>
                </div>
              );
            })}

            <div className="mt-2 flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className="rounded-xl bg-transparent px-5 py-2.5 text-[13px] font-semibold text-text-muted hover:text-text-primary"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white"
                style={{ backgroundColor: "#4f8cff" }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-1.5 text-xl font-bold">A few fun questions</h2>
            <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
              Totally optional — skip anything you&apos;d rather not answer.
            </p>

            <div className="mb-4">
              <div className="mb-2 text-[13px]">What&apos;s your nationality? 🌎</div>
              <input
                type="text"
                placeholder="e.g. American, Canadian..."
                value={(answers.nationality as string) || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, nationality: e.target.value.trim() || null }))}
                className="w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary"
              />
            </div>

            {YES_NO_QUESTIONS.map((item) => (
              <div key={item.key} className="mb-4">
                <div className="mb-2 text-[13px]">{item.q}</div>
                <button
                  type="button"
                  onClick={() => setYesNo(item.key, true)}
                  className={`${PILL_BASE} ${answers[item.key] === true ? PILL_ACTIVE : PILL_INACTIVE}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setYesNo(item.key, false)}
                  className={`${PILL_BASE} ${answers[item.key] === false ? PILL_ACTIVE : PILL_INACTIVE}`}
                >
                  No
                </button>

                {item.key === "sell_options_income" && showFollowup && (
                  <div className="ml-0.5 mt-2.5 border-l-2 border-[rgba(148,158,189,0.35)] pl-3">
                    <div className="mb-2 text-[13px]">
                      Would you like to track that income through SM Financial? 📊
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          sell_options_track_in_app: prev.sell_options_track_in_app === true ? null : true,
                        }))
                      }
                      className={`${PILL_BASE} ${answers.sell_options_track_in_app === true ? PILL_ACTIVE : PILL_INACTIVE}`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          sell_options_track_in_app: prev.sell_options_track_in_app === false ? null : false,
                        }))
                      }
                      className={`${PILL_BASE} ${answers.sell_options_track_in_app === false ? PILL_ACTIVE : PILL_INACTIVE}`}
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div className="mt-2 flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl bg-transparent px-5 py-2.5 text-[13px] font-semibold text-text-muted hover:text-text-primary"
              >
                Back
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => save(false)}
                  disabled={saving}
                  className="mr-2.5 rounded-xl bg-transparent px-5 py-2.5 text-[13px] font-semibold text-text-muted hover:text-text-primary"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => save(true)}
                  disabled={saving}
                  className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white"
                  style={{ backgroundColor: "#4f8cff" }}
                >
                  {saving ? "Saving…" : "Finish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
