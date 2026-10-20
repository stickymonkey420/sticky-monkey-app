// Health section math (App Director only). All storage is metric; the UI
// converts for imperial display.

export type HealthProfile = {
  user_id: string;
  sex: "male" | "female" | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct?: number | null;
  goal: "lose" | "lose2" | "lose3" | "maintain" | "gain";
  units: "imperial" | "metric";
  reminders?: Reminders | null;
};

// ---- Weigh-ins / measurements + in-app reminders ----------------------

export type Measurement = {
  id: string;
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  water_pct: number | null;
  visceral_fat: number | null;
  bone_mass_kg: number | null;
  bmr_kcal: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  notes: string | null;
  created_at: string;
};

export type ReminderFreq = "daily" | "weekly" | "biweekly" | "monthly";
export type Reminder = { on: boolean; freq: ReminderFreq; day: number; time: string };
export type Reminders = { weigh?: Reminder; measure?: Reminder };
export const DEFAULT_REMINDERS: Required<Reminders> = {
  weigh: { on: false, freq: "weekly", day: 1, time: "07:00" },
  measure: { on: false, freq: "monthly", day: 1, time: "08:00" },
};
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isoToDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// The most recent moment this reminder fired (local time), or null if it
// hasn't fired yet today/this period.
export function lastOccurrence(r: Reminder, now = new Date()): Date | null {
  const [hh, mm] = (r.time || "07:00").split(":").map(Number);
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0);
  const today = at(now);
  if (r.freq === "daily") return now >= today ? today : at(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (r.freq === "monthly") {
    const dom = Math.min(Math.max(r.day || 1, 1), 28);
    const thisMonth = at(new Date(now.getFullYear(), now.getMonth(), dom));
    return now >= thisMonth ? thisMonth : at(new Date(now.getFullYear(), now.getMonth() - 1, dom));
  }
  const wd = Math.min(Math.max(r.day ?? 1, 0), 6);
  let back = (now.getDay() - wd + 7) % 7;
  let occ = at(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  if (occ > now) {
    back += 7;
    occ = at(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  }
  return occ;
}

// Due when the latest entry is older than the last time the reminder fired
// (every-2-weeks also needs 13+ days since the last entry).
export function reminderDue(r: Reminder | undefined, lastEntry: string | null, now = new Date()): boolean {
  if (!r?.on) return false;
  const occ = lastOccurrence(r, now);
  if (!occ) return false;
  if (!lastEntry) return true;
  const last = isoToDate(lastEntry);
  const occDay = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate());
  if (last >= occDay) return false;
  if (r.freq === "biweekly") return (now.getTime() - last.getTime()) / 86400000 >= 13;
  return true;
}

export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inch: number) => inch * 2.54;

export type FoodItem = {
  name: string;
  portion: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  food_id?: string | null; // health_foods row the numbers came from
  food_name?: string | null;
};

// Personal food library row (nutrition per 100 g, grams per household unit).
export type LibraryFood = {
  id: string;
  name: string;
  name_key: string;
  aliases: string[];
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
  sugar_100g: number | null;
  sodium_mg_100g: number | null;
  units: Record<string, number>;
  source: "ai" | "manual" | "usda";
  fdc_id: number | null;
  updated_at: string;
};

export type Meal = {
  id: string;
  eaten_on: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack" | "meal";
  title: string;
  items: FoodItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  photo_path: string | null;
  source: "photo" | "manual";
  notes: string | null;
  created_at: string;
};

export type Exercise = {
  id: string;
  done_on: string;
  activity: string;
  minutes: number;
  met: number | null;
  kcal: number;
  notes: string | null;
  created_at: string;
};

export const MEAL_TYPES: Meal["meal_type"][] = ["breakfast", "lunch", "dinner", "snack"];

// 1 lb of body fat is roughly 3,500 cal, so 500/day = ~1 lb/week.
export const GOAL_ADJUST: Record<HealthProfile["goal"], number> = { lose: -500, lose2: -1000, lose3: -1500, maintain: 0, gain: 300 };
export const GOAL_LABEL: Record<HealthProfile["goal"], string> = {
  lose: "Lose (~1 lb/week)",
  lose2: "Lose (~2 lb/week)",
  lose3: "Lose (~3 lb/week)",
  maintain: "Maintain",
  gain: "Gain (lean)",
};

// MET values from the Compendium of Physical Activities (2011/2024 update).
// kcal = MET x 3.5 x kg / 200 x minutes.
export const ACTIVITIES: { label: string; met: number }[] = [
  { label: "Walking, moderate (3 mph)", met: 3.5 },
  { label: "Walking, brisk (4 mph)", met: 5.0 },
  { label: "Hiking", met: 6.0 },
  { label: "Running, 5 mph (12 min/mi)", met: 8.3 },
  { label: "Running, 6 mph (10 min/mi)", met: 9.8 },
  { label: "Running, 7.5 mph (8 min/mi)", met: 11.8 },
  { label: "Cycling, leisure (<10 mph)", met: 4.0 },
  { label: "Cycling, moderate (12-14 mph)", met: 8.0 },
  { label: "Stationary bike, moderate", met: 6.8 },
  { label: "Weight training, general", met: 3.5 },
  { label: "Weight training, vigorous", met: 6.0 },
  { label: "HIIT / circuit training", met: 8.0 },
  { label: "Swimming laps, moderate", met: 5.8 },
  { label: "Elliptical, moderate", met: 5.0 },
  { label: "Rowing machine, moderate", met: 7.0 },
  { label: "Yoga", met: 2.5 },
  { label: "Basketball, game", met: 8.0 },
  { label: "Pickleball / tennis doubles", met: 4.5 },
  { label: "Golf, walking", met: 4.8 },
  { label: "Yard work / gardening", met: 4.0 },
  { label: "Dancing", met: 5.0 },
];

