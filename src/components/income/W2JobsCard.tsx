"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteW2Job, fetchW2Jobs, w2Figures, w2Totals } from "@/lib/w2/queries";
import { PAY_FREQUENCY_LABELS, W2_CHANGED_EVENT, type W2Job } from "@/lib/w2/types";
import W2JobModal from "./W2JobModal";

// Income page: W-2 Jobs. Separate from options/business income (it does not
// feed Income History or the monthly goal) -- just the member's paychecks:
// active jobs' gross and take-home per year/month, and one card per job.

function usd(n: number, cents = false): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 });
}

export default function W2JobsCard() {
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<W2Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ job: W2Job | null } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = user ? await fetchW2Jobs(supabase, user.id) : [];
    setJobs(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        const rows = user ? await fetchW2Jobs(supabase, user.id) : [];
        if (cancelled) return;
        setJobs(rows);
        setLoading(false);
      });
    };
    run();
    window.addEventListener(W2_CHANGED_EVENT, run);
    return () => {
      cancelled = true;
      window.removeEventListener(W2_CHANGED_EVENT, run);
    };
  }, []);

  async function remove(j: W2Job) {
    if (!(await confirm({ message: `Remove your W-2 job at ${j.employer}?`, danger: true }))) return;
    const { error } = await deleteW2Job(createClient(), j.id);
    if (error) console.error("deleteW2Job failed", error);
    await load();
  }

  const totals = w2Totals(jobs);

  return (
    <div id="w2-jobs-card" className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">W-2 Jobs</h3>
          <p className="text-xs text-text-muted">Paycheck income -- shown separately from options and business income.</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ job: null })}
          className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]"
        >
          + Add W-2 Job
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : jobs.length === 0 ? (
        <button
          type="button"
          onClick={() => setModal({ job: null })}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-card-border p-4 text-left hover:border-[#f5d020]/60 hover:bg-white/5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5d020]/15 text-[#f5d020]">
            <Briefcase size={18} />
          </span>
          <span className="text-sm text-text-muted">No W-2 jobs yet. Add your employer, salary and take-home pay.</span>
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Gross / year", value: usd(totals.grossAnnual) },
              { label: "Gross / month", value: usd(totals.grossMonthly) },
              { label: "Take-home / year", value: totals.netAnnual == null ? "--" : usd(totals.netAnnual), hi: true },
              { label: "Take-home / month", value: totals.netMonthly == null ? "--" : usd(totals.netMonthly), hi: true },
            ].map((t) => (
              <div key={t.label} className="rounded-xl bg-white/5 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.label}</div>
                <div className={`mt-1 text-lg font-bold ${t.hi ? "text-[#f5d020]" : "text-text-primary"}`}>{t.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {jobs.map((j) => {
              const f = w2Figures(j);
              return (
                <div key={j.id} className={`rounded-xl bg-white/5 p-4 ${j.is_active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5d020]/15 text-[#f5d020]">
                        <Briefcase size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-primary">{j.employer}</div>
                        <div className="truncate text-xs text-text-muted">
                          {[j.job_title, j.is_active ? null : "Past job", j.start_date ? `since ${j.start_date}` : null]
                            .filter(Boolean)
                            .join(" · ") || "W-2 employee"}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <button type="button" onClick={() => setModal({ job: j })} className="font-semibold text-[#4f8cff] hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => remove(j)} className="text-[#ff5c7a] hover:underline" aria-label={`Remove ${j.employer}`}>
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-text-muted">Salary</div>
                      <div className="font-semibold text-text-primary">{usd(Number(j.annual_salary))}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Gross / check</div>
                      <div className="font-semibold text-text-primary">{usd(f.grossPerCheck, true)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Take-home / check</div>
                      <div className="font-semibold text-[#f5d020]">{f.netPerCheck == null ? "--" : usd(f.netPerCheck, true)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-text-muted">
                    {PAY_FREQUENCY_LABELS[j.pay_frequency]} ({f.checksPerYear} checks)
                    {f.takeHomePct != null && ` · keeps ${Math.round(f.takeHomePct * 100)}% after taxes & deductions`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal && <W2JobModal job={modal.job} onClose={() => setModal(null)} />}
    </div>
  );
}
