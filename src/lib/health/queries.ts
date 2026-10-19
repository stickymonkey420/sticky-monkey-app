import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise, FoodItem, HealthProfile, Meal } from "./calc";

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
