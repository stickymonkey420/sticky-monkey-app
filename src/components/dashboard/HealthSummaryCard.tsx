"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyRole } from "@/lib/usersGroups/queries";
import { GOAL_ADJUST, baselineBurn, fmtKcal, kgToLb, localIso, reminderDue, type HealthProfile } from "@/lib/health/calc";
import { fetchExercise, fetchHealthProfile, fetchMeals, fetchMeasurements } from "@/lib/health/queries";

type Today = { profile: HealthProfile | null; kcalIn: number; kcalEx: number; protein: number; due: string[] };

// Today's Health at a glance in the right-side profile pane (App Director
// only, same as the Health page): calories in vs out, what's left against
// the goal, and weight / body fat. Refreshes on every page change so it
// picks up meals just logged on /health.
export default function HealthSummaryCard() {
  const pathname = usePathname();
  const [data, setData] = useState<Today | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const role = await fetchMyRole(supabase, user.id);
      if (role !== "app_director") return;
      try {
        const today = localIso();
        const [profile, meals, ex, ms] = await Promise.all([
          fetchHealthProfile(supabase, user.id),
          fetchMeals(supabase, today, today),
          fetchExercise(supabase, today, today),
          fetchMeasurements(supabase, 30),
        ]);
        if (cancelled) return;
        const lastWeigh = ms.find((m) => m.weight_kg != null)?.measured_on ?? null;
        const lastTape = ms.find((m) => m.waist_cm != null || m.chest_cm != null || m.hips_cm != null || m.arm_cm != null)?.measured_on ?? null;
        const due: string[] = [];
        if (reminderDue(profile?.reminders?.weigh, lastWeigh)) due.push("Weigh-in due");
        if (reminderDue(profile?.reminders?.measure, lastTape)) due.push("Measurements due");
        setData({
          profile,
          kcalIn: meals.reduce((s, m) => s + m.kcal, 0),
          kcalEx: ex.reduce((s, e) => s + e.kcal, 0),
          protein: meals.reduce((s, m) => s + m.protein_g, 0),
          due,
        });
      } catch {
        /* card just stays hidden */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!data) return null;

  const base = baselineBurn(data.profile);
  const out = (base ?? 0) + data.kcalEx;
  const target = base !== null && data.profile ? base + data.kcalEx + GOAL_ADJUST[data.profile.goal] : null;
  const left = target !== null ? target - data.kcalIn : null;
  const pct = target ? Math.min(100, Math.round((data.kcalIn / target) * 100)) : 0;
  const p = data.profile;
  const weight = p?.weight_kg ? (p.units === "metric" ? `${Number(p.weight_kg)} kg` : `${Math.round(kgToLb(Number(p.weight_kg)) * 10) / 10} lb`) : null;

  return (
    <Link href="/health" className="block rounded-[30px] p-[30px] transition-colors hover:brightness-110" style={{ backgroundColor: "rgb(32,40,56)" }}>
      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>Health today</span>
        <HeartPulse size={16} className="text-[#ff5c7a]" />
      </div>
      {data.due.length > 0 && (
        <div className="mt-2 rounded-lg bg-[#f5d020]/15 px-2.5 py-1 text-xs font-semibold text-[#f5d020]">{data.due.join(" · ")}</div>
      )}
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-text-primary">{left === null ? fmtKcal(data.kcalIn) : fmtKcal(left)}</span>
        <span className="text-sm text-text-muted">{left === null ? "cal in" : left >= 0 ? "cal left" : "cal over"}</span>
      </div>
      {target !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: left !== null && left < 0 ? "#eb5757" : "#f5d020" }} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <div className="text-text-muted">In</div>
          <div className="mt-1 font-semibold" style={{ color: "#f5d020" }}>
            {fmtKcal(data.kcalIn)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Out</div>
          <div className="mt-1 font-semibold" style={{ color: "#3ddc97" }}>
            {base === null ? fmtKcal(data.kcalEx) : fmtKcal(out)}
          </div>
        </div>
        {weight && (
          <div>
            <div className="text-text-muted">Weight</div>
            <div className="mt-1 font-semibold text-text-primary">{weight}</div>
          </div>
        )}
        {p?.body_fat_pct ? (
          <div>
            <div className="text-text-muted">Body fat</div>
            <div className="mt-1 font-semibold text-text-primary">{Number(p.body_fat_pct)}%</div>
          </div>
        ) : (
          <div>
            <div className="text-text-muted">Protein</div>
            <div className="mt-1 font-semibold text-text-primary">{Math.round(data.protein)} g</div>
          </div>
        )}
      </div>
      {!p && <div className="mt-3 text-xs text-text-muted">Set up your health profile for calories out and a daily target.</div>}
    </Link>
  );
}
