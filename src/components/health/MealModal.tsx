"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Plus, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_TYPES, sumItems, type FoodItem, type Meal } from "@/lib/health/calc";
import { estimateFromPhoto, lookupFoods, prepPhoto, saveMeal, type Estimate } from "@/lib/health/queries";

const INPUT =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";
const CELL = "w-full rounded-md border border-[rgba(148,158,189,0.35)] bg-[#0d0f17] px-2 py-1.5 text-[13px] text-text-primary";

// A row in the editor: the food item plus which name|portion its numbers
// were looked up for (sig) and its lookup state.
type Row = FoodItem & { sig?: string; st?: "loading" | "error" | "new" };

const blankRow = (): Row => ({ name: "", portion: "", grams: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
const sigOf = (r: { name: string; portion: string }) => `${r.name.trim().toLowerCase()}|${r.portion.trim().toLowerCase()}`;
function stripRow(r: Row): FoodItem {
  const item: Row = { ...r };
  delete item.sig;
  delete item.st;
  return item;
}

function defaultMealType(): Meal["meal_type"] {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

// Add/edit a meal. You only type food names and portions ("2", "1 cup",
// "150 g", "6 oz"); nutrition comes from your food library, and foods not
// in it yet are looked up once (AI) and saved there. mode "photo" fills
// the rows from a picture first. Popup closes only via buttons/Escape.
export default function MealModal({
  userId,
  date,
  mode,
  meal,
  onClose,
  onSaved,
}: {
  userId: string;
  date: string;
  mode: "photo" | "manual";
  meal?: Meal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [eatenOn, setEatenOn] = useState(meal?.eaten_on ?? date);
  const [mealType, setMealType] = useState<Meal["meal_type"]>(meal?.meal_type ?? defaultMealType());
  const [title, setTitle] = useState(meal?.title ?? "");
  const [rows, setRows] = useState<Row[]>(
    meal?.items?.length ? meal.items.map((i) => ({ ...i, sig: i.kcal > 0 ? sigOf(i) : undefined })) : mode === "manual" ? [blankRow()] : [],
  );
  const [notes, setNotes] = useState(meal?.notes ?? "");
  const [stage, setStage] = useState<"plated" | "prepped">("plated");
  const [hint, setHint] = useState("");
  const [servings, setServings] = useState("1");
  const [photo, setPhoto] = useState<{ blob: Blob; b64: string; previewUrl: string } | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState<"" | "photo" | "estimate" | "save">("");
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nServ = Math.max(1, Math.min(50, Math.round(Number(servings) || 1)));
  const totals = sumItems(rows);
  const share = {
    kcal: Math.round(totals.kcal / nServ),
    protein_g: Math.round((totals.protein_g / nServ) * 10) / 10,
    carbs_g: Math.round((totals.carbs_g / nServ) * 10) / 10,
    fat_g: Math.round((totals.fat_g / nServ) * 10) / 10,
    fiber_g: Math.round((totals.fiber_g / nServ) * 10) / 10,
  };
  const looking = rows.some((r) => r.st === "loading");

  // Looks up the given rows (by current name/portion) and fills in grams +
  // nutrition. useGrams keeps the photo's gram estimate instead of
  // re-deriving it from the portion text.
  async function lookup(target: Row[], useGrams = false): Promise<Row[]> {
    const want = target.map((r, i) => ({ r, i })).filter(({ r }) => r.name.trim() && (useGrams || r.sig !== sigOf(r)));
    if (!want.length) return target;
    const loadingSigs = new Set(want.map(({ r }) => sigOf(r)));
    setRows((cur) => cur.map((r) => (loadingSigs.has(sigOf(r)) && r.name.trim() ? { ...r, st: "loading" } : r)));
    try {
      const res = await lookupFoods(
        createClient(),
        want.map(({ r }) => ({ name: r.name.trim(), portion: r.portion.trim(), grams: useGrams && r.grams > 0 ? r.grams : null })),
      );
      const bySig = new Map<string, Row>();
      want.forEach(({ r }, k) => {
        const x = res[k];
        if (!x || x.source === "unresolved") bySig.set(sigOf(r), { ...r, st: "error" });
        else bySig.set(sigOf(r), { ...x, name: r.name, portion: r.portion, sig: sigOf(r), st: x.source === "ai" ? "new" : undefined });
      });
      const next = target.map((r) => bySig.get(sigOf(r)) ?? r);
      setRows((cur) => cur.map((r) => bySig.get(sigOf(r)) ?? r));
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nutrition lookup failed.");
      setRows((cur) => cur.map((r) => (loadingSigs.has(sigOf(r)) ? { ...r, st: "error" } : r)));
      return target;
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("photo");
    try {
      const p = await prepPhoto(file);
      setPhoto(p);
      setEstimate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the photo.");
    } finally {
      setBusy("");
    }
  }

  async function runEstimate() {
    if (!photo) return;
    setError(null);
    setBusy("estimate");
    try {
      const r = await estimateFromPhoto(createClient(), photo.b64, stage, hint, nServ);
      if (!r.is_food) {
        setError("That photo doesn't look like food. Try another angle or add the food manually.");
        setBusy("");
        return;
      }
      setEstimate(r);
      if (!title.trim()) setTitle(r.title);
      // Photo gives names + grams; nutrition comes from the library (photo
      // numbers stay as a fallback if the lookup fails).
      const photoRows: Row[] = r.items.length ? r.items.map((i) => ({ ...i })) : [blankRow()];
      setRows(photoRows);
      setBusy("");
      await lookup(photoRows, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI estimate failed.");
      setBusy("");
    }
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function onRowBlur(i: number) {
    const r = rows[i];
    if (r && r.name.trim() && r.sig !== sigOf(r)) void lookup(rows);
  }

  async function save() {
    let current = rows;
    if (current.some((r) => r.name.trim() && r.sig !== sigOf(r))) current = await lookup(current);
    const clean = current.filter((i) => i.name.trim());
    if (!clean.length) return setError("Add at least one food item.");
    if (clean.some((r) => r.st === "error" || r.sig !== sigOf(r))) return setError("Some foods couldn't be looked up. Check the name or portion, or remove them.");
    if (!title.trim()) return setError("Give the meal a name.");
    const d = (v: number | undefined, dp = 1) => Math.round(((Number(v) || 0) / nServ) * 10 ** dp) / 10 ** dp;
    const items = clean.map(stripRow);
    const scaled =
      nServ === 1
        ? items
        : items.map((i) => ({
            ...i,
            portion: `${i.portion} ÷ ${nServ}`.trim(),
            grams: d(i.grams, 0),
            kcal: d(i.kcal, 0),
            protein_g: d(i.protein_g),
            carbs_g: d(i.carbs_g),
            fat_g: d(i.fat_g),
            fiber_g: d(i.fiber_g),
            sugar_g: d(i.sugar_g),
            sodium_mg: d(i.sodium_mg, 0),
          }));
    setBusy("save");
    setError(null);
    try {
      await saveMeal(
        createClient(),
        userId,
        {
          eaten_on: eatenOn,
          meal_type: mealType,
          title: title.trim().slice(0, 200),
          items: scaled,
          ...sumItems(scaled),
          source: photo || meal?.source === "photo" ? "photo" : "manual",
          notes: notes.trim() || null,
        },
        photo?.blob ?? null,
        meal?.id,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setBusy("");
    }
  }

  const showTable = mode === "manual" || !!meal || !!estimate;
  const num = (v: number | undefined, unit = "") => (v ? `${Math.round(v * 10) / 10}${unit}` : "—");

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">
            {meal ? "Edit meal" : mode === "photo" ? "Snap a meal" : "Add food"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {mode === "photo" && !meal && (
          <div className="mb-4 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30 sm:w-52">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.previewUrl} alt="Meal" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-3 text-center text-xs text-text-muted">{busy === "photo" ? "Reading photo…" : "No photo yet"}</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md bg-[#f5d020] px-3 py-2 text-sm font-semibold text-[#0f131c]">
                    <Camera size={16} /> Take photo
                  </button>
                  <button type="button" onClick={() => libraryRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5">
                    <ImagePlus size={16} /> Choose photo
                  </button>
                </div>
                <div className="flex gap-1 rounded-lg bg-black/30 p-1 text-xs">
                  {(["plated", "prepped"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStage(s)}
                      className={`flex-1 rounded-md px-2 py-1.5 ${stage === s ? "bg-white/15 font-semibold text-text-primary" : "text-text-muted"}`}
                    >
                      {s === "plated" ? "Plated / ready to eat" : "Prepped before cooking"}
                    </button>
                  ))}
                </div>
                <input
                  className={INPUT}
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  maxLength={500}
                  placeholder={stage === "prepped" ? "Optional: 1.5 lb raw chicken thighs, 2 tbsp olive oil…" : "Optional: weights, sauces, what's hidden…"}
                />
                <div className="flex items-end gap-2">
                  <div className="w-28">
                    <label className={LABEL}>Servings in photo</label>
                    <input className={INPUT} type="number" min={1} max={50} value={servings} onChange={(e) => setServings(e.target.value)} />
                  </div>
                  <button
                    type="button"
                    disabled={!photo || busy !== ""}
                    onClick={runEstimate}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#4f8cff] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Sparkles size={16} /> {busy === "estimate" ? "Identifying…" : estimate ? "Re-scan photo" : "Identify foods"}
                  </button>
                </div>
              </div>
            </div>
            {estimate && (
              <p className="mt-2 text-xs text-text-muted">
                AI confidence: <span className="font-semibold text-text-primary">{estimate.confidence}</span>
                {estimate.notes ? ` · ${estimate.notes}` : ""} Fix any food name or portion below and the numbers update.
              </p>
            )}
          </div>
        )}

        {showTable && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <label className={LABEL}>Meal name</label>
                <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Chicken, rice and broccoli" />
              </div>
              <div>
                <label className={LABEL}>Meal</label>
                <select className={INPUT} value={mealType} onChange={(e) => setMealType(e.target.value as Meal["meal_type"])}>
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Date</label>
                <input className={INPUT} type="date" value={eatenOn} onChange={(e) => setEatenOn(e.target.value)} />
              </div>
            </div>

            <p className="mb-2 text-xs text-text-muted">
              Type the food and portion: <span className="text-text-primary">2</span>, <span className="text-text-primary">1 cup</span>,{" "}
              <span className="text-text-primary">150 g</span>, <span className="text-text-primary">6 oz</span>,{" "}
              <span className="text-text-primary">1/2 lb</span>. Nutrition fills in from your food library.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="text-[11px] text-text-muted">
                  <tr>
                    <th className="pb-1.5 pr-2 font-medium">Food</th>
                    <th className="w-24 pb-1.5 pr-2 font-medium">Portion</th>
                    <th className="w-14 pb-1.5 pr-2 text-right font-medium">Grams</th>
                    <th className="w-16 pb-1.5 pr-2 text-right font-medium">Calories</th>
                    <th className="w-14 pb-1.5 pr-2 text-right font-medium">Protein</th>
                    <th className="w-14 pb-1.5 pr-2 text-right font-medium">Carbs</th>
                    <th className="w-14 pb-1.5 pr-2 text-right font-medium">Fat</th>
                    <th className="w-8 pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const stale = r.name.trim() && r.sig !== sigOf(r);
                    return (
                      <tr key={i} className={stale ? "opacity-60" : undefined}>
                        <td className="py-1 pr-2">
                          <input className={CELL} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} onBlur={() => onRowBlur(i)} placeholder="Eggplant" />
                          {r.st === "error" ? (
                            <div className="mt-0.5 text-[10px] text-[#ff5c7a]">Couldn&apos;t find this food. Try a clearer name.</div>
                          ) : r.food_name && r.food_name.toLowerCase() !== r.name.trim().toLowerCase() ? (
                            <div className="mt-0.5 truncate text-[10px] text-text-muted">
                              {r.food_name}
                              {r.st === "new" ? " · added to library" : ""}
                            </div>
                          ) : r.st === "new" ? (
                            <div className="mt-0.5 text-[10px] text-text-muted">Added to library</div>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 align-top">
                          <input
                            className={CELL}
                            value={r.portion}
                            onChange={(e) => setRow(i, { portion: e.target.value })}
                            onBlur={() => onRowBlur(i)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onRowBlur(i);
                            }}
                            placeholder="1"
                          />
                        </td>
                        {r.st === "loading" ? (
                          <td colSpan={5} className="py-1 pr-2 text-right align-top text-xs text-text-muted">
                            Looking up…
                          </td>
                        ) : (
                          <>
                            <td className="py-2 pr-2 text-right align-top text-text-muted">{num(r.grams)}</td>
                            <td className="py-2 pr-2 text-right align-top font-semibold text-text-primary">{r.kcal ? Math.round(r.kcal) : "—"}</td>
                            <td className="py-2 pr-2 text-right align-top">{num(r.protein_g, "g")}</td>
                            <td className="py-2 pr-2 text-right align-top">{num(r.carbs_g, "g")}</td>
                            <td className="py-2 pr-2 text-right align-top">{num(r.fat_g, "g")}</td>
                          </>
                        )}
                        <td className="py-1 align-top">
                          <button type="button" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove item" className="mt-1.5 text-text-muted hover:text-[#ff5c7a]">
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setRows((cur) => [...cur, blankRow()])} className="mt-2 inline-flex items-center gap-1 text-xs text-[#4f8cff] hover:underline">
              <Plus size={14} /> Add item
            </button>

            {mode === "manual" && !meal && (
              <div className="mt-3 w-28">
                <label className={LABEL}>Servings</label>
                <input className={INPUT} type="number" min={1} max={50} value={servings} onChange={(e) => setServings(e.target.value)} />
              </div>
            )}

            <div className="mt-3 grid grid-cols-5 gap-2 rounded-xl bg-white/5 p-3 text-center text-sm">
              {[
                ["Calories", share.kcal.toLocaleString()],
                ["Protein", `${share.protein_g} g`],
                ["Carbs", `${share.carbs_g} g`],
                ["Fat", `${share.fat_g} g`],
                ["Fiber", `${share.fiber_g} g`],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="text-[11px] text-text-muted">{l}</div>
                  <div className="font-semibold text-text-primary">{v}</div>
                </div>
              ))}
            </div>
            {nServ > 1 && <p className="mt-1 text-xs text-text-muted">Your share: total ÷ {nServ} servings.</p>}

            <div className="mt-3">
              <label className={LABEL}>Notes (optional)</label>
              <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          {showTable && (
            <button type="button" disabled={busy !== "" || looking} onClick={save} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50">
              {busy === "save" ? "Saving…" : looking ? "Looking up…" : "Save meal"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
