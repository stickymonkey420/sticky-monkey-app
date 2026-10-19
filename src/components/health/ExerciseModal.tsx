"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITIES, exerciseKcal, type Exercise } from "@/lib/health/calc";
import { saveExercise } from "@/lib/health/queries";

const INPUT =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";
const OTHER = "__other";

// Log a workout. Calories = MET x 3.5 x kg / 200 x minutes, or type your
// own (e.g. from a watch). Popup closes only via buttons/Escape.
export default function ExerciseModal({
  userId,
  date,
  weightKg,
  exercise,
  onClose,
  onSaved,
}: {
  userId: string;
  date: string;
  weightKg: number | null;
  exercise?: Exercise | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const known = exercise ? ACTIVITIES.find((a) => a.label === exercise.activity) : ACTIVITIES[1];
  const [activity, setActivity] = useState(known ? known.label : OTHER);
  const [custom, setCustom] = useState(known ? "" : exercise?.activity ?? "");
  const [minutes, setMinutes] = useState(exercise ? String(exercise.minutes) : "30");
  const [doneOn, setDoneOn] = useState(exercise?.done_on ?? date);
  const [kcalOverride, setKcalOverride] = useState(exercise && !exercise.met ? String(exercise.kcal) : "");
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const met = activity === OTHER ? null : ACTIVITIES.find((a) => a.label === activity)?.met ?? null;
  const mins = Number(minutes) || 0;
  const auto = met && weightKg ? exerciseKcal(met, weightKg, mins) : null;
  const kcal = kcalOverride.trim() !== "" ? Math.max(0, Number(kcalOverride) || 0) : auto ?? 0;

  async function save() {
    const name = activity === OTHER ? custom.trim() : activity;
    if (!name) return setError("Enter the activity.");
    if (!(mins > 0)) return setError("Enter minutes.");
    if (!(kcal > 0)) return setError(weightKg ? "Enter calories burned." : "Set your weight in Profile, or enter calories burned.");
    setSaving(true);
    setError(null);
    try {
      await saveExercise(
        createClient(),
        userId,
        { done_on: doneOn, activity: name.slice(0, 120), minutes: mins, met: kcalOverride.trim() !== "" ? null : met, kcal: Math.round(kcal), notes: notes.trim() || null },
        exercise?.id,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-10">
      <div className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">{exercise ? "Edit exercise" : "Log exercise"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={LABEL}>Activity</label>
            <select className={INPUT} value={activity} onChange={(e) => setActivity(e.target.value)}>
              {ACTIVITIES.map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          </div>
          {activity === OTHER && (
            <div className="col-span-2">
              <label className={LABEL}>Activity name</label>
              <input className={INPUT} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={120} placeholder="Kayaking" />
            </div>
          )}
          <div>
            <label className={LABEL}>Minutes</label>
            <input className={INPUT} type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Date</label>
            <input className={INPUT} type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Calories burned {auto !== null ? `(estimate ${auto}; type to override, e.g. from your watch)` : "(enter from your watch or app)"}</label>
            <input className={INPUT} type="number" min={0} value={kcalOverride} onChange={(e) => setKcalOverride(e.target.value)} placeholder={auto !== null ? String(auto) : "0"} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Notes (optional)</label>
            <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm">
          <span className="text-text-muted">Burned: </span>
          <span className="font-semibold text-[#3ddc97]">{Math.round(kcal).toLocaleString()} cal</span>
        </div>
        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={save} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
