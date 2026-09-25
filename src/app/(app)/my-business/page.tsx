"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import {
  addBusinessAppointment,
  addBusinessClient,
  addBusinessJob,
  deleteBusinessAppointment,
  deleteBusinessClient,
  deleteBusinessJob,
  deleteUserBusiness,
  fetchBusinessAppointments,
  fetchBusinessClients,
  fetchBusinessJobs,
  fetchUserBusinesses,
  renameUserBusiness,
  updateJobStatus,
} from "@/lib/business/queries";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/business/types";
import RentalManager from "@/components/rentals/RentalManager";
import { isRentalBusiness } from "@/lib/rentals/types";
import type { BusinessAppointment, BusinessClient, BusinessJob, JobStatus, UserBusiness } from "@/lib/business/types";

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// Port of the live Webflow "My Business" page (slug my-business, href
// /my-business). Body was a single custom HtmlEmbed, confirmed via the
// live rendered page rather than the Designer tree: a sign-in gate, a
// businesses list ("Browse Side Gigs" / "+ Add another business"), and
// per-business Clients, Jobs (Lead/Scheduled/In Progress/Completed/
// Cancelled), and a Scheduler. The live page's Invoices sub-section
// ("Bill your clients...") points at the Invoice List/Create Invoices
// Webflow template pages, which remain out of scope (confirmed unused
// boilerplate) -- left out here rather than shipped as a dead link.
//
// None of the backing tables (user_businesses, business_clients,
// business_jobs, business_appointments) carry a paid/app_director RLS
// restriction, so this page has no role gating -- same as Side Gigs.
export default function MyBusinessPage() {
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<UserBusiness[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState<BusinessClient[]>([]);
  const [jobs, setJobs] = useState<BusinessJob[]>([]);
  const [appointments, setAppointments] = useState<BusinessAppointment[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [addingClient, setAddingClient] = useState(false);

  const [jobForm, setJobForm] = useState({ title: "", client_id: "", amount: "", due_date: "", notes: "" });
  const [addingJob, setAddingJob] = useState(false);

  const [apptForm, setApptForm] = useState({ title: "", start_at: "", end_at: "", location: "", notes: "" });
  const [addingAppt, setAddingAppt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);
      const rows = await fetchUserBusinesses(supabase, user.id);
      if (cancelled) return;
      setBusinesses(rows);
      if (rows.length > 0) setActiveId(rows[0].id);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // No business selected (either nothing loaded yet, or the last one was
  // just removed) -- leave clients/jobs/appointments as whatever they
  // were rather than resetting them here; with no active business the
  // render below shows the empty state instead of the detail sections, so
  // stale arrays are simply never displayed.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const supabase = createClient();

    async function loadDetail() {
      setLoadingDetail(true);
      const [c, j, a] = await Promise.all([
        fetchBusinessClients(supabase, activeId!),
        fetchBusinessJobs(supabase, activeId!),
        fetchBusinessAppointments(supabase, activeId!),
      ]);
      if (cancelled) return;
      setClients(c);
      setJobs(j);
      setAppointments(a);
      setLoadingDetail(false);
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const active = useMemo(() => businesses.find((b) => b.id === activeId) ?? null, [businesses, activeId]);
  // "Property Management (Small Scale)" businesses get the Rental Property
  // module (properties, leases, rent ledger, maintenance, expenses, reports)
  // in place of the generic Clients/Jobs board; the Scheduler stays.
  const isRental = isRentalBusiness(active?.category_name);
  const jobsByStatus = useMemo(() => {
    const map = new Map<JobStatus, BusinessJob[]>();
    for (const status of JOB_STATUSES) map.set(status, []);
    for (const j of jobs) map.get(j.status)?.push(j);
    return map;
  }, [jobs]);

  function startRename(b: UserBusiness) {
    setRenamingId(b.id);
    setRenameValue(b.business_name ?? b.category_name);
  }

  async function submitRename(b: UserBusiness) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === b.business_name) return;
    const supabase = createClient();
    const { error } = await renameUserBusiness(supabase, b.id, name);
    if (error) {
      setMessage("Could not rename that business. Please try again.");
      return;
    }
    setBusinesses((rows) => rows.map((r) => (r.id === b.id ? { ...r, business_name: name } : r)));
  }

  async function handleDeleteBusiness(b: UserBusiness) {
    if (
      !(await confirm({
        message: `Remove "${b.business_name ?? b.category_name}" and all its clients, jobs, and appointments? This can't be undone.`,
        danger: true,
      }))
    )
      return;
    const supabase = createClient();
    const { error } = await deleteUserBusiness(supabase, b.id);
    if (error) {
      setMessage("Could not remove that business. Please try again.");
      return;
    }
    const remaining = businesses.filter((r) => r.id !== b.id);
    setBusinesses(remaining);
    if (activeId === b.id) setActiveId(remaining[0]?.id ?? null);
  }

  async function handleAddClient() {
    if (!userId || !activeId || addingClient || !clientForm.name.trim()) return;
    setAddingClient(true);
    const supabase = createClient();
    const { client, error } = await addBusinessClient(supabase, userId, activeId, {
      name: clientForm.name.trim(),
      email: clientForm.email.trim() || null,
      phone: clientForm.phone.trim() || null,
      notes: clientForm.notes.trim() || null,
    });
    setAddingClient(false);
    if (error || !client) {
      setMessage("Could not add that client. Please try again.");
      return;
    }
    setClients((rows) => [...rows, client]);
    setClientForm({ name: "", email: "", phone: "", notes: "" });
  }

  async function handleDeleteClient(c: BusinessClient) {
    if (!(await confirm({ message: `Remove client "${c.name}"?`, danger: true }))) return;
    const supabase = createClient();
    const { error } = await deleteBusinessClient(supabase, c.id);
    if (error) {
      setMessage("Could not remove that client. Please try again.");
      return;
    }
    setClients((rows) => rows.filter((r) => r.id !== c.id));
  }

  async function handleAddJob() {
    if (!userId || !activeId || addingJob || !jobForm.title.trim()) return;
    setAddingJob(true);
    const supabase = createClient();
    const { job, error } = await addBusinessJob(supabase, userId, activeId, {
      title: jobForm.title.trim(),
      client_id: jobForm.client_id || null,
      amount: jobForm.amount.trim() ? Number(jobForm.amount) : null,
      due_date: jobForm.due_date || null,
      notes: jobForm.notes.trim() || null,
    });
    setAddingJob(false);
    if (error || !job) {
      setMessage("Could not add that job. Please try again.");
      return;
    }
    setJobs((rows) => [...rows, job]);
    setJobForm({ title: "", client_id: "", amount: "", due_date: "", notes: "" });
  }

  async function handleJobStatusChange(job: BusinessJob, status: JobStatus) {
    const prev = jobs;
    setJobs((rows) => rows.map((r) => (r.id === job.id ? { ...r, status } : r)));
    const supabase = createClient();
    const { error } = await updateJobStatus(supabase, job.id, status);
    if (error) {
      setMessage("Could not update that job. Please try again.");
      setJobs(prev);
    }
  }

  async function handleDeleteJob(job: BusinessJob) {
    if (!(await confirm({ message: `Remove job "${job.title}"?`, danger: true }))) return;
    const supabase = createClient();
    const { error } = await deleteBusinessJob(supabase, job.id);
    if (error) {
      setMessage("Could not remove that job. Please try again.");
      return;
    }
    setJobs((rows) => rows.filter((r) => r.id !== job.id));
  }

  async function handleAddAppointment() {
    if (!userId || !activeId || addingAppt || !apptForm.title.trim() || !apptForm.start_at) return;
    setAddingAppt(true);
    const supabase = createClient();
    const { appointment, error } = await addBusinessAppointment(supabase, userId, activeId, {
      title: apptForm.title.trim(),
      start_at: new Date(apptForm.start_at).toISOString(),
      end_at: apptForm.end_at ? new Date(apptForm.end_at).toISOString() : null,
      location: apptForm.location.trim() || null,
      notes: apptForm.notes.trim() || null,
    });
    setAddingAppt(false);
    if (error || !appointment) {
      setMessage("Could not add that appointment. Please try again.");
      return;
    }
    setAppointments((rows) => [...rows, appointment].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setApptForm({ title: "", start_at: "", end_at: "", location: "", notes: "" });
  }

  async function handleDeleteAppointment(a: BusinessAppointment) {
    if (!(await confirm({ message: `Remove appointment "${a.title}"?`, danger: true }))) return;
    const supabase = createClient();
    const { error } = await deleteBusinessAppointment(supabase, a.id);
    if (error) {
      setMessage("Could not remove that appointment. Please try again.");
      return;
    }
    setAppointments((rows) => rows.filter((r) => r.id !== a.id));
  }

  const inputClass = "rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">My Business</h1>
      </div>

      {message && <div className="mb-4 text-sm text-[#ff5c7a]">{message}</div>}

      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : businesses.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <p className="mb-4 text-sm text-text-muted">No businesses added yet.</p>
          <Link href="/side-gigs" className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c]">
            Browse Side Gigs
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-card-border bg-card-bg p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Your Businesses</h3>
              <Link href="/side-gigs" className="text-xs font-semibold text-[#4f8cff] hover:underline">
                + Add another business
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {businesses.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                    activeId === b.id ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-primary"
                  }`}
                >
                  {renamingId === b.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(b);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => submitRename(b)}
                      className="w-32 rounded border border-card-border bg-[#0f131c] px-1.5 py-0.5 text-xs text-text-primary outline-none"
                    />
                  ) : (
                    <button type="button" onClick={() => setActiveId(b.id)}>
                      {b.business_name ?? b.category_name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startRename(b)}
                    className="text-xs opacity-70 hover:opacity-100"
                    aria-label="Rename"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBusiness(b)}
                    className="text-xs opacity-70 hover:opacity-100"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {active && (
            <>
              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <h3 className="mb-1 text-sm font-semibold text-text-primary">
                  {active.business_name ?? active.category_name}
                </h3>
                <p className={isRental ? "text-xs text-text-muted" : "mb-4 text-xs text-text-muted"}>
                  {active.category_name} · {active.group_label}
                </p>
                {!isRental && (
                  <>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Clients</h4>
                {loadingDetail ? (
                  <div className="mb-4 text-sm text-text-muted">Loading…</div>
                ) : clients.length === 0 ? (
                  <div className="mb-4 text-sm text-text-muted">No clients yet.</div>
                ) : (
                  <div className="mb-4 flex flex-col gap-2">
                    {clients.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-text-primary">{c.name}</div>
                          <div className="truncate text-xs text-text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                        </div>
                        <button type="button" onClick={() => handleDeleteClient(c)} className="text-xs text-[#ff5c7a] hover:underline">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input placeholder="Client name" value={clientForm.name} onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
                  <input placeholder="Email (optional)" value={clientForm.email} onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))} className={inputClass} />
                  <input placeholder="Phone (optional)" value={clientForm.phone} onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} />
                  <button
                    type="button"
                    disabled={addingClient || !clientForm.name.trim()}
                    onClick={handleAddClient}
                    className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingClient ? "Adding…" : "Add Client"}
                  </button>
                </div>
                  </>
                )}
              </div>

              {isRental && userId && <RentalManager key={active.id} userId={userId} businessId={active.id} />}

              {!isRental && (
              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Jobs</h4>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {JOB_STATUSES.map((status) => (
                    <div key={status} className="rounded-xl bg-white/5 p-2.5">
                      <div className="mb-2 text-xs font-semibold text-text-muted">{JOB_STATUS_LABELS[status]}</div>
                      <div className="flex flex-col gap-2">
                        {(jobsByStatus.get(status) ?? []).map((j) => (
                          <div key={j.id} className="rounded-lg bg-[#0f131c] p-2">
                            <div className="text-sm text-text-primary">{j.title}</div>
                            {j.amount != null && <div className="text-xs text-text-muted">${Number(j.amount).toLocaleString()}</div>}
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select
                                value={j.status}
                                onChange={(e) => handleJobStatusChange(j, e.target.value as JobStatus)}
                                className="flex-1 rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                              >
                                {JOB_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {JOB_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                              <button type="button" onClick={() => handleDeleteJob(j)} className="text-xs text-[#ff5c7a] hover:underline">
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input placeholder="Job title" value={jobForm.title} onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
                  <select value={jobForm.client_id} onChange={(e) => setJobForm((f) => ({ ...f, client_id: e.target.value }))} className={inputClass}>
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="Amount (optional)" value={jobForm.amount} onChange={(e) => setJobForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
                  <input type="date" value={jobForm.due_date} onChange={(e) => setJobForm((f) => ({ ...f, due_date: e.target.value }))} className={inputClass} />
                  <button
                    type="button"
                    disabled={addingJob || !jobForm.title.trim()}
                    onClick={handleAddJob}
                    className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingJob ? "Adding…" : "Add Job"}
                  </button>
                </div>
              </div>
              )}

              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {isRental ? "Scheduler (showings, inspections, move-ins)" : "Scheduler"}
                </h4>
                {appointments.length === 0 ? (
                  <div className="mb-4 text-sm text-text-muted">No appointments yet.</div>
                ) : (
                  <div className="mb-4 flex flex-col gap-2">
                    {appointments.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-text-primary">{a.title}</div>
                          <div className="truncate text-xs text-text-muted">
                            {fmtDateTime(a.start_at)}
                            {a.location ? ` · ${a.location}` : ""}
                          </div>
                        </div>
                        <button type="button" onClick={() => handleDeleteAppointment(a)} className="text-xs text-[#ff5c7a] hover:underline">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input placeholder="Title" value={apptForm.title} onChange={(e) => setApptForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
                  <input type="datetime-local" value={apptForm.start_at} onChange={(e) => setApptForm((f) => ({ ...f, start_at: e.target.value }))} className={inputClass} />
                  <input placeholder="Location (optional)" value={apptForm.location} onChange={(e) => setApptForm((f) => ({ ...f, location: e.target.value }))} className={inputClass} />
                  <button
                    type="button"
                    disabled={addingAppt || !apptForm.title.trim() || !apptForm.start_at}
                    onClick={handleAddAppointment}
                    className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingAppt ? "Adding…" : "Add Appointment"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
