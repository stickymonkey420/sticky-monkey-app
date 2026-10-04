"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_INPUT, estimateTax, type TaxInput } from "@/lib/tax/calc";
import { FILING_STATUS_LABELS, STATE_OPTIONS, TAX_YEAR, type FilingStatus } from "@/lib/tax/data2026";
import { fetchTaxPrefill, type Prefill } from "@/lib/tax/prefill";
import TaxDisclaimer from "@/components/tax/TaxDisclaimer";

// Taxes > Calculator: what-if federal + state ESTIMATE from hand-entered numbers. Inputs are kept
// in this browser only (localStorage) -- nothing about a member's taxes is
// stored on the server. Figures: lib/tax/data2026.ts.

const STORAGE_KEY = "sm_tax_estimator_v1";
const FIELD = "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";
const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const MONEY_FIELDS: { key: keyof TaxInput; label: string; hint?: string; allowNegative?: boolean; group: "income" | "adjust" | "paid" }[] = [
  { key: "wages", label: "W-2 wages (gross)", group: "income" },
  { key: "selfEmployment", label: "Side gig / business profit", hint: "After business expenses", group: "income", allowNegative: true },
  { key: "shortTermGains", label: "Short-term gains (incl. options)", hint: "Held 1 year or less · taxable accounts only", group: "income", allowNegative: true },
  { key: "longTermGains", label: "Long-term capital gains", hint: "Held over 1 year", group: "income", allowNegative: true },
  { key: "qualifiedDividends", label: "Qualified dividends", group: "income" },
  { key: "interestOrdinaryDividends", label: "Interest & ordinary dividends", group: "income" },
  { key: "otherIncome", label: "Other income", group: "income", allowNegative: true },
  { key: "preTaxContributions", label: "Pre-tax contributions", hint: "401(k), traditional IRA, HSA", group: "adjust" },
  { key: "itemized", label: "Itemized deductions", hint: "Leave 0 to use the standard deduction", group: "adjust" },
  { key: "withheld", label: "Federal tax withheld so far", group: "paid" },
  { key: "estimatesPaid", label: "Federal estimated payments made", group: "paid" },
];

