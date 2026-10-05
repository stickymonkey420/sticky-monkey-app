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
  updateBusinessClient,
  updateJobStatus,
} from "@/lib/business/queries";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/business/types";
import RentalManager from "@/components/rentals/RentalManager";
import ClassSessions from "@/components/business/ClassSessions";
import DevWorkspace from "@/components/business/DevWorkspace";
import ItWorkspace from "@/components/business/ItWorkspace";
import { isItBusiness } from "@/lib/business/itTypes";
import { isDevBusiness } from "@/lib/business/devTypes";
import CategoryIllustration from "@/components/business/CategoryIllustration";
import FeedbackButton from "@/components/feedback/FeedbackButton";
import { isClassBasedBusiness } from "@/lib/business/sessionTypes";
import { isRentalBusiness } from "@/lib/rentals/types";
import { getGigConfig } from "@/lib/gigs/registry";
import GigWorkspace from "@/components/gigs/GigWorkspace";
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
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientEdit, setClientEdit] = useState({ name: "", email: "", phone: "" });
  const [savingClient, setSavingClient] = useState(false);

  const [jobForm, setJobForm] = useState({ title: "", client_id: "", amount: "", start_at: "", location: "", notes: "" });
  // Inline "Schedule" on an existing job card: which job is open + its fields.
  const [schedulingJobId, setSchedulingJobId] = useState<string | null>(null);
  const [jobSchedForm, setJobSchedForm] = useState({ start_at: "", location: "" });
  const [savingJobSched, setSavingJobSched] = useState(false);
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
  // Yoga / fitness businesses run classes with many clients per session,
  // so they get Classes & Sessions in place of the one-client Jobs board.
  const isClassBased = !isRental && isClassBasedBusiness(active?.category_name);
  // App / Web Developer: Projects -> milestones + time -> invoices (PDF).
  const isDev = !isRental && !isClassBased && isDevBusiness(active?.category_name);
  // IT / Tech Support: tickets + SLAs, time (15-min), parts, contracts, assets.
  const isIt = !isRental && !isClassBased && !isDev && isItBusiness(active?.category_name);
  // Every other gig type gets a tailored workspace from lib/gigs/configs
  // (its own records, KPIs, checklist and integrations) in place of the
  // generic board. Some trades keep the job pipeline, renamed.
  const gig = !isRental && !isClassBased && !isDev && !isIt ? getGigConfig(active?.category_name) : null;
  const showClients = !isRental && (!gig || gig.usesClients);
  const showJobsBoard = !isRental && !isClassBased && !isDev && !isIt && (!gig || !!gig.jobsBoard);
  const jobsLabel = gig && gig.jobsBoard ? gig.jobsBoard.label : "Jobs";
  const jobPlaceholder = gig && gig.jobsBoard ? gig.jobsBoard.placeholder : "Job title";
  // Each job's appointments (soonest first), for the date/time shown on its card.
  const apptsByJob = useMemo(() => {
    const map = new Map<string, BusinessAppointment[]>();
    for (const a of appointments) {
      if (!a.job_id) continue;
      const list = map.get(a.job_id) ?? [];
      list.push(a);
      map.set(a.job_id, list);
    }
    return map;
  }, [appointments]);
  const jobTitleById = useMemo(() => new Map(jobs.map((j) => [j.id, j.title])), [jobs]);

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

  function startEditClient(c: BusinessClient) {
    setEditingClientId(c.id);
    setClientEdit({ name: c.name, email: c.email ?? "", phone: c.phone ?? "" });
  }

  async function handleSaveClient(c: BusinessClient) {
    if (savingClient || !clientEdit.name.trim()) return;
    setSavingClient(true);
    const { client, error } = await updateBusinessClient(createClient(), c.id, {
      name: clientEdit.name.trim(),
      email: clientEdit.email.trim() || null,
      phone: clientEdit.phone.trim() || null,
    });
    setSavingClient(false);
    if (error || !client) {
      setMessage("Could not save that client. Please try again.");
      return;
    }
    setClients((rows) => rows.map((r) => (r.id === c.id ? client : r)));
    setEditingClientId(null);
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

  // Jobs and the Scheduler are one flow: giving a new job a date/time puts
  // it straight into "Scheduled" and creates its linked appointment
  // (business_appointments.job_id). Without a date it starts as a Lead.
  async function handleAddJob() {
    if (!userId || !activeId || addingJob || !jobForm.title.trim()) return;
    setAddingJob(true);
    const supabase = createClient();
    const when = jobForm.start_at ? new Date(jobForm.start_at) : null;
    const clientId = jobForm.client_id || null;
    const { job, error } = await addBusinessJob(supabase, userId, activeId, {
      title: jobForm.title.trim(),
      client_id: clientId,
      amount: jobForm.amount.trim() ? Number(jobForm.amount) : null,
      due_date: jobForm.start_at ? jobForm.start_at.slice(0, 10) : null,
      notes: jobForm.notes.trim() || null,
      status: when ? "scheduled" : "lead",
    });
    if (error || !job) {
      setAddingJob(false);
      setMessage("Could not add that job. Please try again.");
      return;
    }
    setJobs((rows) => [...rows, job]);
    if (when) {
      const { appointment, error: apptErr } = await addBusinessAppointment(supabase, userId, activeId, {
        title: job.title,
        start_at: when.toISOString(),
        end_at: null,
        location: jobForm.location.trim() || null,
        notes: null,
        job_id: job.id,
        client_id: clientId,
      });
      if (apptErr || !appointment) {
        setMessage("Job added, but its schedule didn't save. Use Schedule on the job card to try again.");
      } else {
        setAppointments((rows) => [...rows, appointment].sort((x, y) => x.start_at.localeCompare(y.start_at)));
      }
    }
    setAddingJob(false);
    setJobForm({ title: "", client_id: "", amount: "", start_at: "", location: "", notes: "" });
  }

  // Schedule an existing job (e.g. a Lead): creates its linked appointment
  // and moves a Lead to Scheduled.
  async function handleScheduleJob(job: BusinessJob) {
    if (!userId || !activeId || savingJobSched || !jobSchedForm.start_at) return;
    setSavingJobSched(true);
    const supabase = createClient();
    const { appointment, error } = await addBusinessAppointment(supabase, userId, activeId, {
      title: job.title,
      start_at: new Date(jobSchedForm.start_at).toISOString(),
      end_at: null,
      location: jobSchedForm.location.trim() || null,
      notes: null,
      job_id: job.id,
      client_id: job.client_id,
    });
    if (error || !appointment) {
      setSavingJobSched(false);
      setMessage("Could not schedule that job. Please try again.");
      return;
    }
    setAppointments((rows) => [...rows, appointment].sort((x, y) => x.start_at.localeCompare(y.start_at)));
    if (job.status === "lead") await handleJobStatusChange(job, "scheduled");
    setSavingJobSched(false);
    setSchedulingJobId(null);
    setJobSchedForm({ start_at: "", location: "" });
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
    const linked = apptsByJob.get(job.id) ?? [];
    const extra = linked.length ? ` Its ${linked.length === 1 ? "appointment" : `${linked.length} appointments`} will be removed too.` : "";
    if (!(await confirm({ message: `Remove job "${job.title}"?${extra}`, danger: true }))) return;
    const supabase = createClient();
    for (const appt of linked) await deleteBusinessAppointment(supabase, appt.id);
    const { error } = await deleteBusinessJob(supabase, job.id);
    if (error) {
      setMessage("Could not remove that job. Please try again.");
      return;
    }
    setJobs((rows) => rows.filter((r) => r.id !== job.id));
    setAppointments((rows) => rows.filter((r) => r.job_id !== job.id));
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

  // Schedule list + quick "Add Appointment" (for appointments not tied to a
  // job). Shown inside the Jobs card for regular businesses, and as its own
  // Scheduler card for rentals (which have no Jobs board).
  const scheduleSection = (
    <>
                {appointments.length === 0 ? (
                  <div className="mb-4 text-sm text-text-muted">No appointments yet.</div>
                ) : (
                  <div className="mb-4 flex flex-col gap-2">
                    {appointments.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-text-primary">
                            {a.title}
                            {a.job_id && jobTitleById.has(a.job_id) && a.title !== jobTitleById.get(a.job_id) && (
                              <span className="text-text-muted"> · {jobTitleById.get(a.job_id)}</span>
                            )}
                          </div>
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
                    className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingAppt ? "Adding…" : "Add Appointment"}
                  </button>
                </div>
    </>
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">My Business</h1>
      </div>

      {message && <div className="mb-4 text-sm text-[#ff5c7a]">{message}</div>}

      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : businesses.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <p className="mb-4 text-sm text-text-muted">No businesses added yet.</p>
          <Link href="/side-gigs" className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]">
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
                <div className={`flex items-start justify-between gap-4 ${showClients ? "mb-4" : ""}`}>
                  <div className="min-w-0">
                    <h3 className="mb-1 text-base font-semibold text-text-primary">
                      {active.business_name ?? active.category_name}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {active.category_name} · {active.group_label}
                    </p>
                    {userId && (
                      <div className="mt-2">
                        <FeedbackButton
                          userId={userId}
                          businessId={active.id}
                          businessName={active.business_name ?? active.category_name}
                          categoryName={active.category_name}
                        />
                      </div>
                    )}
                  </div>
                  <CategoryIllustration categoryName={active.category_name} groupLabel={active.group_label} size={112} />
                </div>
                {showClients && (
                  <>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{gig?.clientLabel ?? "Clients"}</h4>
                {loadingDetail ? (
                  <div className="mb-4 text-sm text-text-muted">Loading…</div>
                ) : clients.length === 0 ? (
                  <div className="mb-4 text-sm text-text-muted">No clients yet.</div>
                ) : (
                  <div className="mb-4 flex flex-col gap-2">
                    {clients.map((c) => (
                      editingClientId === c.id ? (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3.5 py-2.5">
                          <input
                            aria-label="Client name"
                            value={clientEdit.name}
                            onChange={(e) => setClientEdit((f) => ({ ...f, name: e.target.value }))}
                            className={inputClass}
                          />
                          <input
                            placeholder="Email (optional)"
                            value={clientEdit.email}
                            onChange={(e) => setClientEdit((f) => ({ ...f, email: e.target.value }))}
                            className={inputClass}
                          />
                          <input
                            placeholder="Phone (optional)"
                            value={clientEdit.phone}
                            onChange={(e) => setClientEdit((f) => ({ ...f, phone: e.target.value }))}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            disabled={savingClient || !clientEdit.name.trim()}
                            onClick={() => handleSaveClient(c)}
                            className="rounded-md bg-[#f5d020] px-3 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                          >
                            {savingClient ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingClientId(null)} className="text-sm text-text-muted hover:text-text-primary">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-text-primary">{c.name}</div>
                            <div className="truncate text-xs text-text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => startEditClient(c)} className="text-xs font-semibold text-[#f5d020] hover:underline">
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDeleteClient(c)} className="text-xs text-[#ff5c7a] hover:underline">
                              Remove
                            </button>
                          </div>
                        </div>
                      )
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
                    className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingClient ? "Adding…" : "Add Client"}
                  </button>
                </div>
                  </>
                )}
              </div>

              {isRental && userId && <RentalManager key={active.id} userId={userId} businessId={active.id} />}

              {isClassBased && userId && (
                <ClassSessions key={active.id} userId={userId} businessId={active.id} clients={clients} />
              )}

              {isDev && userId && (
                <DevWorkspace
                  key={active.id}
                  userId={userId}
                  businessId={active.id}
                  businessName={active.business_name ?? active.category_name}
                  logoDataUrl={active.logo_data_url ?? null}
                  onLogoChange={(logo) =>
                    setBusinesses((rows) => rows.map((r) => (r.id === active.id ? { ...r, logo_data_url: logo } : r)))
                  }
                  clients={clients}
                />
              )}

              {isIt && userId && (
                <ItWorkspace
                  key={active.id}
                  userId={userId}
                  businessId={active.id}
                  businessName={active.business_name ?? active.category_name}
                  logoDataUrl={active.logo_data_url ?? null}
                  onLogoChange={(logo) =>
                    setBusinesses((rows) => rows.map((r) => (r.id === active.id ? { ...r, logo_data_url: logo } : r)))
                  }
                  clients={clients}
                />
              )}

              {gig && userId && (
                <GigWorkspace key={active.id} userId={userId} businessId={active.id} config={gig} clients={clients} />
              )}

              {showJobsBoard && (
              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{jobsLabel}</h4>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {JOB_STATUSES.map((status) => (
                    <div key={status} className="rounded-xl bg-white/5 p-2.5">
                      <div className="mb-2 text-xs font-semibold text-text-muted">{JOB_STATUS_LABELS[status]}</div>
                      <div className="flex flex-col gap-2">
                        {(jobsByStatus.get(status) ?? []).map((j) => (
                          <div key={j.id} className="rounded-lg bg-[#0f131c] p-2">
                            <div className="text-sm text-text-primary">{j.title}</div>
                            {j.amount != null && <div className="text-xs text-text-muted">${Number(j.amount).toLocaleString()}</div>}
                            {(apptsByJob.get(j.id) ?? []).map((appt) => (
                              <div key={appt.id} className="mt-0.5 text-xs text-[#f5d020]">
                                {fmtDateTime(appt.start_at)}
                                {appt.location ? ` · ${appt.location}` : ""}
                              </div>
                            ))}
                            {schedulingJobId === j.id ? (
                              <div className="mt-1.5 flex flex-col gap-1.5">
                                <input
                                  type="datetime-local"
                                  aria-label={`${j.title} date and time`}
                                  value={jobSchedForm.start_at}
                                  onChange={(e) => setJobSchedForm((f) => ({ ...f, start_at: e.target.value }))}
                                  className="rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                                />
                                <input
                                  placeholder="Location (optional)"
                                  value={jobSchedForm.location}
                                  onChange={(e) => setJobSchedForm((f) => ({ ...f, location: e.target.value }))}
                                  className="rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={savingJobSched || !jobSchedForm.start_at}
                                    onClick={() => handleScheduleJob(j)}
                                    className="rounded bg-[#f5d020] px-2 py-1 text-xs font-semibold text-[#0f131c] disabled:opacity-60"
                                  >
                                    {savingJobSched ? "Saving…" : "Save"}
                                  </button>
                                  <button type="button" onClick={() => setSchedulingJobId(null)} className="text-xs text-text-muted hover:text-text-primary">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              j.status !== "completed" &&
                              j.status !== "cancelled" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSchedulingJobId(j.id);
                                    setJobSchedForm({ start_at: "", location: "" });
                                  }}
                                  className="mt-1 text-xs font-semibold text-[#f5d020] hover:underline"
                                >
                                  {(apptsByJob.get(j.id) ?? []).length ? "+ Add time" : "Schedule"}
                                </button>
                              )
                            )}
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
                  <input placeholder={jobPlaceholder} value={jobForm.title} onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
                  <select value={jobForm.client_id} onChange={(e) => setJobForm((f) => ({ ...f, client_id: e.target.value }))} className={inputClass}>
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="Amount (optional)" value={jobForm.amount} onChange={(e) => setJobForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
                  <input
                    type="datetime-local"
                    aria-label="Date and time (optional)"
                    title="Date and time (optional) -- adds the job to the schedule"
                    value={jobForm.start_at}
                    onChange={(e) => setJobForm((f) => ({ ...f, start_at: e.target.value }))}
                    className={inputClass}
                  />
                  {jobForm.start_at && (
                    <input
                      placeholder="Location (optional)"
                      value={jobForm.location}
                      onChange={(e) => setJobForm((f) => ({ ...f, location: e.target.value }))}
                      className={inputClass}
                    />
                  )}
                  <button
                    type="button"
                    disabled={addingJob || !jobForm.title.trim()}
                    onClick={handleAddJob}
                    className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
                  >
                    {addingJob ? "Adding…" : "Add Job"}
                  </button>
                </div>

                <div className="mt-6 border-t border-white/[0.08] pt-4">
                  <h5 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Schedule</h5>
                  {scheduleSection}
                </div>
              </div>
              )}

              {isRental && (
                <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Scheduler (showings, inspections, move-ins)
                  </h4>
                  {scheduleSection}
                </div>
              )}

              {gig && !gig.jobsBoard && gig.schedule && (
                <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{gig.schedule.label}</h4>
                  {scheduleSection}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
