"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveW2Job, w2Figures } from "@/lib/w2/queries";
import { PAY_FREQUENCIES, PAY_FREQUENCY_LABELS, type PayFrequency, type W2Job } from "@/lib/w2/types";

// Add / edit a W-2 job. Opened from the Income page's W-2 Jobs card and from
// Quick Access ("Add W-2 Job"). Basic fields only: employer, job title,
// annual salary, pay frequency, take-home per check (+ optional start date).
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
  const fig = valid ? w2Figures({ annual_salary: salaryNum, pay_frequency: freq, net_per_check: netNum }) : null;

  async function submit() {
    if (!valid || saving) return;
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={job ? "Edit W-2 job" : "Add W-2 job"}
        className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl"
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