export default function TaxesPage() {
  const [input, setInput] = useState<TaxInput>(EMPTY_INPUT);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillMsg, setPrefillMsg] = useState<string | null>(null);

  useEffect(() => {
    // Restore saved entries (async wrapper = this repo's load-on-mount idiom).
    async function load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) setInput({ ...EMPTY_INPUT, ...(JSON.parse(raw) as Partial<TaxInput>) });
      } catch {
        // storage unavailable -- start blank
      }
    }
    load();
  }, []);

  function update(patch: Partial<TaxInput>) {
    setInput((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function loadPrefill() {
    setPrefillBusy(true);
    setPrefillMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPrefillBusy(false);
      return;
    }
    const p = await fetchTaxPrefill(supabase, user.id, TAX_YEAR);
    setPrefill(p);
    setPrefillBusy(false);
    if (!p.wages && !p.optionsYtd) setPrefillMsg("No W-2 jobs or brokerage options activity found for this year yet.");
  }

  function applyPrefill(projected: boolean) {
    if (!prefill) return;
    update({ wages: prefill.wages, shortTermGains: projected ? prefill.optionsProjected : prefill.optionsYtd });
    setPrefillMsg(projected ? "Filled with projected full-year figures." : "Filled with year-to-date figures.");
  }

  const r = useMemo(() => estimateTax(input), [input]);
  const refund = r.balanceDue < 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Tax calculator · {TAX_YEAR}</h1>
        <button
          type="button"
          onClick={() => {
            update(EMPTY_INPUT);
            setPrefillMsg(null);
          }}
          className="text-xs text-text-muted hover:text-text-primary"
        >
          Reset
        </button>
      </div>

      <TaxDisclaimer />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-card-border bg-card-bg p-5">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-text-muted">
                Filing status
                <select value={input.status} onChange={(e) => update({ status: e.target.value as FilingStatus })} className={`${FIELD} mt-1`}>
                  {(Object.keys(FILING_STATUS_LABELS) as FilingStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {FILING_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted">
                State
                <select value={input.state} onChange={(e) => update({ state: e.target.value })} className={`${FIELD} mt-1`}>
                  {STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted">
                Children under 17
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={input.children || ""}
                  onChange={(e) => update({ children: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className={`${FIELD} mt-1`}
                />
              </label>
            </div>

            <div className="mb-5 rounded-xl bg-[#4f8cff]/10 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-primary">Pull W-2 salary and this year&apos;s options P/L from taxable accounts (IRAs excluded).</span>
                <button
                  type="button"
                  disabled={prefillBusy}
                  onClick={loadPrefill}
                  className="rounded-lg bg-[#4f8cff] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                >
                  {prefillBusy ? "Loading…" : "Fill from my data"}
                </button>
              </div>
              {prefill && (prefill.wages > 0 || prefill.optionsYtd !== 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-text-muted">
                  <span>
                    W-2 {usd(prefill.wages)} · Options YTD {usd(prefill.optionsYtd)} ({prefill.monthsElapsed} mo) · Projected {usd(prefill.optionsProjected)}
                  </span>
                  <button type="button" onClick={() => applyPrefill(false)} className="rounded-md bg-white/10 px-2 py-1 text-text-primary">
                    Use YTD
                  </button>
                  <button type="button" onClick={() => applyPrefill(true)} className="rounded-md bg-white/10 px-2 py-1 text-text-primary">
                    Use projected
                  </button>
                </div>
              )}
              {prefillMsg && <div className="mt-1.5 text-text-muted">{prefillMsg}</div>}
            </div>

            {(
              [
                ["income", "Income (projected for the year)"],
                ["adjust", "Adjustments & deductions"],
                ["paid", "Already paid"],
              ] as const
            ).map(([group, title]) => (
              <div key={group} className="mb-5 last:mb-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {MONEY_FIELDS.filter((f) => f.group === group).map((f) => (
                    <label key={f.key} className="text-xs text-text-muted">
                      {f.label}
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>
                        <input
                          type="number"
                          step="100"
                          min={f.allowNegative ? undefined : 0}
                          value={(input[f.key] as number) || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            update({ [f.key]: f.allowNegative ? v : Math.max(0, v) } as Partial<TaxInput>);
                          }}
                          className={`${FIELD} pl-6`}
                        />
                      </div>
                      {f.hint && <span className="mt-0.5 block text-[11px] text-text-muted/80">{f.hint}</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-card-border bg-card-bg p-5">
            <div className="text-xs text-text-muted">Estimated total tax · {TAX_YEAR}</div>
            <div className="mt-1 text-3xl font-bold text-text-primary">{usd(r.totalTax)}</div>
            <div className="mt-1 text-xs text-text-muted">
              Effective rate <b className="text-text-primary">{pct(r.effectiveRate)}</b> · Federal bracket{" "}
              <b className="text-text-primary">{pct(r.federalMarginal)}</b>
              {r.stateMarginal > 0 && (
                <>
                  {" "}
                  · State bracket <b className="text-text-primary">{pct(r.stateMarginal)}</b>
                </>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Tile label="Federal" value={usd(r.federalTotal)} />
              <Tile label="State" value={usd(r.stateTax)} />
            </div>
            {r.paid > 0 && (
              <div className={`mt-3 rounded-xl p-3 text-sm ${refund ? "bg-[#3ddc97]/10 text-[#3ddc97]" : "bg-[#ff5c7a]/10 text-[#ff8aa0]"}`}>
                {refund ? "Projected federal refund" : "Projected federal balance due"}: <b>{usd(Math.abs(r.balanceDue))}</b>
              </div>
            )}
            {r.federalTotal - r.paid > 1000 && (
              <p className="mt-3 text-[11px] text-text-muted">
                Owing $1,000+ at filing can trigger an IRS underpayment penalty. Quarterly estimates may apply, so ask a CPA.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Breakdown</div>
            <Row label="Total income" value={usd(r.totalIncome)} />
            <Row label="Adjusted gross income (AGI)" value={usd(r.agi)} />
            <Row label={r.usedItemized ? "Itemized deductions" : "Standard deduction"} value={`−${usd(r.deduction)}`} />
            <Row label="Federal taxable income" value={usd(r.taxableIncome)} strong />
            <div className="my-2 border-t border-white/10" />
            <Row label="Income tax (ordinary rates)" value={usd(r.ordinaryTax)} />
            <Row label="Capital gains & qualified dividends" value={usd(r.capitalGainsTax)} />
            {r.childCredit > 0 && <Row label="Child tax credit" value={`−${usd(r.childCredit)}`} />}
            {r.selfEmploymentTax > 0 && <Row label="Self-employment tax" value={usd(r.selfEmploymentTax)} />}
            {r.niit > 0 && <Row label="Net investment income tax (3.8%)" value={usd(r.niit)} />}
            {r.additionalMedicare > 0 && <Row label="Additional Medicare (0.9%)" value={usd(r.additionalMedicare)} />}
            <Row label="Federal total" value={usd(r.federalTotal)} strong />
            <div className="my-2 border-t border-white/10" />
            <Row label="State taxable income" value={usd(r.stateTaxable)} />
            <Row label="State tax" value={usd(r.stateTax)} strong />
            {r.stateNote && <p className="mt-2 text-[11px] text-text-muted">{r.stateNote}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <TaxDisclaimer compact />
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={strong ? "font-semibold text-text-primary" : "text-text-muted"}>{label}</span>
      <span className={strong ? "font-semibold text-text-primary" : "text-text-primary"}>{value}</span>
    </div>
  );
}
