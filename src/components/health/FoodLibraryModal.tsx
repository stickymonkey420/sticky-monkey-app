"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { LibraryFood } from "@/lib/health/calc";
import { addLibraryFood, deleteLibraryFood, fetchFoodLibrary, updateLibraryFood } from "@/lib/health/queries";

const CELL = "w-full rounded-md border border-[rgba(148,158,189,0.35)] bg-[#0d0f17] px-2 py-1.5 text-[13px] text-text-primary";

type Draft = { name: string; kcal: string; p: string; c: string; f: string; fiber: string; each: string };
type NewDraft = { name: string; per: "100g" | "serving"; servingG: string; servingName: string; kcal: string; p: string; c: string; f: string; fiber: string; sugar: string; sodium: string };
const EMPTY_NEW: NewDraft = { name: "", per: "serving", servingG: "", servingName: "serving", kcal: "", p: "", c: "", f: "", fiber: "", sugar: "", sodium: "" };
const UNIT_CHOICES = ["serving", "cup", "bowl", "plate", "each", "slice", "tbsp"];

// Your food library: every food the app has looked up, with nutrition per
// 100 g and household-unit weights. Fix a value here and every future meal
// uses it. Popup closes only via buttons/Escape.
export default function FoodLibraryModal({ onClose }: { onClose: () => void }) {
  const confirm = useConfirm();
  const [foods, setFoods] = useState<LibraryFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState<NewDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchFoodLibrary(createClient());
        if (!cancelled) setFoods(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the library.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function startEdit(f: LibraryFood) {
    setEditId(f.id);
    setDraft({
      name: f.name,
      kcal: String(f.kcal_100g),
      p: String(f.protein_100g),
      c: String(f.carbs_100g),
      f: String(f.fat_100g),
      fiber: f.fiber_100g == null ? "" : String(f.fiber_100g),
      each: f.units.each ? String(f.units.each) : "",
    });
  }

  async function saveEdit(f: LibraryFood) {
    if (!draft) return;
    const n = (s: string) => Math.max(0, Number(s) || 0);
    if (!draft.name.trim()) return setError("Name is required.");
    if (n(draft.kcal) > 950) return setError("Calories per 100 g can't be over 950.");
    const units = { ...f.units };
    if (n(draft.each) > 0) units.each = n(draft.each);
    else delete units.each;
    try {
      await updateLibraryFood(createClient(), f.id, {
        name: draft.name.trim().slice(0, 120),
        kcal_100g: n(draft.kcal),
        protein_100g: n(draft.p),
        carbs_100g: n(draft.c),
        fat_100g: n(draft.f),
        fiber_100g: draft.fiber.trim() === "" ? null : n(draft.fiber),
        units,
      });
      setEditId(null);
      setDraft(null);
      setError(null);
      setReload((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  }

  async function saveNew() {
    if (!adding) return;
    const name = adding.name.trim().slice(0, 120);
    if (!name) return setError("Name is required.");
    const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));
    const servingG = num(adding.servingG);
    if (adding.per === "serving" && !(servingG && servingG > 0)) return setError("Enter how many grams one serving weighs (it's on the label, or weigh it once).");
    const scale = adding.per === "serving" ? 100 / servingG! : 1;
    const r1 = (v: number | null) => (v == null ? null : Math.round(v * scale * 10) / 10);
    const kcal = r1(num(adding.kcal));
    if (kcal == null) return setError("Calories are required.");
    if (kcal > 950) return setError("That works out to over 950 calories per 100 g. Check the serving weight.");
    const units: Record<string, number> = {};
    if (servingG && servingG > 0) units[adding.servingName || "serving"] = servingG;
    setSaving(true);
    try {
      await addLibraryFood(createClient(), {
        name,
        kcal_100g: kcal,
        protein_100g: r1(num(adding.p)) ?? 0,
        carbs_100g: r1(num(adding.c)) ?? 0,
        fat_100g: r1(num(adding.f)) ?? 0,
        fiber_100g: r1(num(adding.fiber)),
        sugar_100g: r1(num(adding.sugar)),
        sodium_mg_100g: num(adding.sodium) == null ? null : Math.round(num(adding.sodium)! * scale),
        units,
      });
      setAdding(null);
      setError(null);
      setQ(name);
      setReload((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(f: LibraryFood) {
    if (!(await confirm({ message: `Remove "${f.name}" from your food library? It will be looked up again next time.`, danger: true, confirmLabel: "Remove" }))) return;
    try {
      await deleteLibraryFood(createClient(), f.id);
      setReload((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = needle ? foods.filter((f) => f.name.toLowerCase().includes(needle) || f.aliases.some((a) => a.includes(needle))) : foods;
  const unitText = (u: Record<string, number>) =>
    Object.entries(u)
      .slice(0, 4)
      .map(([k, g]) => `1 ${k} = ${Math.round(g)} g`)
      .join(" · ");

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Food library</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Nutrition per 100 g. Foods are added automatically the first time you log them; edit a value and future meals use it.
              Missing a food or a family recipe? Add it once and log it by name after that.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <input className={CELL} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${foods.length} foods…`} />
          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding({ ...EMPTY_NEW, name: q.trim() }); setError(null); }}
              className="flex shrink-0 items-center gap-1 rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c]"
            >
              <Plus size={14} /> Add food
            </button>
          )}
        </div>
        {adding && (
          <div className="mb-4 rounded-xl border border-[rgba(245,208,32,0.35)] bg-[#0d0f17]/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text-primary">Add a custom food</h4>
              <button type="button" onClick={() => setAdding(null)} aria-label="Cancel" className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] text-text-muted sm:col-span-2">
                Name
                <input className={`${CELL} mt-1`} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="e.g. Lola's giniling" maxLength={120} />
              </label>
              <label className="text-[11px] text-text-muted">
                Values below are for
                <select className={`${CELL} mt-1`} value={adding.per} onChange={(e) => setAdding({ ...adding, per: e.target.value as NewDraft["per"] })}>
                  <option value="serving">One serving (from a label or recipe)</option>
                  <option value="100g">100 g</option>
                </select>
              </label>
              <div className="flex gap-2">
                <label className="flex-1 text-[11px] text-text-muted">
                  1
                  <select className={`${CELL} mt-1`} value={adding.servingName} onChange={(e) => setAdding({ ...adding, servingName: e.target.value })}>
                    {UNIT_CHOICES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-[11px] text-text-muted">
                  weighs (g){adding.per === "100g" && " · optional"}
                  <input className={`${CELL} mt-1 text-right`} type="number" min={0} step="any" value={adding.servingG} onChange={(e) => setAdding({ ...adding, servingG: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-7">
              {([
                ["kcal", "Calories"],
                ["p", "Protein g"],
                ["c", "Carbs g"],
                ["f", "Fat g"],
                ["fiber", "Fiber g"],
                ["sugar", "Sugar g"],
                ["sodium", "Sodium mg"],
              ] as const).map(([k, label]) => (
                <label key={k} className="text-[11px] text-text-muted">
                  {label}
                  <input className={`${CELL} mt-1 text-right`} type="number" min={0} step="any" value={adding[k]} onChange={(e) => setAdding({ ...adding, [k]: e.target.value })} />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-text-muted">Only calories are required. Log it by its name, or as &quot;1 {adding.servingName}&quot;.</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setAdding(null)} className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={saveNew} className="rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60">
                  {saving ? "Saving…" : "Save food"}
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="mb-2 text-sm text-[#ff5c7a]">{error}</p>}
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="text-sm text-text-muted">{foods.length ? "No matches." : "Empty. Log a meal and foods will appear here."}</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="sticky top-0 bg-card-bg text-[11px] text-text-muted">
                <tr>
                  <th className="pb-1.5 pr-2 font-medium">Food</th>
                  <th className="w-16 pb-1.5 pr-2 text-right font-medium">Cal</th>
                  <th className="w-14 pb-1.5 pr-2 text-right font-medium">Protein</th>
                  <th className="w-14 pb-1.5 pr-2 text-right font-medium">Carbs</th>
                  <th className="w-14 pb-1.5 pr-2 text-right font-medium">Fat</th>
                  <th className="w-14 pb-1.5 pr-2 text-right font-medium">Fiber</th>
                  <th className="w-20 pb-1.5 pr-2 text-right font-medium">1 each (g)</th>
                  <th className="w-14 pb-1.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((f) =>
                  editId === f.id && draft ? (
                    <tr key={f.id} className="border-t border-white/[0.06]">
                      <td className="py-1.5 pr-2">
                        <input className={CELL} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </td>
                      {(["kcal", "p", "c", "f", "fiber", "each"] as const).map((k) => (
                        <td key={k} className="py-1.5 pr-2">
                          <input className={`${CELL} text-right`} type="number" min={0} step="any" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                        </td>
                      ))}
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => saveEdit(f)} className="rounded-md bg-[#f5d020] px-2 py-1 text-xs font-semibold text-[#0f131c]">
                          Save
                        </button>
                        <button type="button" onClick={() => { setEditId(null); setDraft(null); }} className="ml-1 text-xs text-text-muted hover:text-text-primary">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={f.id} className="border-t border-white/[0.06]">
                      <td className="py-2 pr-2">
                        <div className="text-text-primary">
                          {f.name}
                          {f.source === "manual" && <span className="ml-1.5 text-[10px] text-[#f5d020]">{f.fdc_id ? "edited" : "custom"}</span>}
                        </div>
                        <div className="truncate text-[10px] text-text-muted">{unitText(f.units)}</div>
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold text-text-primary">{Math.round(f.kcal_100g)}</td>
                      <td className="py-2 pr-2 text-right">{f.protein_100g}g</td>
                      <td className="py-2 pr-2 text-right">{f.carbs_100g}g</td>
                      <td className="py-2 pr-2 text-right">{f.fat_100g}g</td>
                      <td className="py-2 pr-2 text-right">{f.fiber_100g == null ? "—" : `${f.fiber_100g}g`}</td>
                      <td className="py-2 pr-2 text-right">{f.units.each ? Math.round(f.units.each) : "—"}</td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => startEdit(f)} aria-label="Edit" className="text-text-muted hover:text-text-primary">
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => remove(f)} aria-label="Delete" className="ml-2 text-text-muted hover:text-[#ff5c7a]">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
