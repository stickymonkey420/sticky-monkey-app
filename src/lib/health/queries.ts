import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise, Fast, FoodItem, HealthProfile, LibraryFood, Meal, Measurement, Reminders } from "./calc";

// Health section data access. RLS limits every table and the private
// health-photos bucket to the signed-in App Director's own rows.

const BUCKET = "health-photos";

export async function fetchHealthProfile(supabase: SupabaseClient, userId: string): Promise<HealthProfile | null> {
  const { data, error } = await supabase.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HealthProfile | null) ?? null;
}

export async function saveHealthProfile(supabase: SupabaseClient, p: HealthProfile): Promise<void> {
  const { error } = await supabase.from("health_profiles").upsert({ ...p, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function fetchMeals(supabase: SupabaseClient, from: string, to: string): Promise<Meal[]> {
  const { data, error } = await supabase
    .from("health_meals")
    .select("*")
    .gte("eaten_on", from)
    .lte("eaten_on", to)
    .order("eaten_on", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    ...m,
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    fiber_g: Number(m.fiber_g ?? 0),
    sugar_g: Number(m.sugar_g ?? 0),
    sodium_mg: Number(m.sodium_mg ?? 0),
  })) as Meal[];
}

export async function fetchExercise(supabase: SupabaseClient, from: string, to: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from("health_exercise")
    .select("*")
    .gte("done_on", from)
    .lte("done_on", to)
    .order("done_on", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({ ...e, kcal: Number(e.kcal), minutes: Number(e.minutes), met: e.met == null ? null : Number(e.met) })) as Exercise[];
}

export type MealInput = {
  eaten_on: string;
  meal_type: Meal["meal_type"];
  title: string;
  items: FoodItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  source: Meal["source"];
  notes: string | null;
};

export async function saveMeal(
  supabase: SupabaseClient,
  userId: string,
  input: MealInput,
  photo: Blob | null,
  id?: string,
): Promise<void> {
  let photo_path: string | undefined;
  if (photo) {
    photo_path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(photo_path, photo, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
  }
  const row = { ...input, ...(photo_path ? { photo_path } : {}) };
  const { error } = id
    ? await supabase.from("health_meals").update(row).eq("id", id)
    : await supabase.from("health_meals").insert({ ...row, user_id: userId });
  if (error) {
    if (photo_path) await supabase.storage.from(BUCKET).remove([photo_path]);
    throw new Error(error.message);
  }
}

export async function deleteMeal(supabase: SupabaseClient, meal: Meal): Promise<void> {
  const { error } = await supabase.from("health_meals").delete().eq("id", meal.id);
  if (error) throw new Error(error.message);
  if (meal.photo_path) await supabase.storage.from(BUCKET).remove([meal.photo_path]);
}

export async function saveExercise(
  supabase: SupabaseClient,
  userId: string,
  input: Omit<Exercise, "id" | "created_at">,
  id?: string,
): Promise<void> {
  const { error } = id
    ? await supabase.from("health_exercise").update(input).eq("id", id)
    : await supabase.from("health_exercise").insert({ ...input, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function deleteExercise(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("health_exercise").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Signed thumbnail URLs (1 hour), one batch call.
export async function photoUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export type Estimate = {
  is_food: boolean;
  title: string;
  items: FoodItem[];
  confidence: "low" | "medium" | "high";
  notes: string;
};

export async function estimateFromPhoto(
  supabase: SupabaseClient,
  imageB64: string,
  stage: "plated" | "prepped",
  note: string,
  servings: number,
): Promise<Estimate> {
  const { data, error } = await supabase.functions.invoke<Estimate & { error?: string; message?: string }>("health-food-estimate", {
    body: { image: imageB64, image_type: "image/jpeg", stage, note, servings },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.json()) as { message?: string; error?: string };
        msg = j.message || j.error || msg;
      }
    } catch {
      /* keep default message */
    }
    throw new Error(msg);
  }
  if (!data) throw new Error("No estimate returned.");
  return data;
}

// Downsizes a photo to <=1024px JPEG (keeps the AI call ~$0.002 and the
// stored file ~150 KB). Returns the blob and its base64 body.
export async function prepPhoto(file: File): Promise<{ blob: Blob; b64: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the photo.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the photo."))), "image/jpeg", 0.82),
  );
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { blob, b64: dataUrl.split(",")[1] ?? "", previewUrl: dataUrl };
}

// ---- Food library + nutrition lookup ------------------------------------

export type LookupResult = FoodItem & { source: "library" | "usda" | "ai" | "unresolved"; reason?: string };

async function invokeError(error: { message: string }): Promise<string> {
  let msg = error.message;
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const j = (await ctx.json()) as { message?: string; error?: string };
      msg = j.message || j.error || msg;
    }
  } catch {
    /* keep default message */
  }
  return msg;
}

// Name + portion ("2", "1 cup", "150 g", "6 oz") -> grams + nutrition from
// the food library; unknown foods are looked up once by AI and saved.
export async function lookupFoods(
  supabase: SupabaseClient,
  items: { name: string; portion: string; grams?: number | null; fdc_id?: number | null }[],
): Promise<LookupResult[]> {
  const { data, error } = await supabase.functions.invoke<{ items: (Partial<FoodItem> & { index: number; source: LookupResult["source"]; reason?: string })[] }>(
    "health-food-lookup",
    { body: { items: items.map((i) => ({ name: i.name, portion: i.portion, grams: i.grams ?? undefined, fdc_id: i.fdc_id ?? undefined })) } },
  );
  if (error) throw new Error(await invokeError(error));
  return (data?.items ?? []).map((r) => ({
    name: items[r.index]?.name ?? r.name ?? "",
    portion: items[r.index]?.portion ?? r.portion ?? "",
    grams: Number(r.grams) || 0,
    kcal: Number(r.kcal) || 0,
    protein_g: Number(r.protein_g) || 0,
    carbs_g: Number(r.carbs_g) || 0,
    fat_g: Number(r.fat_g) || 0,
    fiber_g: Number(r.fiber_g) || 0,
    sugar_g: Number(r.sugar_g) || 0,
    sodium_mg: Number(r.sodium_mg) || 0,
    food_id: r.food_id ?? null,
    food_name: r.food_name ?? null,
    source: r.source,
    reason: r.reason,
  }));
}

export type UsdaHit = {
  fdc_id: number;
  name: string;
  data_type: string;
  category: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

// Type-ahead search of USDA FoodData Central (free).
export async function searchUsdaFoods(supabase: SupabaseClient, q: string): Promise<{ hits: UsdaHit[]; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ usda: UsdaHit[]; error?: string }>("health-food-search", { body: { q } });
  if (error) return { hits: [], error: await invokeError(error) };
  return { hits: data?.usda ?? [], error: data?.error ?? null };
}

export async function fetchFoodLibrary(supabase: SupabaseClient): Promise<LibraryFood[]> {
  const { data, error } = await supabase.from("health_foods").select("*").order("name").limit(5000);
  if (error) throw new Error(error.message);
  const n = (v: unknown) => (v == null ? null : Number(v));
  return (data ?? []).map((f) => ({
    ...f,
    kcal_100g: Number(f.kcal_100g),
    protein_100g: Number(f.protein_100g),
    carbs_100g: Number(f.carbs_100g),
    fat_100g: Number(f.fat_100g),
    fiber_100g: n(f.fiber_100g),
    sugar_100g: n(f.sugar_100g),
    sodium_mg_100g: n(f.sodium_mg_100g),
    units: (f.units ?? {}) as Record<string, number>,
  })) as LibraryFood[];
}

export async function updateLibraryFood(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Omit<LibraryFood, "id" | "name_key" | "aliases" | "updated_at">>,
): Promise<void> {
  const { error } = await supabase
    .from("health_foods")
    .update({ ...patch, source: "manual", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteLibraryFood(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("health_foods").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Copies a meal to another day (photo isn't shared, so deleting one never
// removes the other's picture).
export async function duplicateMeal(supabase: SupabaseClient, userId: string, meal: Meal, eatenOn: string): Promise<void> {
  const { error } = await supabase.from("health_meals").insert({
    user_id: userId,
    eaten_on: eatenOn,
    meal_type: meal.meal_type,
    title: meal.title,
    items: meal.items,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
    fiber_g: meal.fiber_g,
    sugar_g: meal.sugar_g,
    sodium_mg: meal.sodium_mg,
    source: "manual",
    notes: meal.notes,
  });
  if (error) throw new Error(error.message);
}

// Most recent version of each distinct meal (by name) from the last 90 days.
export async function fetchRecentMeals(supabase: SupabaseClient, limit = 15): Promise<Meal[]> {
  const since = new Date(Date.now() - 90 * 86400000);
  const from = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("health_meals")
    .select("*")
    .gte("eaten_on", from)
    .order("eaten_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const seen = new Map<string, { meal: Meal; count: number }>();
  for (const m of data ?? []) {
    const key = String(m.title).trim().toLowerCase();
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else
      seen.set(key, {
        meal: { ...m, kcal: Number(m.kcal), protein_g: Number(m.protein_g), carbs_g: Number(m.carbs_g), fat_g: Number(m.fat_g), fiber_g: Number(m.fiber_g ?? 0), sugar_g: Number(m.sugar_g ?? 0), sodium_mg: Number(m.sodium_mg ?? 0) } as Meal,
        count: 1,
      });
  }
  // Most-eaten first, then most recent.
  return Array.from(seen.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((x) => x.meal);
}

// ---- Weigh-ins / measurements -----------------------------------------

const MEASURE_NUM = ["weight_kg", "body_fat_pct", "muscle_mass_kg", "water_pct", "visceral_fat", "bone_mass_kg", "bmr_kcal", "waist_cm", "chest_cm", "hips_cm", "arm_cm"] as const;

export async function fetchMeasurements(supabase: SupabaseClient, limit = 120): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from("health_measurements")
    .select("*")
    .order("measured_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const m: Record<string, unknown> = { ...r };
    for (const k of MEASURE_NUM) m[k] = r[k] == null ? null : Number(r[k]);
    return m as Measurement;
  });
}

export async function saveMeasurement(
  supabase: SupabaseClient,
  userId: string,
  input: Omit<Measurement, "id" | "created_at">,
  id?: string,
): Promise<void> {
  const { error } = id
    ? await supabase.from("health_measurements").update(input).eq("id", id)
    : await supabase.from("health_measurements").insert({ ...input, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function deleteMeasurement(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("health_measurements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Keeps the calorie math current: newest weight / body fat go to the profile.
export async function syncProfileBody(supabase: SupabaseClient, userId: string, weightKg: number | null, bodyFat: number | null): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (weightKg) patch.weight_kg = weightKg;
  if (bodyFat) patch.body_fat_pct = bodyFat;
  const { error } = await supabase.from("health_profiles").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function saveReminders(supabase: SupabaseClient, userId: string, reminders: Reminders): Promise<void> {
  const { error } = await supabase.from("health_profiles").upsert({ user_id: userId, reminders, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

// ---- Fasting -----------------------------------------------------------

export async function fetchFasts(supabase: SupabaseClient, limit = 100): Promise<Fast[]> {
  const { data, error } = await supabase.from("health_fasts").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({ ...f, goal_hours: Number(f.goal_hours) })) as Fast[];
}

export async function startFast(supabase: SupabaseClient, userId: string, startedAt: string, goalHours: number): Promise<void> {
  const { error } = await supabase.from("health_fasts").insert({ user_id: userId, started_at: startedAt, goal_hours: goalHours });
  if (error) throw new Error(error.code === "23505" ? "A fast is already running." : error.message);
}

export async function updateFast(supabase: SupabaseClient, id: string, patch: Partial<Pick<Fast, "started_at" | "ended_at" | "goal_hours" | "notes">>): Promise<void> {
  const { error } = await supabase.from("health_fasts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFast(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("health_fasts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
