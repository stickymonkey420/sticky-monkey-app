"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cmToIn, inToCm, kgToLb, lbToKg, localIso, type Measurement } from "@/lib/health/calc";
import { saveMeasurement, syncProfileBody } from "@/lib/health/queries";

const INPUT =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";

type Field = { key: keyof Measurement; label: string; kind: "mass" | "length" | "pct" | "plain"; step?: string };
const BODY: Field[] = [
  { key: "weight_kg", label: "Weight", kind: "mass" },
  { key: "body_fat_pct", label: "Body fat %", kind: "pct" },
  { key: "muscle_mass_kg", label: "Muscle mass", kind: "mass" },
  { key: "water_pct", label: "Water %", kind: "pct" },
  { key: "visceral_fat", label: "Visceral fat", kind: "plain" },
  { key: "bone_mass_kg", label: "Bone mass", kind: "mass" },
  { key: "bmr_kcal", label: "BMR (cal)", kind: "plain", step: "1" },
];
const TAPE: Field[] = [
  { key: "waist_cm", label: "Waist", kind: "length" },
  { key: "chest_cm", label: "Chest", kind: "length" },
  { key: "hips_cm", label: "Hips", kind: "length" },
  { key: "arm_cm", label: "Arm", kind: "length" },
];

// Log a weigh-in (Eufy set) and/or tape measurements. Values are entered in
// the profile's units and stored metric. Popup closes only via buttons/Escape.
export default function WeighInModal({
  userId,
  units,
  focus,
  entry,
  onClose,
  onSaved,
}: {
  userId: string;
  units: "imperial" | "metric";
  focus: "weigh" | "measure";
  entry?: Measurement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const imperial = units === "imperial";
  const unitOf = (f: Field) => (f.kind === "mass" ? (imperial ? "lb" : "kg") : f.kind === "length" ? (imperial ? "in" : "cm") : "");
  const toDisplay = (f: Field, v: number | null) => {
    if (v == null) return "";
    const x = f.kind === "mass" && imperial ? kgToLb(v) : f.kind === "length" && imperial ? cmToIn(v) : v;
    return String(Math.round(x * 10) / 10);
  };
  const toStore = (f: Field, s: string): number | null => {
    if (s.trim() === "") return null;
    const v = Number(s);
    if (!Number.isFinite(v) || v <= 0) return null;
    const x = f.kind === "mass" && imperial ? lbToKg(v) : f.kind === "length" && imperial ? inToCm(v) : v;
    return f.key === "bmr_kcal" ? Math.round(x) : Math.round(x * 10) / 10;
  };

  const [date, setDate] = useState(entry?.measured_on ?? localIso());
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of [...BODY, ...TAPE]) o[f.key] = toDisplay(f, (entry?.[f.key] as number | null) ?? null);
    return o;
  });
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [syncProfile, setSyncProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const out: Record<string, number | null> = {};
    for (const f of [...BODY, ...TAPE]) out[f.key] = toStore(f, vals[f.key] ?? "");
    if (Object.values(out).every((v) => v == null)) return setError("Enter at least one value.");
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await saveMeasurement(
        supabase,
        userId,
        {
          measured_on: date,
          weight_kg: out.weight_kg,
          body_fat_pct: out.body_fat_pct,
          muscle_mass_kg: out.muscle_mass_kg,
          water_pct: out.water_pct,
          visceral_fat: out.visceral_fat,
          bone_mass_kg: out.bone_mass_kg,
          bmr_kcal: out.bmr_kcal,
          waist_cm: out.waist_cm,
          chest_cm: out.chest_cm,
          hips_cm: out.hips_cm,
          arm_cm: out.arm_cm,
          notes: notes.trim() || null,
        },
        entry?.id,
      );
      if (syncProfile && date === localIso() && (out.weight_kg || out.body_fat_pct)) {
        await syncProfileBody(supabase, userId, out.weight_kg, out.body_fat_pct);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed. Check the values are in range.");
      setSaving(false);
    }
  }

  const fieldInput = (f: Field) => (
    <div key={f.key}>
      <label className={LABEL}>
        {f.label}
        {unitOf(f) ? ` (${unitOf(f)})` : ""}
      </label>
      <input
        className={INPUT}
        type="number"
        inputMode="decimal"
        step={f.step ?? "0.1"}
        min={0}
        value={vals[f.key] ?? ""}
        onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
      />
    </div>
  );

  const sections = focus === "measure" ? [TAPE, BODY] : [BODY, TAPE];
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">
            {entry ? "Edit entry" : focus === "measure" ? "Log measurements" : "Log weigh-in"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        <div className="mb-3 w-44">
          <label className={LABEL}>Date</label>
          <input className={INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {sections.map((sec, i) => (
          <div key={i} className={i ? "mt-4 border-t border-white/[0.08] pt-4" : ""}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {sec === BODY ? "Scale (Eufy)" : "Tape measurements"}
              {i > 0 && <span className="ml-1 font-normal normal-case tracking-normal">(optional)</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{sec.map(fieldInput)}</div>
          </div>
        ))}
        <div className="mt-4">
          <label className={LABEL}>Notes (optional)</label>
          <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>
        {date === localIso() && (
          <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={syncProfile} onChange={(e) => setSyncProfile(e.target.checked)} />
            Update my profile weight / body fat (keeps the calorie target current)
          </label>
        )}
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
