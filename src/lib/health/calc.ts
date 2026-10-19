// Health section math (App Director only). All storage is metric; the UI
// converts for imperial display.

export type HealthProfile = {
  user_id: string;
  sex: "male" | "female" | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: "lose" | "maintain" | "gain";
  units: "imperial" | "metric";
};

export type FoodItem = {
  name: string;
  portion: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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

export const GOAL_ADJUST: Record<HealthProfile["goal"], number> = { lose: -500, maintain: 0, gain: 300 };
export const GOAL_LABEL: Record<HealthProfile["goal"], string> = {
  lose: "Lose (~1 lb/week)",
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

// Mifflin-St Jeor resting burn (BMR).
export function bmr(p: HealthProfile | null): number | null {
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
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  return {
    kcal: Math.round(t.kcal),
    protein_g: Math.round(t.protein_g * 10) / 10,
    carbs_g: Math.round(t.carbs_g * 10) / 10,
    fat_g: Math.round(t.fat_g * 10) / 10,
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
