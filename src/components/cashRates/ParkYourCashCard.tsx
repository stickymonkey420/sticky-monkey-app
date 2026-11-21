"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCashOffers, fmtApy, isLiquid, KIND_LABEL, yearlyInterest, type CashOffer } from "@/lib/cashRates";
import type { ManualAccount } from "@/lib/accounts/types";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// "Where to park your cash" (Bank Accounts page). Shows the App Director's
// verified offers, and for each of the member's cash accounts how much more
// a year the best no-lock-up offer would pay. Hidden when there are no live
// offers yet. No affiliate links: each button goes to the bank's own page.
export default function ParkYourCashCard({ accounts, onAddRate }: { accounts: ManualAccount[]; onAddRate?: (a: ManualAccount) => void }) {
  const [offers, setOffers] = useState<CashOffer[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCashOffers(createClient()).then((rows) => {
      if (!cancelled) setOffers(rows.filter((o) => o.active && o.apy != null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const liquid = useMemo(() => (offers ?? []).filter(isLiquid).sort((a, b) => Number(b.apy) - Number(a.apy)), [offers]);
  const cds = useMemo(() => (offers ?? []).filter((o) => !isLiquid(o)).sort((a, b) => Number(b.apy) - Number(a.apy)).slice(0, 3), [offers]);
  const best = liquid[0];
  const cash = accounts.filter((a) => (a.category === "bank_account" || a.category === "business_account") && Number(a.balance) > 0);
  const checked = (offers ?? []).map((o) => o.verified_at).filter(Boolean).sort().pop();

  if (!offers || offers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Where to park your cash</h3>
        {checked && <span className="text-xs text-text-muted">Rates checked {new Date(checked).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
      </div>
      <p className="mb-4 text-xs text-text-muted">Top rates we track, checked weekly. You open the account yourself on the bank&apos;s site; we never move your money.</p>

      {best && cash.length > 0 && (
        <div className="mb-5 rounded-xl bg-white/5 p-3">
          <div className="mb-2 text-xs font-semibold text-text-primary">Your cash vs. {best.bank} at {fmtApy(best.apy)}</div>
          <div className="flex flex-col gap-1.5">
            {cash.map((a) => {
              const bal = Number(a.balance) || 0;
              const rate = a.interest_rate == null || a.interest_rate === "" ? null : Number(a.interest_rate);
              const gain = rate == null ? null : yearlyInterest(bal, Number(best.apy) - rate);
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="min-w-0 truncate text-text-primary">
                    {a.account_name || a.institution_name} <span className="text-text-muted">· {money(bal)}</span>
                  </span>
                  {rate == null ? (
                    onAddRate ? (
                      <button type="button" onClick={() => onAddRate(a)} className="text-xs text-[#4f8cff] hover:underline">
                        Add its rate to compare
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">rate not set</span>
                    )
                  ) : gain && gain >= 1 ? (
                    <span className="text-xs">
                      <span className="text-text-muted">earns {fmtApy(rate)} · </span>
                      <span className="font-semibold text-[#3ddc97]">+{money(gain)}/yr</span>
                    </span>
                  ) : (
                    <span className="text-xs text-[#3ddc97]">{fmtApy(rate)} · already competitive</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <OfferList title="No lock-up" offers={liquid.slice(0, 6)} />
      {cds.length > 0 && <OfferList title="CDs (money locked for the term)" offers={cds} />}

      <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
        Rates change often; confirm the APY and terms on the bank&apos;s site before opening. Keep balances within FDIC/NCUA limits ($250K per depositor, per
        bank). Not financial advice. Sticky Monkey isn&apos;t paid for these listings.
      </p>
    </div>
  );
}

function OfferList({ title, offers }: { title: string; offers: CashOffer[] }) {
  if (!offers.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
      <div className="flex flex-col divide-y divide-white/10">
        {offers.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
            <div className="w-16 text-lg font-semibold text-[#3ddc97]">{fmtApy(o.apy)}</div>
            <div className="min-w-[160px] flex-1">
              <div className="font-medium text-text-primary">
                {o.bank} <span className="font-normal text-text-muted">· {o.product || KIND_LABEL[o.kind]}</span>
              </div>
              <div className="text-xs text-text-muted">
                {KIND_LABEL[o.kind]}
                {o.kind === "cd" && o.term_months ? ` · ${o.term_months} months` : ""} · {o.insured === "None" ? "not insured" : `${o.insured} insured`}
                {Number(o.min_deposit) > 0 ? ` · min $${Number(o.min_deposit).toLocaleString()}` : " · no minimum"}
                {o.notes ? ` · ${o.notes}` : ""}
              </div>
            </div>
            {o.url && (
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-white/15">
                Open account
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
