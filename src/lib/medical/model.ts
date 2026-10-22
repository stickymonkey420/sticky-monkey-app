// Health > Medical: universal follow-up tracker (vaccines with dose schedules,
// preventive checks with intervals, clinics anywhere). Built so a future AI
// pass can generate a different plan per member profile (age, sex, conditions);
// today it's seeded from the member's own plan.
import type { SupabaseClient } from "@supabase/supabase-js";

export type DoseSpec = { label: string; after_days: number; window_days?: number | null };
export type Vaccine = {
  id: string;
  name: string;
  category: string;
  reason: string | null;
  doses: DoseSpec[];
  repeat_days: number | null;
  active: boolean;
  sort: number;
  cost_per_dose?: number | null;
  cost_currency?: Currency | null;
};
export type DoseRecord = {
  id: string;
  vaccine_id: string;
  dose_label: string;
  given_on: string;
  location: string | null;
  notes: string | null;
  cost?: number | null;
  currency?: Currency | null;
};
export type Check = {
  id: string;
  name: string;
  why: string | null;
  interval_months: number | null;
  kind: "recurring" | "once" | "discuss" | "conditional";
  active: boolean;
  sort: number;
  est_cost?: number | null;
  cost_currency?: Currency | null;
};
export type CheckEvent = {
  id: string;
  check_id: string;
  done_on: string;
  result: string | null;
  location: string | null;
  cost?: number | null;
  currency?: Currency | null;
};
export type Provider = { id: string; name: string; city: string | null; country: string | null; kind: string | null; phone: string | null; notes: string | null };
export type MedicalSettings = { plan_start: string | null; notes: string | null; currency?: Currency };

// ---- money ----
// Costs are stored in the currency they were paid in; totals are shown per
// currency (no exchange-rate guessing). Add a code here + to the DB check to extend.
export type Currency = "USD" | "PHP" | "THB" | "VND";
export const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "USD", label: "US dollar ($)" },
  { code: "PHP", label: "Philippine peso (₱)" },
  { code: "THB", label: "Thai baht (฿)" },
  { code: "VND", label: "Vietnamese dong (₫)" },
];
export function fmtMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
export type MoneyTotals = Partial<Record<Currency, number>>;
export function addMoney(t: MoneyTotals, amount: number | null | undefined, currency: Currency | null | undefined, fallback: Currency) {
  if (amount == null || !(amount > 0)) return;
  const c = currency ?? fallback;
  t[c] = (t[c] ?? 0) + Number(amount);
}
export function fmtTotals(t: MoneyTotals): string {
  const parts = CURRENCIES.filter((c) => (t[c.code] ?? 0) > 0).map((c) => fmtMoney(t[c.code]!, c.code));
  return parts.length ? parts.join(" + ") : "—";
}
export const parseMoney = (s: string): number | null => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return s.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export type MedicalData = {
  settings: MedicalSettings;
  vaccines: Vaccine[];
  doses: DoseRecord[];
  checks: Check[];
  events: CheckEvent[];
  providers: Provider[];
};

// ---- dates ----
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1 + months, d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---- status ----
export type DueStatus = "done" | "overdue" | "due" | "soon" | "scheduled" | "unscheduled" | "info";
export const SOON_DAYS = 30;

function statusFor(due: string | null, today: string): DueStatus {
  if (!due) return "unscheduled";
  const d = daysBetween(today, due);
  if (d < 0) return "overdue";
  if (d === 0) return "due";
  if (d <= SOON_DAYS) return "soon";
  return "scheduled";
}

export type DoseRow = {
  label: string;
  record: DoseRecord | null;
  due: string | null; // earliest recommended date
  windowEnd: string | null; // latest recommended date, when the schedule has a window
  status: DueStatus;
  isBooster: boolean;
};

// Dose 1 of a vaccine you haven't started is due now. Each later dose is due
// after_days after the previous dose was actually given (it stays "Not
// scheduled" until that previous dose is logged). Repeating vaccines (flu,
// boosters) add one more "Booster" row after the series.
export function doseRows(v: Vaccine, doses: DoseRecord[], today = isoToday()): DoseRow[] {
  const given = doses.filter((d) => d.vaccine_id === v.id).sort((a, b) => a.given_on.localeCompare(b.given_on));
  const rows: DoseRow[] = [];
  let prevBase: string | null = null;
  v.doses.forEach((spec, i) => {
    const record = given.find((g) => g.dose_label === spec.label) ?? null;
    let due: string | null;
    let windowEnd: string | null = null;
    let status: DueStatus;
    if (i === 0) {
      due = null;
      status = record ? "done" : "overdue";
    } else {
      due = prevBase ? addDaysIso(prevBase, spec.after_days) : null;
      if (prevBase && spec.window_days) windowEnd = addDaysIso(prevBase, spec.window_days);
      status = record ? "done" : statusFor(due, today);
    }
    rows.push({ label: spec.label, record, due, windowEnd, status, isBooster: false });
    prevBase = record?.given_on ?? null;
  });
  if (v.repeat_days) {
    const last = given[given.length - 1];
    const seriesDone = rows.every((r) => r.record);
    if (seriesDone && last) {
      // Latest booster record (if any) moves the next one forward.
      const due = addDaysIso(last.given_on, v.repeat_days);
      rows.push({ label: "Booster", record: null, due, windowEnd: null, status: statusFor(due, today), isBooster: true });
    }
  }
  return rows;
}

