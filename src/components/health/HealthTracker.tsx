"use client";

import { useEffect, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Dumbbell, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  GOAL_ADJUST,
  GOAL_LABEL,
  MEAL_TYPES,
  addDays,
  baselineBurn,
  fmtKcal,
  kgToLb,
  localIso,
  type Exercise,
  type HealthProfile,
  type Meal,
} from "@/lib/health/calc";
import { deleteExercise, deleteMeal, fetchExercise, fetchHealthProfile, fetchMeals, photoUrls } from "@/lib/health/queries";
import MealModal from "./MealModal";
import ExerciseModal from "./ExerciseModal";
import HealthProfileModal from "./HealthProfileModal";

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const GREEN = "#3ddc97";
const RED = "#ff5c7a";
const YELLOW = "#f5d020";

function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Calories in (meals, photo AI or manual) vs calories out (resting baseline
// + logged exercise), for one day plus a 7-day trend. App Director only.
export default function HealthTracker({ userId }: { userId: string }) {
  const confirm = useConfirm();
  const today = localIso();
  const [date, setDate] = useState(today);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [exercise, setExercise] = useState<Exercise[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [mealModal, setMealModal] = useState<{ mode: "photo" | "manual"; meal?: Meal } | null>(null);
  const [exModal, setExModal] = useState<{ exercise?: Exercise } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      try {
        const from = addDays(date, -6);
        const [p, m, e] = await Promise.all([
          fetchHealthProfile(supabase, userId),
          fetchMeals(supabase, from, date),
          fetchExercise(supabase, from, date),
        ]);
        const urls = await photoUrls(supabase, m.filter((x) => x.eaten_on === date && x.photo_path).map((x) => x.photo_path as string));
        if (cancelled) return;
        setProfile(p);
        setMeals(m);
        setExercise(e);
        setThumbs(urls);
        setError(null);
        if (!p && reload === 0) setProfileOpen(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load health data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, date, reload]);

  const refresh = () => setReload((n) => n + 1);
  const base = baselineBurn(profile);
  const dayMeals = meals.filter((m) => m.eaten_on === date);
  const dayEx = exercise.filter((e) => e.done_on === date);
  const kcalIn = dayMeals.reduce((s, m) => s + m.kcal, 0);
  const kcalEx = dayEx.reduce((s, e) => s + e.kcal, 0);
  const kcalOut = (base ?? 0) + kcalEx;
  const net = kcalIn - kcalOut;
  const target = base !== null ? base + kcalEx + GOAL_ADJUST[profile!.goal] : null;
  const left = target !== null ? target - kcalIn : null;
  const macros = dayMeals.reduce((a, m) => ({ p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g }), { p: 0, c: 0, f: 0 });

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i - 6);
    const inn = meals.filter((m) => m.eaten_on === d).reduce((s, m) => s + m.kcal, 0);
    const out = (base ?? 0) + exercise.filter((e) => e.done_on === d).reduce((s, e) => s + e.kcal, 0);
    return { d, inn, out };
  });
  const weekMax = Math.max(1, ...week.map((w) => Math.max(w.inn, w.out)));
  const logged = week.filter((w) => w.inn > 0);
  const avgNet = logged.length ? Math.round(logged.reduce((s, w) => s + (w.inn - w.out), 0) / logged.length) : null;

  async function removeMeal(m: Meal) {
    if (!(await confirm({ message: `Delete "${m.title}"?`, danger: true, confirmLabel: "Delete" }))) return;
    try {
      await deleteMeal(createClient(), m);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }
  async function removeEx(e: Exercise) {
    if (!(await confirm({ message: `Delete "${e.activity}"?`, danger: true, confirmLabel: "Delete" }))) return;
    try {
      await deleteExercise(createClient(), e.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  if (loading) return <div className="text-sm text-text-muted">Loading…</div>;

  const stat = (label: string, value: string, sub: string, color?: string) => (
    <div className={CARD}>
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-1.5 text-3xl font-bold ${color ? "" : "text-text-primary"}`} style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mt-1 text-xs text-text-muted">{sub}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Date + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[120px] text-center text-sm font-semibold text-text-primary">{dayLabel(date, today)}</div>
          <button
            type="button"
            disabled={date >= today}
            onClick={() => setDate(addDays(date, 1))}
            aria-label="Next day"
            className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
          {date !== today && (
            <button type="button" onClick={() => setDate(today)} className="ml-1 text-xs text-[#4f8cff] hover:underline">
              Today
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMealModal({ mode: "photo" })} className="inline-flex items-center gap-1.5 rounded-md bg-[#f5d020] px-3 py-2 text-sm font-semibold text-[#0f131c]">
            <Camera size={16} /> Snap meal
          </button>
          <button type="button" onClick={() => setMealModal({ mode: "manual" })} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5">
            <Plus size={16} /> Add food
          </button>
          <button type="button" onClick={() => setExModal({})} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5">
            <Dumbbell size={16} /> Log exercise
          </button>
          <button type="button" onClick={() => setProfileOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5">
            <UserRound size={16} /> Profile
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 px-4 py-2.5 text-sm text-[#ff5c7a]">{error}</div>}
      {!profile && (
        <div className="rounded-xl border border-[#f5d020]/40 bg-[#f5d020]/[0.07] px-4 py-3 text-sm text-text-primary">
          Set up your <button type="button" onClick={() => setProfileOpen(true)} className="font-semibold text-[#f5d020] underline">health profile</button> so calories out can include your resting burn.
        </div>
      )}

      {/* Day summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stat("Calories in", fmtKcal(kcalIn), `P ${Math.round(macros.p)}g · C ${Math.round(macros.c)}g · F ${Math.round(macros.f)}g`)}
        {stat("Calories out", base === null ? fmtKcal(kcalEx) : fmtKcal(kcalOut), base === null ? "Exercise only (set up profile)" : `${fmtKcal(base)} baseline + ${fmtKcal(kcalEx)} exercise`)}
        {stat(
          "Net",
          `${net > 0 ? "+" : ""}${fmtKcal(net)}`,
          net < 0 ? "Deficit (in minus out)" : net > 0 ? "Surplus (in minus out)" : "Even",
          kcalIn === 0 ? undefined : net <= 0 ? GREEN : RED,
        )}
        {stat(
          "Left today",
          left === null ? "—" : fmtKcal(left),
          left === null ? "Set up profile for a target" : `Target ${fmtKcal(target!)} · ${GOAL_LABEL[profile!.goal]}`,
          left === null ? undefined : left >= 0 ? YELLOW : RED,
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Meals */}
        <div className={`${CARD} xl:col-span-2`}>
          <div className="mb-3 text-sm font-semibold text-text-primary">Food</div>
          {dayMeals.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing logged. Tap Snap meal to photograph your plate or ingredients.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {[...MEAL_TYPES, "meal" as const].map((t) => {
                const rows = dayMeals.filter((m) => m.meal_type === t);
                if (!rows.length) return null;
                return (
                  <div key={t}>
                    <div className="mb-1.5 flex justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
                      <span>{t === "meal" ? "Other" : t}</span>
                      <span>{fmtKcal(rows.reduce((s, m) => s + m.kcal, 0))} cal</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {rows.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/30">
                            {m.photo_path && thumbs[m.photo_path] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumbs[m.photo_path]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-text-muted">{m.source === "photo" ? "Photo" : "Manual"}</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-text-primary">{m.title}</div>
                            <div className="truncate text-xs text-text-muted">{m.items.map((i) => i.name).join(", ")}</div>
                            <div className="text-[11px] text-text-muted">
                              P {Math.round(m.protein_g)}g · C {Math.round(m.carbs_g)}g · F {Math.round(m.fat_g)}g
                            </div>
                          </div>
                          <div className="text-right text-sm font-semibold text-text-primary">{fmtKcal(m.kcal)}</div>
                          <div className="flex flex-col gap-1">
                            <button type="button" onClick={() => setMealModal({ mode: m.source, meal: m })} aria-label="Edit" className="text-text-muted hover:text-text-primary">
                              <Pencil size={15} />
                            </button>
                            <button type="button" onClick={() => removeMeal(m)} aria-label="Delete" className="text-text-muted hover:text-[#ff5c7a]">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Exercise */}
        <div className={CARD}>
          <div className="mb-3 flex justify-between text-sm font-semibold text-text-primary">
            <span>Exercise</span>
            <span style={{ color: GREEN }}>{fmtKcal(kcalEx)} cal</span>
          </div>
          {dayEx.length === 0 ? (
            <p className="text-sm text-text-muted">No workouts logged.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {dayEx.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{e.activity}</div>
                    <div className="text-xs text-text-muted">{Math.round(e.minutes)} min</div>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: GREEN }}>
                    {fmtKcal(e.kcal)}
                  </div>
                  <button type="button" onClick={() => setExModal({ exercise: e })} aria-label="Edit" className="text-text-muted hover:text-text-primary">
                    <Pencil size={15} />
                  </button>
                  <button type="button" onClick={() => removeEx(e)} aria-label="Delete" className="text-text-muted hover:text-[#ff5c7a]">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {profile?.weight_kg && (
            <p className="mt-3 text-[11px] text-text-muted">
              Based on {profile.units === "metric" ? `${Number(profile.weight_kg)} kg` : `${Math.round(kgToLb(Number(profile.weight_kg)))} lb`}
              {profile.body_fat_pct ? `, ${Number(profile.body_fat_pct)}% body fat` : ""}. Update in Profile.
            </p>
          )}
        </div>
      </div>

      {/* 7-day trend */}
      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-text-primary">Last 7 days</div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YELLOW }} /> In
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} /> Out
            </span>
            {avgNet !== null && (
              <span>
                Avg net (logged days): <span className="font-semibold" style={{ color: avgNet <= 0 ? GREEN : RED }}>{avgNet > 0 ? "+" : ""}{fmtKcal(avgNet)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {week.map((w) => (
            <button key={w.d} type="button" onClick={() => setDate(w.d)} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${w.d === date ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}>
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div className="w-3 rounded-t sm:w-4" style={{ height: `${(w.inn / weekMax) * 100}%`, background: YELLOW, minHeight: w.inn ? 2 : 0 }} title={`In ${fmtKcal(w.inn)}`} />
                <div className="w-3 rounded-t sm:w-4" style={{ height: `${(w.out / weekMax) * 100}%`, background: GREEN, minHeight: w.out ? 2 : 0 }} title={`Out ${fmtKcal(w.out)}`} />
              </div>
              <div className="text-[10px] text-text-muted">{dayLabel(w.d, today).replace(/,.*$/, "")}</div>
              <div className="text-[10px] font-semibold" style={{ color: !w.inn ? undefined : w.inn - w.out <= 0 ? GREEN : RED }}>
                {w.inn ? `${w.inn - w.out > 0 ? "+" : ""}${fmtKcal(w.inn - w.out)}` : "—"}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-text-muted/80">
          Photo estimates are typically within 20-30%; adding weights in the note helps. Calories out = resting baseline (BMR x 1.2; BMR uses lean mass when body fat % is set) + logged
          exercise. Informational only, not medical advice.
        </p>
      </div>

      {mealModal && (
        <MealModal userId={userId} date={date} mode={mealModal.mode} meal={mealModal.meal} onClose={() => setMealModal(null)} onSaved={refresh} />
      )}
      {exModal && (
        <ExerciseModal userId={userId} date={date} weightKg={profile?.weight_kg ? Number(profile.weight_kg) : null} exercise={exModal.exercise} onClose={() => setExModal(null)} onSaved={refresh} />
      )}
      {profileOpen && (
        <HealthProfileModal
          userId={userId}
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSaved={(p) => {
            setProfile(p);
            refresh();
          }}
        />
      )}
    </div>
  );
}
