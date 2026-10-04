"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { estimateTax } from "@/lib/tax/calc";
import { FILING_STATUS_LABELS, STATE_OPTIONS, TAX_YEAR, type FilingStatus } from "@/lib/tax/data2026";
import {
  buildTaxInput,
  fetchTaxOverview,
  quarterlyDueDates,
  saveTaxProfile,
  type Pair,
  type TaxOverviewData,
  type TaxProfile,
} from "@/lib/tax/overview";
import TaxDisclaimer from "@/components/tax/TaxDisclaimer";
import W2JobModal from "@/components/income/W2JobModal";
import { W2_CHANGED_EVENT } from "@/lib/w2/types";

// Taxes > Overview: automatic federal + state ESTIMATE on everything the
// member earns -- W-2 wages (from their last paystub), business & gig
// income, rentals, and short/long-term gains. Year-to-date or projected to
// year end. Manual extras + filing settings are saved in tax_profiles.

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const FIELD = "w-full rounded-md border border-card-border bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none";
const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";

type Mode = "projected" | "ytd";

const EXTRA_FIELDS: { key: keyof TaxProfile; label: string; hint?: string; negative?: boolean }[] = [
  { key: "business_expenses", label: "Business & gig expenses (this year)", hint: "Mileage, supplies, software, fees…" },
  { key: "stock_short_term", label: "Stock/crypto short-term gains", hint: "Sold within 1 year · taxable accounts", negative: true },
  { key: "stock_long_term", label: "Stock/crypto long-term gains", hint: "Held over 1 year · taxable accounts", negative: true },
  { key: "qualified_dividends", label: "Qualified dividends" },
  { key: "interest_income", label: "Interest & ordinary dividends" },
  { key: "other_income", label: "Other income", negative: true },
  { key: "extra_pretax", label: "IRA / HSA contributions (not on paystub)" },
  { key: "itemized", label: "Itemized deductions", hint: "Leave 0 for the standard deduction" },
  { key: "estimates_paid", label: "Federal estimated payments made" },
];