export function nextDose(v: Vaccine, doses: DoseRecord[], today = isoToday()): DoseRow | null {
  return doseRows(v, doses, today).find((r) => !r.record) ?? null;
}

export type CheckRow = { last: CheckEvent | null; due: string | null; status: DueStatus };
export function checkRow(c: Check, events: CheckEvent[], today = isoToday()): CheckRow {
  const mine = events.filter((e) => e.check_id === c.id).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const last = mine[0] ?? null;
  if (c.kind === "discuss" || c.kind === "conditional") return { last, due: null, status: last ? "done" : "info" };
  if (c.kind === "once") return { last, due: null, status: last ? "done" : "overdue" };
  if (!last) return { last, due: null, status: "overdue" };
  const due = addMonthsIso(last.done_on, c.interval_months ?? 12);
  const s = statusFor(due, today);
  return { last, due, status: s === "scheduled" ? "done" : s };
}

export const STATUS_STYLE: Record<DueStatus, { label: string; color: string; bg: string }> = {
  done: { label: "Done", color: "#3ddc97", bg: "rgba(61,220,151,0.12)" },
  overdue: { label: "Due now", color: "#ff5c7a", bg: "rgba(255,92,122,0.12)" },
  due: { label: "Due today", color: "#ff5c7a", bg: "rgba(255,92,122,0.12)" },
  soon: { label: "Due soon", color: "#f5d020", bg: "rgba(245,208,32,0.12)" },
  scheduled: { label: "Scheduled", color: "#7fa9ff", bg: "rgba(79,140,255,0.12)" },
  unscheduled: { label: "Not scheduled", color: "#8a93a6", bg: "rgba(138,147,166,0.12)" },
  info: { label: "Ask your doctor", color: "#8a93a6", bg: "rgba(138,147,166,0.12)" },
};

// ---- queries ----
export async function fetchMedical(supabase: SupabaseClient, userId: string): Promise<MedicalData> {
  const [s, v, d, c, e, p] = await Promise.all([
    supabase.from("medical_settings").select("plan_start,notes,currency").eq("user_id", userId).maybeSingle(),
    supabase.from("medical_vaccines").select("*").order("sort").order("created_at"),
    supabase.from("medical_vaccine_doses").select("*").order("given_on"),
    supabase.from("medical_checks").select("*").order("sort").order("created_at"),
    supabase.from("medical_check_events").select("*").order("done_on", { ascending: false }),
    supabase.from("medical_providers").select("*").order("country").order("city").order("name"),
  ]);
  const err = [s, v, d, c, e, p].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  return {
    settings: (s.data as MedicalSettings | null) ?? { plan_start: null, notes: null, currency: "USD" },
    vaccines: (v.data ?? []) as Vaccine[],
    doses: (d.data ?? []) as DoseRecord[],
    checks: (c.data ?? []) as Check[],
    events: (e.data ?? []) as CheckEvent[],
    providers: (p.data ?? []) as Provider[],
  };
}

async function must<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<void> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
}

export const saveSettings = (sb: SupabaseClient, userId: string, s: Partial<MedicalSettings>) =>
  must(sb.from("medical_settings").upsert({ user_id: userId, ...s, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));

export const recordDose = (sb: SupabaseClient, userId: string, r: Omit<DoseRecord, "id">) =>
  must(sb.from("medical_vaccine_doses").insert({ ...r, user_id: userId }));
export const updateDose = (sb: SupabaseClient, id: string, r: Partial<DoseRecord>) => must(sb.from("medical_vaccine_doses").update(r).eq("id", id));
export const deleteDose = (sb: SupabaseClient, id: string) => must(sb.from("medical_vaccine_doses").delete().eq("id", id));

export const saveVaccine = (sb: SupabaseClient, userId: string, v: Omit<Vaccine, "id">, id?: string) =>
  must(id ? sb.from("medical_vaccines").update(v).eq("id", id) : sb.from("medical_vaccines").insert({ ...v, user_id: userId }));
export const deleteVaccine = (sb: SupabaseClient, id: string) => must(sb.from("medical_vaccines").delete().eq("id", id));

export const recordCheck = (sb: SupabaseClient, userId: string, e: Omit<CheckEvent, "id">) =>
  must(sb.from("medical_check_events").insert({ ...e, user_id: userId }));
export const deleteCheckEvent = (sb: SupabaseClient, id: string) => must(sb.from("medical_check_events").delete().eq("id", id));
export const saveCheck = (sb: SupabaseClient, userId: string, c: Omit<Check, "id">, id?: string) =>
  must(id ? sb.from("medical_checks").update(c).eq("id", id) : sb.from("medical_checks").insert({ ...c, user_id: userId }));
export const deleteCheck = (sb: SupabaseClient, id: string) => must(sb.from("medical_checks").delete().eq("id", id));

export const saveProvider = (sb: SupabaseClient, userId: string, p: Omit<Provider, "id">, id?: string) =>
  must(id ? sb.from("medical_providers").update(p).eq("id", id) : sb.from("medical_providers").insert({ ...p, user_id: userId }));
export const deleteProvider = (sb: SupabaseClient, id: string) => must(sb.from("medical_providers").delete().eq("id", id));
