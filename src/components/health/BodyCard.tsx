"use client";

import { useState } from "react";
import { Bell, Pencil, Ruler, Scale, Trash2 } from "lucide-react";
import { cmToIn, kgToLb, type Measurement } from "@/lib/health/calc";

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const GREEN = "#3ddc97";
const RED = "#ff5c7a";

type Stat = { key: keyof Measurement; label: string; kind: "mass" | "length" | "pct" | "plain"; better: "down" | "up" | null };
const STATS: Stat[] = [
  { key: "weight_kg", label: "Weight", kind: "mass", better: "down" },
  { key: "body_fat_pct", label: "Body fat", kind: "pct", better: "down" },
  { key: "muscle_mass_kg", label: "Muscle", kind: "mass", better: "up" },
  { key: "visceral_fat", label: "Visceral fat", kind: "plain", better: "down" },
  { key: "water_pct", label: "Water", kind: "pct", better: "up" },
  { key: "waist_cm", label: "Waist", kind: "length", better: "down" },
];

function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Body composition: latest weigh-in / measurements with change vs the
// previous entry, a weight trend, history, and the reminder settings.
export default function BodyCard({
  entries,
  units,
  onLog,
  onEdit,
  onDelete,
  onReminders,
  remindersOn,
}: {
  entries: Measurement[];
  units: "imperial" | "metric";
  onLog: (focus: "weigh" | "measure") => void;
  onEdit: (m: Measurement) => void;
  onDelete: (m: Measurement) => void;
  onReminders: () => void;
  remindersOn: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const imperial = units === "imperial";
  const conv = (kind: Stat["kind"], v: number) => (kind === "mass" && imperial ? kgToLb(v) : kind === "length" && imperial ? cmToIn(v) : v);
  const unit = (kind: Stat["kind"]) => (kind === "mass" ? (imperial ? " lb" : " kg") : kind === "length" ? (imperial ? " in" : " cm") : kind === "pct" ? "%" : "");
  const fmt = (kind: Stat["kind"], v: number | null) => (v == null ? "—" : `${Math.round(conv(kind, v) * 10) / 10}${unit(kind)}`);

  // Latest value of each stat, and the previous value for the change arrow.
  const latestOf = (key: keyof Measurement) => {
    const withVal = entries.filter((e) => e[key] != null);
    return { cur: withVal[0] ?? null, prev: withVal[1] ?? null };
  };
  const weights = entries.filter((e) => e.weight_kg != null).slice(0, 12).reverse();
  const wMin = Math.min(...weights.map((w) => w.weight_kg as number));
  const wMax = Math.max(...weights.map((w) => w.weight_kg as number));

  return (
    <div className={CARD}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-text-primary">Body</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onLog("weigh")} className="inline-flex items-center gap-1.5 rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c]">
            <Scale size={14} /> Log weigh-in
          </button>
          <button type="button" onClick={() => onLog("measure")} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs text-text-primary hover:bg-white/5">
            <Ruler size={14} /> Measurements
          </button>
          <button
            type="button"
            onClick={onReminders}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-white/5 ${remindersOn ? "border-[#f5d020]/50 text-[#f5d020]" : "border-white/20 text-text-primary"}`}
          >
            <Bell size={14} /> Reminders{remindersOn ? " on" : ""}
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">No weigh-ins yet. Log your Eufy numbers to start tracking trends.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {STATS.map((s) => {
              const { cur, prev } = latestOf(s.key);
              const v = cur ? (cur[s.key] as number) : null;
              const d = cur && prev ? conv(s.kind, v as number) - conv(s.kind, prev[s.key] as number) : null;
              const good = d == null || d === 0 || s.better == null ? null : s.better === "down" ? d < 0 : d > 0;
              return (
                <div key={s.key} className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[11px] text-text-muted">{s.label}</div>
                  <div className="mt-0.5 text-lg font-semibold text-text-primary">{fmt(s.kind, v)}</div>
                  <div className="text-[11px]" style={{ color: good == null ? undefined : good ? GREEN : RED }}>
                    {d == null ? (cur ? fmtDay(cur.measured_on) : "") : `${d > 0 ? "+" : ""}${Math.round(d * 10) / 10} since ${fmtDay(prev!.measured_on)}`}
                  </div>
                </div>
              );
            })}
          </div>

          {weights.length > 1 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] text-text-muted">Weight trend</div>
              <div className="flex h-16 items-end gap-1">
                {weights.map((w) => {
                  const h = wMax === wMin ? 50 : 15 + ((Number(w.weight_kg) - wMin) / (wMax - wMin)) * 85;
                  return (
                    <div key={w.id} className="flex flex-1 flex-col items-center justify-end" title={`${fmtDay(w.measured_on)}: ${fmt("mass", w.weight_kg)}`}>
                      <div className="w-full max-w-6 rounded-t bg-[#4f8cff]/70" style={{ height: `${h}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button type="button" onClick={() => setShowHistory((x) => !x)} className="mt-3 text-xs text-[#4f8cff] hover:underline">
            {showHistory ? "Hide history" : `History (${entries.length})`}
          </button>
          {showHistory && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[12px]">
                <thead className="text-[11px] text-text-muted">
                  <tr>
                    <th className="pb-1 pr-2 font-medium">Date</th>
                    {STATS.map((s) => (
                      <th key={s.key} className="pb-1 pr-2 text-right font-medium">
                        {s.label}
                      </th>
                    ))}
                    <th className="pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-white/[0.06]">
                      <td className="py-1.5 pr-2 text-text-primary">{fmtDay(e.measured_on)}</td>
                      {STATS.map((s) => (
                        <td key={s.key} className="py-1.5 pr-2 text-right text-text-muted">
                          {fmt(s.kind, e[s.key] as number | null)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <button type="button" onClick={() => onEdit(e)} aria-label="Edit" className="text-text-muted hover:text-text-primary">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => onDelete(e)} aria-label="Delete" className="ml-2 text-text-muted hover:text-[#ff5c7a]">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
