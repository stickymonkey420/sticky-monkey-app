import type { SupabaseClient } from "@supabase/supabase-js";

// "Where to park your cash": a short list of bank / Treasury offers the App
// Director curates (public.cash_offers) and re-verifies weekly. Members only
// see active offers (RLS). A weekly cron (public.cash_rate_scan, Mondays)
// notifies members whose cash accounts earn well below the best offer.

export const OFFER_KINDS = ["savings", "money_market", "cd", "checking", "treasury"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export const KIND_LABEL: Record<OfferKind, string> = {
  savings: "High-yield savings",
  money_market: "Money market",
  cd: "CD",
  checking: "Checking",
  treasury: "Treasury",
};
export const INSURERS = ["FDIC", "NCUA", "Treasury", "SIPC", "None"] as const;

export type CashOffer = {
  id: string;
  bank: string;
  product: string;
  kind: OfferKind;
  apy: number | string | null;
  term_months: number | null;
  min_deposit: number | string;
  insured: (typeof INSURERS)[number];
  url: string | null;
  notes: string | null;
  active: boolean;
  verified_at: string | null;
  updated_at: string;
};

const COLS = "id,bank,product,kind,apy,term_months,min_deposit,insured,url,notes,active,verified_at,updated_at";

export async function fetchCashOffers(supabase: SupabaseClient): Promise<CashOffer[]> {
  const { data, error } = await supabase.from("cash_offers").select(COLS).order("apy", { ascending: false, nullsFirst: false });
  return error ? [] : ((data as CashOffer[]) || []);
}

// Liquid = money you can pull any time (no CD lock-up).
export const isLiquid = (o: CashOffer) => o.kind !== "cd";

export const STALE_DAYS = 7;
export function isStale(o: CashOffer, now = Date.now()): boolean {
  return !o.verified_at || now - new Date(o.verified_at).getTime() > STALE_DAYS * 86400000;
}

export function fmtApy(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

export function yearlyInterest(balance: number, apy: number): number {
  return Math.max(0, (balance * apy) / 100);
}
