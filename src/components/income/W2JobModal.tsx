"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveW2Job, w2Figures } from "@/lib/w2/queries";
import { PAYSTUB_LINES, PAY_FREQUENCIES, PAY_FREQUENCY_LABELS, type PayFrequency, type PaystubFields, type PaystubLineKey, type W2Job } from "@/lib/w2/types";

// Add / edit a W-2 job. Opened from the Income page's W-2 Jobs card and from
// Quick Access ("Add W-2 Job"). Basic fields only: employer, job title,
// annual salary, pay frequency, take-home per check (+ optional start date),
// plus the member's LAST PAYSTUB (this period + year-to-date), which the
// Taxes page uses to project wages and withholding to year end.
// Shows the per-check gross and yearly/monthly take-home live as you type.

const inputClass =
  "w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none focus:border-[#f5d020]/60";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function W2JobModal({ job, onClose }: { job?: W2Job | null; onClose: () => void }) {
  const [employer, setEmployer] = useState(job?.employer ?? "");
  const [title, setTitle] = useState(job?.job_title ?? "");
  const [salary, setSalary] = useState(job ? String(Number(job.annual_salary)) : "");
  const [freq, setFreq] = useState<PayFrequency>(job?.pay_frequency ?? "biweekly");
  const [net, setNet] = useState(job?.net_per_check != null ? String(Number(job.net_per_check)) : "");
  const [start, setStart] = useState(job?.start_date ?? "");
  const [active, setActive] = useState(job?.is_active ?? true);
  const [stubDate, setStubDate] = useState(job?.paystub_date ?? "");
  const [stub, setStub] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of PAYSTUB_LINES) {
      const cur = job?.[`paystub_${l.key}` as keyof PaystubFields];
      const ytd = job?.[`ytd_${l.key}` as keyof PaystubFields];
      init[`paystub_${l.key}`] = cur == null ? "" : String(Number(cur));
      init[`ytd_${l.key}`] = ytd == null ? "" : String(Number(ytd));
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const salaryNum = Number(salary);
  const netNum = net.trim() === "" ? null : Number(net);
  const valid =
    employer.trim().length > 0 &&
    salary.trim() !== "" &&
    Number.isFinite(salaryNum) &&
    salaryNum >= 0 &&
    (netNum == null || (Number.isFinite(netNum) && netNum >= 0));
  const stubNum = (k: string) => (stub[k]?.trim() ? Number(stub[k]) : null);
  const stubValid = Object.values(stub).every((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0));
  const stubStarted = !!stubDate || Object.values(stub).some((v) => v.trim() !== "");
  const fig = valid ? w2Figures({ annual_salary: salaryNum, pay_frequency: freq, net_per_check: netNum }) : null;

  async function submit() {
    if (!valid || saving) return;
    if (!stubValid) {
      setError("Paystub amounts must be zero or more.");
      return;
    }
    if (stubStarted && (!stubDate || stubNum("paystub_gross") == null || stubNum("ytd_gross") == null)) {
      setError("For the paystub, enter at least the pay date, gross pay this period, and YTD gross.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("Please sign in again.");
      return;
    }
    const { error: err } = await saveW2Job(
      supabase,
      user.id,
      {
        employer: employer.trim(),
        job_title: title.trim() || null,
        annual_salary: salaryNum,
        pay_frequency: freq,
        net_per_check: netNum,
        start_date: start || null,
        is_active: active,
        paystub_date: stubDate || null,
        ...Object.fromEntries(Object.keys(stub).map((k) => [k, stubNum(k)])),
      },
      job?.id,
    );
    setSaving(false);
    if (err) {
      setError(
        /does not exist|schema cache/i.test(err)
          ? "W-2 jobs aren't set up yet -- ask your App Director to run the W-2 SQL."
          : "That didn't save. Check the fields and try again.",
      );
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={job ? "Edit W-2 job" : "Add W-2 job"}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">{job ? "Edit W-2 Job" : "Add W-2 Job"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>

        {error && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{error}</div>}

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelClass} htmlFor="w2-employer">Employer</label>
            <input id="w2-employer" autoFocus value={employer} maxLength={120} onChange={(e) => setEmployer(e.target.value)} placeholder="e.g. Acme Corp" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="w2-title">Job title</label>
            <input id="w2-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Desktop Engineer" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="w2-salary">Annual salary</label>
              <input id="w2-salary" type="number" min="0" step="1" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="w2-net">Take-home per check</label>
              <input id="w2-net" type="number" min="0" step="0.01" inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="w2-freq">Pay frequency</label>
              <select id="w2-freq" value={freq} onChange={(e) => setFreq(e.target.value as PayFrequency)} className={inputClass}>
                {PAY_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {PAY_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="w2-start">Start date (optional)</label>
              <input id="w2-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#f5d020]" />
            Current job
          </label>

          <div className="rounded-xl border border-[#4f8cff]/30 bg-[#4f8cff]/5 p-3.5">
            <div className="mb-0.5 text-sm font-semibold text-text-primary">Your last paystub</div>
            <p className="mb-3 text-xs text-text-muted">
              Copy these from your most recent paystub. They let the Taxes page estimate what you&apos;ll owe or get back. You can add this
              later too.
            </p>
            <div className="mb-3 max-w-[200px]">
              <label className={labelClass} htmlFor="w2-stub-date">Pay date</label>
              <input id="w2-stub-date" type="date" value={stubDate} onChange={(e) => setStubDate(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-x-2 gap-y-1.5 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Line</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">This period</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Year to date</span>
              {PAYSTUB_LINES.map((l) => (
                <PaystubRow
                  key={l.key}
                  label={l.label}
                  lineKey={l.key}
                  stub={stub}
                  onChange={(k, v) => setStub((p) => ({ ...p, [k]: v }))}
                />
              ))}
            </div>
          </div>

          {fig && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-3 text-center">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Gross / check</div>
                <div className="mt-0.5 text-sm font-semibold text-text-primary">{usd(fig.grossPerCheck)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Take-home / mo</div>
                <div className="mt-0.5 text-sm font-semibold text-[#f5d020]">{fig.netMonthly == null ? "--" : usd(fig.netMonthly)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Keep</div>
                <div className="mt-0.5 text-sm font-semibold text-text-primary">
                  {fig.takeHomePct == null ? "--" : `${Math.round(fig.takeHomePct * 100)}%`}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!valid || saving}
            onClick={submit}
            className="mt-1 self-start rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
          >
            {saving ? "Saving…" : job ? "Save Changes" : "Add Job"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaystubRow({
  label,
  lineKey,
  stub,
  onChange,
}: {
  label: string;
  lineKey: PaystubLineKey;
  stub: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const cell =
    "w-full rounded-md border border-card-border bg-[#0f131c] px-2 py-1.5 text-xs text-text-primary outline-none focus:border-[#4f8cff]/60";
  return (
    <>
      <span className="text-text-primary">{label}</span>
      {(["paystub", "ytd"] as const).map((p) => {
        const k = `${p}_${lineKey}`;
        return (
          <input
            key={k}
            aria-label={`${label} ${p === "ytd" ? "year to date" : "this period"}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={stub[k] ?? ""}
            onChange={(e) => onChange(k, e.target.value)}
            placeholder="0.00"
            className={cell}
          />
        );
      })}
    </>
  );
}
