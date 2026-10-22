// Travel (App Director only for now): trips, trip budgets in any currency,
// travel documents with expiry reminders, and the care-abroad comparison
// (U.S. price vs. clinic quote + travel costs). Exchange rates come from the
// fx_rates table (fx-rates edge function, daily, free source).
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween, isoToday, type Currency } from "@/lib/medical/model";

export const PURPOSES = [
  { value: "medical", label: "Medical / dental" },
  { value: "vacation", label: "Vacation" },
  { value: "work", label: "Work" },
  { value: "relocation", label: "Relocation / long stay" },
  { value: "other", label: "Other" },
] as const;
export type Purpose = (typeof PURPOSES)[number]["value"];

export const COST_CATEGORIES = [
  { value: "medical", label: "Medical / clinic quote" },
  { value: "flights", label: "Flights" },
  { value: "lodging", label: "Lodging" },
  { value: "food", label: "Food" },
  { value: "transport", label: "Local transport" },
  { value: "insurance", label: "Travel insurance" },
  { value: "activities", label: "Activities" },
  { value: "other", label: "Other" },
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number]["value"];

export const DOC_KINDS = [
  { value: "passport", label: "Passport" },
  { value: "visa", label: "Visa / extension" },
  { value: "insurance", label: "Travel insurance" },
  { value: "license", label: "Driver's license / IDP" },
  { value: "vaccine_card", label: "Vaccine card" },
  { value: "other", label: "Other" },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["value"];

export type Trip = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  purpose: Purpose;
  currency: Currency;
  us_price: number | null;
  us_price_label: string | null;
  notes: string | null;
};
export type TripCost = { id: string; trip_id: string; category: CostCategory; label: string | null; amount: number; currency: Currency };
export type TravelDoc = { id: string; kind: DocKind; label: string; country: string | null; expires_on: string | null; remind_days: number; notes: string | null };
export type Rates = { perUsd: Record<string, number>; updatedAt: string | null };
export type TravelData = { trips: Trip[]; costs: TripCost[]; docs: TravelDoc[]; rates: Rates };

export async function fetchTravel(sb: SupabaseClient): Promise<TravelData> {
  const [t, c, d, r] = await Promise.all([
    sb.from("travel_trips").select("*").order("start_date", { ascending: true, nullsFirst: false }).order("created_at"),
    sb.from("travel_costs").select("*").order("created_at"),
    sb.from("travel_documents").select("*").order("expires_on", { ascending: true, nullsFirst: false }),
    sb.from("fx_rates").select("code,per_usd,updated_at").in("code", ["USD", "PHP", "THB", "VND", "MXN"]),
  ]);
  const err = [t, c, d].find((x) => x.error)?.error;
  if (err) throw new Error(err.message);
  const perUsd: Record<string, number> = { USD: 1 };
  let updatedAt: string | null = null;
  for (const row of (r.data ?? []) as { code: string; per_usd: number; updated_at: string }[]) {
    perUsd[row.code] = Number(row.per_usd);
    updatedAt = row.updated_at;
  }
  return {
    trips: (t.data ?? []) as Trip[],
    costs: ((c.data ?? []) as TripCost[]).map((x) => ({ ...x, amount: Number(x.amount) })),
    docs: (d.data ?? []) as TravelDoc[],
    rates: { perUsd, updatedAt },
  };
}

// ---- money across currencies ----
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number | null {
  const f = rates.perUsd[from];
  const t = rates.perUsd[to];
  if (!f || !t) return null;
  return (amount / f) * t;
}

export type TripTotals = { byCategory: Partial<Record<CostCategory, number>>; total: number; medical: number; travel: number; missingRate: boolean };
// All of a trip's costs in one currency (default: the trip's own).
export function tripTotals(trip: Trip, costs: TripCost[], rates: Rates, into: Currency = trip.currency): TripTotals {
  const out: TripTotals = { byCategory: {}, total: 0, medical: 0, travel: 0, missingRate: false };
  for (const c of costs.filter((x) => x.trip_id === trip.id)) {
    const v = convert(c.amount, c.currency, into, rates);
    if (v == null) {
      out.missingRate = true;
      continue;
    }
    out.byCategory[c.category] = (out.byCategory[c.category] ?? 0) + v;
    out.total += v;
    if (c.category === "medical") out.medical += v;
    else out.travel += v;
  }
  return out;
}

// Care abroad vs. the U.S. price, both in USD.
export type Comparison = { usPrice: number; abroad: number; medical: number; travel: number; savings: number; pct: number };
export function compareCare(trip: Trip, costs: TripCost[], rates: Rates): Comparison | null {
  if (trip.us_price == null || !(Number(trip.us_price) > 0)) return null;
  const t = tripTotals(trip, costs, rates, "USD");
  const usPrice = Number(trip.us_price);
  const savings = usPrice - t.total;
  return { usPrice, abroad: t.total, medical: t.medical, travel: t.travel, savings, pct: (savings / usPrice) * 100 };
}

// ---- dates ----
export const nights = (a: string | null, b: string | null) => (a && b ? Math.max(0, daysBetween(a, b)) : null);
export type TripStatus = "upcoming" | "now" | "past" | "undated";
export function tripStatus(t: Trip, today = isoToday()): TripStatus {
  if (!t.start_date) return "undated";
  if (t.end_date && t.end_date < today) return "past";
  if (t.start_date > today) return "upcoming";
  return "now";
}
export type DocStatus = "expired" | "renew" | "ok" | "none";
export function docStatus(d: TravelDoc, today = isoToday()): { status: DocStatus; days: number | null } {
  if (!d.expires_on) return { status: "none", days: null };
  const days = daysBetween(today, d.expires_on);
  if (days < 0) return { status: "expired", days };
  if (days <= d.remind_days) return { status: "renew", days };
  return { status: "ok", days };
}

// ---- writes ----
async function must<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<void> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
}
export const saveTrip = (sb: SupabaseClient, userId: string, t: Omit<Trip, "id">, id?: string) =>
  must(id ? sb.from("travel_trips").update(t).eq("id", id) : sb.from("travel_trips").insert({ ...t, user_id: userId }));
export const deleteTrip = (sb: SupabaseClient, id: string) => must(sb.from("travel_trips").delete().eq("id", id));
export const saveCost = (sb: SupabaseClient, userId: string, c: Omit<TripCost, "id">, id?: string) =>
  must(id ? sb.from("travel_costs").update(c).eq("id", id) : sb.from("travel_costs").insert({ ...c, user_id: userId }));
export const deleteCost = (sb: SupabaseClient, id: string) => must(sb.from("travel_costs").delete().eq("id", id));
export const saveDoc = (sb: SupabaseClient, userId: string, d: Omit<TravelDoc, "id">, id?: string) =>
  must(id ? sb.from("travel_documents").update(d).eq("id", id) : sb.from("travel_documents").insert({ ...d, user_id: userId }));
export const deleteDoc = (sb: SupabaseClient, id: string) => must(sb.from("travel_documents").delete().eq("id", id));
