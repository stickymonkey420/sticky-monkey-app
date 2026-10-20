"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  GOAL_ADJUST,
  GOAL_LABEL,
  baselineBurn,
  bmr,
  bmrMethod,
  cmToFtIn,
  ftInToCm,
  kgToLb,
  lbToKg,
  leanMassKg,
  type HealthProfile,
} from "@/lib/health/calc";
import { saveHealthProfile } from "@/lib/health/queries";

const INPUT =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";

// Body stats for resting burn (Mifflin-St Jeor). Stored metric; entered in
// the units you pick. Popup closes only via buttons/Escape.
export default function HealthProfileModal({
  userId,
  profile,
  onClose,
  onSaved,
}: {
  userId: string;
  profile: HealthProfile | null;
  onClose: () => void;
  onSaved: (p: HealthProfile) => void;
}) {
  const [units, setUnits] = useState<HealthProfile["units"]>(profile?.units ?? "imperial");
  const [sex, setSex] = useState<HealthProfile["sex"]>(profile?.sex ?? "male");
  const [birthYear, setBirthYear] = useState(profile?.birth_year ? String(profile.birth_year) : "");
  const fi = profile?.height_cm ? cmToFtIn(Number(profile.height_cm)) : null;
  const [ft, setFt] = useState(fi ? String(fi.ft) : "");
  const [inch, setInch] = useState(fi ? String(fi.inch) : "");
  const [cm, setCm] = useState(profile?.height_cm ? String(profile.height_cm) : "");
  const [weight, setWeight] = useState(
    profile?.weight_kg ? String(Math.round((profile.units === "metric" ? Number(profile.weight_kg) : kgToLb(Number(profile.weight_kg))) * 10) / 10) : "",
  );
  const [bodyFat, setBodyFat] = useState(profile?.body_fat_pct ? String(Number(profile.body_fat_pct)) : "");
  const [goal, setGoal] = useState<HealthProfile["goal"]>(profile?.goal ?? "maintain");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function switchUnits(u: HealthProfile["units"]) {
    if (u === units) return;
    const w = Number(weight);
    if (w > 0) setWeight(String(Math.round((u === "metric" ? lbToKg(w) : kgToLb(w)) * 10) / 10));
    if (u === "metric" && (Number(ft) || Number(inch))) setCm(String(Math.round(ftInToCm(Number(ft) || 0, Number(inch) || 0))));
    if (u === "imperial" && Number(cm) > 0) {
      const x = cmToFtIn(Number(cm));
      setFt(String(x.ft));
      setInch(String(x.inch));
    }
    setUnits(u);
  }

  const heightCm = units === "metric" ? Number(cm) || 0 : ftInToCm(Number(ft) || 0, Number(inch) || 0);
  const weightKg = units === "metric" ? Number(weight) || 0 : lbToKg(Number(weight) || 0);
  const draft: HealthProfile = {
    user_id: userId,
    sex,
    birth_year: Number(birthYear) || null,
    height_cm: heightCm > 0 ? Math.round(heightCm * 10) / 10 : null,
    weight_kg: weightKg > 0 ? Math.round(weightKg * 10) / 10 : null,
    body_fat_pct: Number(bodyFat) > 0 ? Math.round(Number(bodyFat) * 10) / 10 : null,
    goal,
    units,
  };
  const b = bmr(draft);
  const base = baselineBurn(draft);
  const lean = leanMassKg(draft);

  async function save() {
    const yr = Number(birthYear);
    const thisYear = new Date().getFullYear();
    if (!(yr >= thisYear - 110 && yr <= thisYear - 13)) return setError("Enter a valid birth year.");
    if (!(heightCm >= 100 && heightCm <= 250)) return setError("Enter your height.");
    if (!(weightKg >= 30 && weightKg <= 350)) return setError("Enter your weight.");
    if (bodyFat.trim() !== "" && !(Number(bodyFat) >= 2 && Number(bodyFat) <= 70)) return setError("Body fat must be between 2% and 70%, or leave it blank.");
    setSaving(true);
    setError(null);
    try {
      await saveHealthProfile(createClient(), draft);
      onSaved(draft);
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
          <div>
            <h3 className="text-base font-semibold text-text-primary">Health profile</h3>
            <p className="mt-0.5 text-xs text-text-muted">Used to estimate your resting burn and workout calories.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg bg-black/30 p-1 text-xs">
          {(["imperial", "metric"] as const).map((u) => (
            <button key={u} type="button" onClick={() => switchUnits(u)} className={`flex-1 rounded-md px-2 py-1.5 ${units === u ? "bg-white/15 font-semibold text-text-primary" : "text-text-muted"}`}>
              {u === "imperial" ? "lb / ft-in" : "kg / cm"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Sex (for the formula)</label>
            <select className={INPUT} value={sex ?? "male"} onChange={(e) => setSex(e.target.value as HealthProfile["sex"])}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Birth year</label>
            <input className={INPUT} type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1980" />
          </div>
          {units === "imperial" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL}>Height ft</label>
                <input className={INPUT} type="number" value={ft} onChange={(e) => setFt(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>in</label>
                <input className={INPUT} type="number" value={inch} onChange={(e) => setInch(e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <label className={LABEL}>Height cm</label>
              <input className={INPUT} type="number" value={cm} onChange={(e) => setCm(e.target.value)} />
            </div>
          )}
          <div>
            <label className={LABEL}>Weight {units === "imperial" ? "lb" : "kg"}</label>
            <input className={INPUT} type="number" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Body fat % (optional)</label>
            <input className={INPUT} type="number" step="0.1" min={2} max={70} value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="e.g. 22" />
          </div>
          <div>
            <label className={LABEL}>Lean mass</label>
            <div className="py-2 text-[13px] text-text-primary">
              {lean === null ? "—" : units === "metric" ? `${Math.round(lean * 10) / 10} kg` : `${Math.round(kgToLb(lean) * 10) / 10} lb`}
            </div>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Goal</label>
            <select className={INPUT} value={goal} onChange={(e) => setGoal(e.target.value as HealthProfile["goal"])}>
              {(Object.keys(GOAL_LABEL) as HealthProfile["goal"][]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3 text-sm">
          <div>
            <div className="text-[11px] text-text-muted">Resting burn (BMR, {bmrMethod(draft) === "katch" ? "from lean mass" : "from height/weight/age"})</div>
            <div className="font-semibold text-text-primary">{b ? `${b.toLocaleString()} cal` : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-text-muted">Daily baseline (no workouts)</div>
            <div className="font-semibold text-text-primary">{base ? `${base.toLocaleString()} cal` : "—"}</div>
          </div>
          <div className="col-span-2 border-t border-white/[0.08] pt-2">
            <div className="text-[11px] text-text-muted">Daily eating target (before workouts)</div>
            <div className="font-semibold text-[#f5d020]">{base ? `${Math.max(0, base + GOAL_ADJUST[goal]).toLocaleString()} cal` : "—"}</div>
            {base !== null && base + GOAL_ADJUST[goal] < 1200 && (
              <div className="mt-0.5 text-[11px] text-text-muted">Under 1,200 cal/day. Logged workouts raise the day&apos;s target.</div>
            )}
          </div>
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
