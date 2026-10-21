"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_REMINDERS, WEEKDAYS, type Reminder, type ReminderFreq, type Reminders } from "@/lib/health/calc";
import { saveReminders } from "@/lib/health/queries";
import PhoneNotifications from "./PhoneNotifications";

const INPUT = "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2 text-[13px] text-text-primary";
const LABEL = "mb-1 block text-xs font-medium text-text-muted";

const ROWS: { key: "weigh" | "measure"; title: string; freqs: ReminderFreq[] }[] = [
  { key: "weigh", title: "Weigh-in", freqs: ["daily", "weekly", "biweekly", "monthly"] },
  { key: "measure", title: "Tape measurements", freqs: ["weekly", "biweekly", "monthly"] },
];
const FREQ_LABEL: Record<ReminderFreq, string> = { daily: "Every day", weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month" };

// Reminders: when one is due, the Health page and the side-panel Health card
// show it until you log an entry; with Phone notifications on, the
// push-reminders edge function also sends it to the device at the set time.
// Popup closes only via buttons/Escape.
export default function RemindersModal({
  userId,
  reminders,
  onClose,
  onSaved,
}: {
  userId: string;
  reminders: Reminders | null | undefined;
  onClose: () => void;
  onSaved: (r: Reminders) => void;
}) {
  const [r, setR] = useState<Required<Reminders>>({
    weigh: { ...DEFAULT_REMINDERS.weigh, ...(reminders?.weigh ?? {}) },
    measure: { ...DEFAULT_REMINDERS.measure, ...(reminders?.measure ?? {}) },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: "weigh" | "measure", patch: Partial<Reminder>) => setR((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveReminders(createClient(), userId, r);
      onSaved(r);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-10">
      <div className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Reminders</h3>
            <p className="mt-0.5 text-xs text-text-muted">Shown on the Health page and side panel when due, until you log it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {ROWS.map(({ key, title, freqs }) => {
            const rem = r[key];
            return (
              <div key={key} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">{title}</span>
                  <input type="checkbox" checked={rem.on} onChange={(e) => set(key, { on: e.target.checked })} className="h-4 w-4" />
                </label>
                {rem.on && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={LABEL}>How often</label>
                      <select className={INPUT} value={rem.freq} onChange={(e) => set(key, { freq: e.target.value as ReminderFreq })}>
                        {freqs.map((f) => (
                          <option key={f} value={f}>
                            {FREQ_LABEL[f]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(rem.freq === "weekly" || rem.freq === "biweekly") && (
                      <div>
                        <label className={LABEL}>Day</label>
                        <select className={INPUT} value={rem.day} onChange={(e) => set(key, { day: Number(e.target.value) })}>
                          {WEEKDAYS.map((d, i) => (
                            <option key={d} value={i}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {rem.freq === "monthly" && (
                      <div>
                        <label className={LABEL}>Day of month</label>
                        <select className={INPUT} value={Math.min(Math.max(rem.day, 1), 28)} onChange={(e) => set(key, { day: Number(e.target.value) })}>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className={LABEL}>Time</label>
                      <input className={INPUT} type="time" value={rem.time} onChange={(e) => set(key, { time: e.target.value || "07:00" })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <PhoneNotifications userId={userId} />
        </div>
        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={save} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