export default function TaxesOverviewPage() {
  const [data, setData] = useState<TaxOverviewData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaxProfile | null>(null);
  const [mode, setMode] = useState<Mode>("projected");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [w2Open, setW2Open] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const d = await fetchTaxOverview(supabase, user.id, TAX_YEAR);
      if (cancelled) return;
      setUserId(user.id);
      setData(d);
      setDraft(d.profile);
    }
    load();
    const onW2 = () => setReload((r) => r + 1);
    window.addEventListener(W2_CHANGED_EVENT, onW2);
    return () => {
      cancelled = true;
      window.removeEventListener(W2_CHANGED_EVENT, onW2);
    };
  }, [reload]);

  // Estimate uses the draft so results update live while editing.
  const view = useMemo(() => (data && draft ? { ...data, profile: draft } : null), [data, draft]);
  const input = useMemo(() => (view ? buildTaxInput(view, mode) : null), [view, mode]);
  const r = useMemo(() => (input ? estimateTax(input) : null), [input]);

  async function saveProfile() {
    if (!userId || !draft || saving) return;
    setSaving(true);
    const { error } = await saveTaxProfile(createClient(), userId, draft);
    setSaving(false);
    setSaved(error ? "Could not save. Please try again." : "Saved.");
    if (!error) setData((d) => (d ? { ...d, profile: draft } : d));
    setTimeout(() => setSaved(null), 2500);
  }

  const dirty = !!data && !!draft && JSON.stringify(data.profile) !== JSON.stringify(draft);
  const set = (patch: Partial<TaxProfile>) => setDraft((p) => (p ? { ...p, ...patch } : p));

  if (!view || !r || !input || !draft) {
    return (
      <>
        <h1 className="mb-4 text-[21px] font-semibold text-text-primary">Taxes · {TAX_YEAR}</h1>
        <div className={`${CARD} text-sm text-text-muted`}>Loading…</div>
      </>
    );
  }

  const missingStub = view.w2.some((w) => !w.hasPaystub);
  const noIncome = input.wages === 0 && input.selfEmployment === 0 && input.shortTermGains === 0 && input.longTermGains === 0 && input.otherIncome === 0;

  // Quarterly estimate: what's still uncovered by withholding + payments, spread over remaining due dates.
  const today = new Date();
  const remainingDue = quarterlyDueDates(TAX_YEAR).filter((d) => d >= today);
  const projected = mode === "projected" ? r : estimateTax(buildTaxInput(view, "projected"));
  const uncovered = Math.max(0, projected.federalTotal - projected.paid);
  const perQuarter = remainingDue.length ? uncovered / remainingDue.length : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Taxes · {TAX_YEAR}</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs">
            {(
              [
                ["projected", "Projected full year"],
                ["ytd", "Year to date"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`rounded-full px-3 py-1 font-semibold ${mode === k ? "bg-[#4f8cff] text-white" : "text-text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link href="/taxes/calculator" className="text-xs font-semibold text-[#4f8cff] hover:underline">
            What-if calculator →
          </Link>
        </div>
      </div>

      <TaxDisclaimer />

      {/* Settings */}
      <div className={`${CARD} mt-6`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-xs text-text-muted">
            Filing status
            <select value={draft.filing_status} onChange={(e) => set({ filing_status: e.target.value as FilingStatus })} className={`${FIELD} mt-1`}>
              {(Object.keys(FILING_STATUS_LABELS) as FilingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {FILING_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            State you live in
            <select value={draft.state} onChange={(e) => set({ state: e.target.value })} className={`${FIELD} mt-1`}>
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
              max={20}
              value={draft.children || ""}
              placeholder="0"
              onChange={(e) => set({ children: Math.min(20, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
              className={`${FIELD} mt-1`}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={saveProfile}
              className="rounded-lg bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="pb-2 text-xs text-text-muted">{saved}</span>}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Income sources */}
        <div className="flex flex-col gap-6">
          <div className={CARD}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">Your income this year</h3>
              <span className="text-[11px] text-text-muted">
                {view.monthsElapsed} of 12 months · projections annualize year-to-date
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3 text-right">Year to date</th>
                    <th className="py-2 text-right">Projected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <Group label="W-2 wages" />
                  {view.w2.length === 0 && <Empty text="No W-2 jobs yet." action={{ label: "Add W-2 job", onClick: () => setW2Open(true) }} />}
                  {view.w2.map((w) => (
                    <SourceRow
                      key={w.id}
                      label={w.employer}
                      sub={w.hasPaystub ? `Last paystub ${w.paystubDate} · fed withheld ${usd(w.federal[mode])}` : "No paystub yet: using salary, no withholding counted"}
                      warn={!w.hasPaystub}
                      pair={w.gross}
                      mode={mode}
                    />
                  ))}

                  <Group label="Business & gig income" />
                  {view.businesses.length === 0 && <Empty text="No paid business income recorded this year." />}
                  {view.businesses.map((b) => (
                    <SourceRow key={b.id} label={b.name} sub={b.category} pair={b.income} mode={mode} />
                  ))}
                  {draft.business_expenses > 0 && (
                    <SourceRow label="Business expenses" sub="Entered below" pair={{ ytd: -draft.business_expenses, projected: -draft.business_expenses }} mode={mode} />
                  )}

                  {(view.rentalNet.ytd !== 0 || view.options.ytd !== 0 || draft.stock_short_term || draft.stock_long_term) && <Group label="Investments & rentals" />}
                  {view.options.ytd !== 0 && <SourceRow label="Options (brokerage)" sub="Short-term · realized" pair={view.options} mode={mode} />}
                  {!!draft.stock_short_term && <SourceRow label="Stock/crypto short-term" sub="Entered below" pair={{ ytd: draft.stock_short_term, projected: draft.stock_short_term }} mode={mode} />}
                  {!!draft.stock_long_term && <SourceRow label="Stock/crypto long-term" sub="Entered below" pair={{ ytd: draft.stock_long_term, projected: draft.stock_long_term }} mode={mode} />}
                  {view.rentalNet.ytd !== 0 && <SourceRow label="Rental net income" sub="Rent received minus expenses" pair={view.rentalNet} mode={mode} />}
                </tbody>
              </table>
            </div>
            {missingStub && (
              <p className="mt-3 rounded-lg bg-[#f5d020]/10 p-2.5 text-xs text-[#f5d020]">
                Add your last paystub to each W-2 job (Income → W-2 Jobs → edit) so withholding is counted and wages project accurately.
              </p>
            )}
          </div>

          <div className={CARD}>
            <button type="button" onClick={() => setShowExtras((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-semibold text-text-primary">Other income, gains & deductions</span>
              <span className="text-xs text-text-muted">{showExtras ? "Hide" : "Add / edit"}</span>
            </button>
            <p className="mt-1 text-xs text-text-muted">For things the app doesn&apos;t track yet. Enter your best full-year estimate.</p>
            {showExtras && (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {EXTRA_FIELDS.map((f) => (
                    <label key={f.key} className="text-xs text-text-muted">
                      {f.label}
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>
                        <input
                          type="number"
                          step="100"
                          min={f.negative ? undefined : 0}
                          value={(draft[f.key] as number) || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            set({ [f.key]: f.negative ? v : Math.max(0, v) } as Partial<TaxProfile>);
                          }}
                          className={`${FIELD} pl-6`}
                        />
                      </div>
                      {f.hint && <span className="mt-0.5 block text-[11px] text-text-muted/80">{f.hint}</span>}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={saveProfile}
                  className="mt-4 rounded-lg bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-4">
          <div className={CARD}>
            <div className="text-xs text-text-muted">
              Estimated total tax · {mode === "projected" ? `full year ${TAX_YEAR}` : "year to date"}
            </div>
            <div className="mt-1 text-3xl font-bold text-text-primary">{usd(r.totalTax)}</div>
            <div className="mt-1 text-xs text-text-muted">
              On {usd(r.totalIncome)} income · Effective <b className="text-text-primary">{pct(r.effectiveRate)}</b> · Federal bracket{" "}
              <b className="text-text-primary">{pct(r.federalMarginal)}</b>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Tile label="Federal" value={usd(r.federalTotal)} sub={`Withheld + paid ${usd(r.paid)}`} />
              <Tile label="State" value={usd(r.stateTax)} sub={`Withheld ${usd(input.stateWithheld ?? 0)}`} />
            </div>
            {!noIncome && (
              <div className="mt-3 flex flex-col gap-2">
                <DueLine label="Federal" amount={r.balanceDue} />
                {r.stateTax > 0 || (input.stateWithheld ?? 0) > 0 ? <DueLine label="State" amount={r.stateBalanceDue} /> : null}
              </div>
            )}
          </div>

          {uncovered > 500 && remainingDue.length > 0 && (
            <div className={`${CARD} text-sm`}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Quarterly estimates</div>
              <p className="text-text-primary">
                About <b>{usd(perQuarter)}</b> per payment for the {remainingDue.length} remaining federal due date{remainingDue.length === 1 ? "" : "s"}.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Next due {remainingDue[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Side gig and gains income
                usually has no withholding, so estimates help avoid an underpayment penalty.
              </p>
            </div>
          )}

          <div className={`${CARD} text-sm`}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Breakdown</div>
            <Row label="Total income" value={usd(r.totalIncome)} />
            <Row label="Adjusted gross income (AGI)" value={usd(r.agi)} />
            <Row label={r.usedItemized ? "Itemized deductions" : "Standard deduction"} value={`−${usd(r.deduction)}`} />
            <Row label="Federal taxable income" value={usd(r.taxableIncome)} strong />
            <div className="my-2 border-t border-white/10" />
            <Row label="Income tax (ordinary)" value={usd(r.ordinaryTax)} />
            <Row label="Capital gains & qualified dividends" value={usd(r.capitalGainsTax)} />
            {r.childCredit > 0 && <Row label="Child tax credit" value={`−${usd(r.childCredit)}`} />}
            {r.selfEmploymentTax > 0 && <Row label="Self-employment tax" value={usd(r.selfEmploymentTax)} />}
            {r.niit > 0 && <Row label="Net investment income tax" value={usd(r.niit)} />}
            {r.additionalMedicare > 0 && <Row label="Additional Medicare" value={usd(r.additionalMedicare)} />}
            <Row label="Federal total" value={usd(r.federalTotal)} strong />
            <div className="my-2 border-t border-white/10" />
            <Row label="State tax" value={usd(r.stateTax)} strong />
            {r.stateNote && <p className="mt-2 text-[11px] text-text-muted">{r.stateNote}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <TaxDisclaimer compact />
      </div>

      {w2Open && <W2JobModal onClose={() => setW2Open(false)} />}
    </>
  );
}

function Group({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={3} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </td>
    </tr>
  );
}

function Empty({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <tr>
      <td colSpan={3} className="py-2 text-xs text-text-muted">
        {text}{" "}
        {action && (
          <button type="button" onClick={action.onClick} className="font-semibold text-[#4f8cff] hover:underline">
            {action.label}
          </button>
        )}
      </td>
    </tr>
  );
}

function SourceRow({ label, sub, pair, mode, warn }: { label: string; sub?: string; pair: Pair; mode: "ytd" | "projected"; warn?: boolean }) {
  return (
    <tr>
      <td className="py-2 pr-3">
        <div className="text-text-primary">{label}</div>
        {sub && <div className={`text-[11px] ${warn ? "text-[#f5d020]" : "text-text-muted"}`}>{sub}</div>}
      </td>
      <td className={`py-2 pr-3 text-right ${mode === "ytd" ? "font-semibold text-text-primary" : "text-text-muted"}`}>{usd(pair.ytd)}</td>
      <td className={`py-2 text-right ${mode === "projected" ? "font-semibold text-text-primary" : "text-text-muted"}`}>{usd(pair.projected)}</td>
    </tr>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function DueLine({ label, amount }: { label: string; amount: number }) {
  const refund = amount < 0;
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${refund ? "bg-[#3ddc97]/10 text-[#3ddc97]" : "bg-[#ff5c7a]/10 text-[#ff8aa0]"}`}>
      {label} {refund ? "refund" : "still owed"}: <b>{usd(Math.abs(amount))}</b>
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