export function exerciseKcal(met: number, weightKg: number, minutes: number): number {
  if (!(met > 0) || !(weightKg > 0) || !(minutes > 0)) return 0;
  return Math.round(((met * 3.5 * weightKg) / 200) * minutes);
}

export function ageFrom(birthYear: number | null): number | null {
  if (!birthYear) return null;
  return new Date().getFullYear() - birthYear;
}

// Lean body mass (kg) when body fat % is known.
export function leanMassKg(p: HealthProfile | null): number | null {
  const bf = Number(p?.body_fat_pct);
  if (!p?.weight_kg || !(bf > 0 && bf < 100)) return null;
  return Number(p.weight_kg) * (1 - bf / 100);
}

// Resting burn (BMR): Katch-McArdle (370 + 21.6 x lean kg) when body fat %
// is set, otherwise Mifflin-St Jeor.
export function bmrMethod(p: HealthProfile | null): "katch" | "mifflin" {
  return leanMassKg(p) !== null ? "katch" : "mifflin";
}

export function bmr(p: HealthProfile | null): number | null {
  const lean = leanMassKg(p);
  if (lean !== null) return Math.round(370 + 21.6 * lean);
  if (!p || !p.sex || !p.height_cm || !p.weight_kg) return null;
  const age = ageFrom(p.birth_year);
  if (age === null) return null;
  const base = 10 * Number(p.weight_kg) + 6.25 * Number(p.height_cm) - 5 * age;
  return Math.round(p.sex === "male" ? base + 5 : base - 161);
}

// Daily baseline burn without workouts: BMR x 1.2 (sedentary). Logged
// exercise is added on top, so workouts are never double counted.
export function baselineBurn(p: HealthProfile | null): number | null {
  const b = bmr(p);
  return b === null ? null : Math.round(b * 1.2);
}

export const LB_PER_KG = 2.2046226;
export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToFtIn = (cm: number) => {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;

export function sumItems(items: FoodItem[]) {
  const t = items.reduce(
    (a, i) => ({
      kcal: a.kcal + (Number(i.kcal) || 0),
      protein_g: a.protein_g + (Number(i.protein_g) || 0),
      carbs_g: a.carbs_g + (Number(i.carbs_g) || 0),
      fat_g: a.fat_g + (Number(i.fat_g) || 0),
      fiber_g: a.fiber_g + (Number(i.fiber_g) || 0),
      sugar_g: a.sugar_g + (Number(i.sugar_g) || 0),
      sodium_mg: a.sodium_mg + (Number(i.sodium_mg) || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 },
  );
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    kcal: Math.round(t.kcal),
    protein_g: r(t.protein_g),
    carbs_g: r(t.carbs_g),
    fat_g: r(t.fat_g),
    fiber_g: r(t.fiber_g),
    sugar_g: r(t.sugar_g),
    sodium_mg: Math.round(t.sodium_mg),
  };
}

export function localIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localIso(new Date(y, m - 1, d + days));
}

export const fmtKcal = (n: number) => Math.round(n).toLocaleString();

// ---- Fasting -----------------------------------------------------------

export type Fast = {
  id: string;
  started_at: string;
  ended_at: string | null;
  goal_hours: number;
  notes: string | null;
};

export const FAST_PRESETS = [16, 18, 20, 24, 36, 48, 72, 96, 120, 168];
export const FAST_MILESTONES = [12, 16, 18, 24, 36, 48, 72, 96, 120, 168];

export function fastMs(f: Fast, now = Date.now()): number {
  const end = f.ended_at ? new Date(f.ended_at).getTime() : now;
  return Math.max(0, end - new Date(f.started_at).getTime());
}

// 1d 12:04:09 / 12:04:09
export function fmtDuration(ms: number, seconds = true): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = seconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

export const fmtHours = (ms: number) => `${Math.round((ms / 3600000) * 10) / 10}h`;

export type FastStats = { count: number; longestMs: number; avgMs: number; monthHours: number; goalsMet: number };
export function fastStats(fasts: Fast[], now = Date.now()): FastStats {
  const done = fasts.filter((f) => f.ended_at);
  const ms = done.map((f) => fastMs(f, now));
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const monthHours = fasts.reduce((sum, f) => {
    const start = Math.max(new Date(f.started_at).getTime(), monthStart);
    const end = f.ended_at ? new Date(f.ended_at).getTime() : now;
    return sum + Math.max(0, end - start) / 3600000;
  }, 0);
  return {
    count: done.length,
    longestMs: ms.length ? Math.max(...ms) : 0,
    avgMs: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0,
    monthHours: Math.round(monthHours),
    goalsMet: done.filter((f) => fastMs(f, now) >= Number(f.goal_hours) * 3600000).length,
  };
}
