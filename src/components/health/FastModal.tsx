"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { FAST_MILESTONES, FAST_PRESETS, fastMs, fastStats, fmtDuration, fmtHours, type Fast } from "@/lib/health/calc";
import { deleteFast, startFast, updateFast } from "@/lib/health/queries";
import { toLocalInput, useNow } from "./useNow";

const INPUT = "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";
const YELLOW = "#f5d020";
const GREEN = "#3ddc97";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Start / track / end a fast. Live counter, progress to goal, hour
// milestones, lifetime counters and history. Popup closes only via buttons/Escape.
export default function FastModal({
  userId,
  fasts,
  onClose,
  onChanged,
}: {
  userId: string;
  fasts: Fast[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const active = fasts.find((f) => !f.ended_at) ?? null;
  const now = useNow(true);
  const [goal, setGoal] = useState(String(active?.goal_hours ?? 24));
  const [startAt, setStartAt] = useState(toLocalInput(new Date()));
  const [editStart, setEditStart] = useState(active ? toLocalInput(new Date(active.started_at)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goalH = Math.min(720, Math.max(1, Number(goal) || 16));
  const stats = fastStats(fasts, now);
  const history = fasts.filter((f) => f.ended_at).slice(0, 12);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      const t = new Date(startAt);
      if (Number.isNaN(t.getTime()) || t.getTime() > Date.now() + 60000) throw new Error("Start time can't be in the future.");
      await startFast(createClient(), userId, t.toISOString(), goalH);
    });

  const end = async () => {
    if (!active) return;
    const ms = fastMs(active, now);
    if (!(await confirm({ title: "End fast?", message: `End your fast at ${fmtDuration(ms, false)}?`, confirmLabel: "End fast" }))) return;
    await run(() => updateFast(createClient(), active.id, { ended_at: new Date().toISOString() }));
  };

  const saveActive = () =>
    run(async () => {
      if (!active) return;
      const t = new Date(editStart);
      if (Number.isNaN(t.getTime()) || t.getTime() > Date.now()) throw new Error("Start time can't be in the future.");
      await updateFast(createClient(), active.id, { started_at: t.toISOString(), goal_hours: goalH });
    });

  const remove = async (f: Fast) => {
    if (!(await confirm({ message: f.ended_at ? "Delete this fast from history?" : "Cancel this fast? It won't be saved.", danger: true, confirmLabel: f.ended_at ? "Delete" : "Cancel fast" }))) return;
    await run(() => deleteFast(createClient(), f.id));
  };

  const ms = active ? fastMs(active, now) : 0;
  const goalMs = active ? Number(active.goal_hours) * 3600000 : 0;
  const pct = active ? Math.min(100, (ms / goalMs) * 100) : 0;
  const reached = active && ms >= goalMs;
  const goalAt = active ? new Date(new Date(active.started_at).getTime() + goalMs) : null;
  const maxMark = active ? Math.max(Number(active.goal_hours), 16) : 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">{active ? "Fasting" : "Start a fast"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {active ? (
          <>
            <div className="rounded-xl bg-white/[0.04] p-4 text-center">
              <div className="font-mono text-4xl font-bold tabular-nums" style={{ color: reached ? GREEN : YELLOW }}>
                {fmtDuration(ms)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Started {when(active.started_at)} · Goal {Number(active.goal_hours)}h
              </div>
              <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: reached ? GREEN : YELLOW }} />
              </div>
              <div className="relative mt-1 h-4 text-[10px] text-text-muted">
                {FAST_MILESTONES.filter((h) => h < maxMark).map((h) => (
                  <span
                    key={h}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${(h / maxMark) * 100}%`, color: ms >= h * 3600000 ? GREEN : undefined }}
                  >
                    {h}h
                  </span>
                ))}
              </div>
              <div className="mt-2 text-sm text-text-primary">
                {reached ? (
                  <span style={{ color: GREEN }}>Goal reached · {fmtDuration(ms - goalMs, false)} past goal</span>
                ) : (
                  <>
                    {fmtDuration(goalMs - ms, false)} to go · ends {goalAt ? when(goalAt.toISOString()) : ""}
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Started at</label>
                <input className={INPUT} type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Goal (hours)</label>
                <input className={INPUT} type="number" min={1} max={720} value={goal} onChange={(e) => setGoal(e.target.value)} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FAST_PRESETS.map((h) => (
                <button key={h} type="button" onClick={() => setGoal(String(h))} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${goalH === h ? "border-[#f5d020] text-[#f5d020]" : "border-white/15 text-text-muted hover:text-text-primary"}`}>
                  {h}h
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button type="button" disabled={busy} onClick={() => remove(active)} className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-[#ff5c7a]">
                Cancel fast
              </button>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={saveActive} className="rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5 disabled:opacity-50">
                  Save changes
                </button>
                <button type="button" disabled={busy} onClick={end} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50">
                  End fast
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <label className={LABEL}>Goal</label>
            <div className="flex flex-wrap gap-1.5">
              {FAST_PRESETS.map((h) => (
                <button key={h} type="button" onClick={() => setGoal(String(h))} className={`rounded-full border px-3 py-1 text-xs ${goalH === h ? "border-[#f5d020] bg-[#f5d020]/15 text-[#f5d020]" : "border-white/15 text-text-primary hover:bg-white/5"}`}>
                  {h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h}h`}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Custom (hours)</label>
                <input className={INPUT} type="number" min={1} max={720} value={goal} onChange={(e) => setGoal(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Started at</label>
                <input className={INPUT} type="datetime-local" value={startAt} max={toLocalInput(new Date())} onChange={(e) => setStartAt(e.target.value)} />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-text-muted">Already fasting? Set the time of your last meal.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
                Close
              </button>
              <button type="button" disabled={busy} onClick={start} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50">
                {busy ? "Starting…" : `Start ${goalH}h fast`}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}

        {/* Counters */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-4 text-center sm:grid-cols-4">
          {[
            ["Fasts", String(stats.count)],
            ["Longest", stats.longestMs ? fmtHours(stats.longestMs) : "—"],
            ["Average", stats.avgMs ? fmtHours(stats.avgMs) : "—"],
            ["This month", `${stats.monthHours}h`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-white/[0.03] py-2">
              <div className="text-[11px] text-text-muted">{l}</div>
              <div className="font-semibold text-text-primary">{v}</div>
            </div>
          ))}
        </div>
        {stats.count > 0 && (
          <div className="mt-1 text-center text-[11px] text-text-muted">
            Goal met {stats.goalsMet} of {stats.count}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Recent fasts</div>
            <div className="flex flex-col gap-1">
              {history.map((f) => {
                const d = fastMs(f);
                const met = d >= Number(f.goal_hours) * 3600000;
                return (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-text-muted">{when(f.started_at)}</span>
                    <span className="font-semibold" style={{ color: met ? GREEN : undefined }}>
                      {fmtHours(d)}
                    </span>
                    <span className="w-14 text-right text-text-muted">/ {Number(f.goal_hours)}h</span>
                    <button type="button" onClick={() => remove(f)} aria-label="Delete" className="text-text-muted hover:text-[#ff5c7a]">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
