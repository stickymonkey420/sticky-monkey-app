"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import {
  addMilestone,
  addProject,
  addTimeEntry,
  createDevInvoice,
  deleteMilestone,
  deleteProject,
  deleteTimeEntry,
  fetchDevWorkspace,
  updateMilestone,
  updateProject,
} from "@/lib/business/devQueries";
import {
  BILLING_MODELS,
  BILLING_MODEL_LABELS,
  BOARD_COLUMNS,
  MANUAL_MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  type BillingModel,
  type DevMilestone,
  type DevProject,
  type DevTimeEntry,
  type MilestoneStatus,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/business/devTypes";
import { isOverdue, todayIso, type BusinessInvoice, type BusinessInvoiceLine } from "@/lib/business/invoiceTypes";
import type { BusinessClient } from "@/lib/business/types";
import InvoicesPanel from "./InvoicesPanel";

// App / Web Developer workspace:
//   Projects board (Lead -> Proposal -> Active -> Delivered -> Done)
//   -> project detail: milestones, time log, links
//   -> "Create invoice" from delivered milestones + unbilled hours
//   -> Invoices (shared business_invoices) with PDF download.

const inputClass = "rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";
const smallInput = "rounded border border-card-border bg-[#0f131c] px-2 py-1.5 text-xs text-text-primary outline-none";
const btnPrimary = "rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60";
const btnSmall = "rounded bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60";

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function num(v: number | string | null | undefined): number {
  return v == null || v === "" ? 0 : Number(v);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MILESTONE_BADGE: Record<MilestoneStatus, string> = {
  pending: "bg-white/10 text-text-muted",
  in_progress: "bg-[#4f8cff]/15 text-[#7aa8ff]",
  delivered: "bg-[#f5d020]/15 text-[#f5d020]",
  invoiced: "bg-[#b07aff]/15 text-[#c9a3ff]",
  paid: "bg-[#3ddc97]/15 text-[#3ddc97]",
};

export default function DevWorkspace({
  userId,
  businessId,
  businessName,
  clients,
}: {
  userId: string;
  businessId: string;
  businessName: string;
  clients: BusinessClient[];
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [milestones, setMilestones] = useState<DevMilestone[]>([]);
  const [time, setTime] = useState<DevTimeEntry[]>([]);
  const [invoices, setInvoices] = useState<BusinessInvoice[]>([]);
  const [lines, setLines] = useState<BusinessInvoiceLine[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [projForm, setProjForm] = useState({
    name: "",
    client_id: "",
    project_type: "website" as ProjectType,
    billing_model: "fixed" as BillingModel,
    rate: "",
    budget: "",
    due_date: "",
  });
  const [addingProj, setAddingProj] = useState(false);

  const [msForm, setMsForm] = useState({ title: "", amount: "", due_date: "" });
  const [timeForm, setTimeForm] = useState({ work_date: todayIso(), hours: "", milestone_id: "", description: "", billable: true });
  const [linksForm, setLinksForm] = useState({ repo_url: "", live_url: "", staging_url: "", notes: "" });
  const [savingLinks, setSavingLinks] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create-invoice picker
  const [invPick, setInvPick] = useState<{ ms: Set<string>; time: Set<string>; due: string; notes: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([fetchDevWorkspace(supabase, businessId), supabase.auth.getUser()]).then(([ws, u]) => {
      if (cancelled) return;
      setProjects(ws.projects);
      setMilestones(ws.milestones);
      setTime(ws.time);
      setInvoices(ws.invoices);
      setLines(ws.lines);
      setUserEmail(u.data.user?.email ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const msByProject = useMemo(() => {
    const m = new Map<string, DevMilestone[]>();
    for (const x of milestones) m.set(x.project_id, [...(m.get(x.project_id) ?? []), x]);
    return m;
  }, [milestones]);
  const timeByProject = useMemo(() => {
    const m = new Map<string, DevTimeEntry[]>();
    for (const x of time) m.set(x.project_id, [...(m.get(x.project_id) ?? []), x]);
    return m;
  }, [time]);

  function unbilledFor(p: DevProject) {
    const ms = (msByProject.get(p.id) ?? []).filter((m) => m.status === "delivered" && !m.invoice_id);
    const hrs = (timeByProject.get(p.id) ?? []).filter((t) => t.billable && !t.invoice_id);
    const amount = ms.reduce((s, m) => s + num(m.amount), 0) + hrs.reduce((s, t) => s + num(t.hours) * num(p.hourly_rate), 0);
    return { ms, hrs, amount };
  }

  // Top tiles
  const stats = useMemo(() => {
    const today = todayIso();
    const monthPrefix = today.slice(0, 7);
    const active = projects.filter((p) => p.status === "active").length;
    let unbilled = 0;
    for (const p of projects) {
      const ms = (msByProject.get(p.id) ?? []).filter((m) => m.status === "delivered" && !m.invoice_id);
      const hrs = (timeByProject.get(p.id) ?? []).filter((t) => t.billable && !t.invoice_id);
      unbilled += ms.reduce((s, m) => s + num(m.amount), 0) + hrs.reduce((s, t) => s + num(t.hours) * num(p.hourly_rate), 0);
    }
    const outstanding = invoices.filter((i) => i.status === "sent").reduce((s, i) => s + num(i.total), 0);
    const overdue = invoices.filter((i) => isOverdue(i, today)).length;
    const paidMonth = invoices
      .filter((i) => i.status === "paid" && (i.paid_date ?? "").startsWith(monthPrefix))
      .reduce((s, i) => s + num(i.total), 0);
    const hoursMonth = time.filter((t) => t.work_date.startsWith(monthPrefix)).reduce((s, t) => s + num(t.hours), 0);
    return { active, unbilled, outstanding, overdue, paidMonth, hoursMonth };
  }, [projects, msByProject, timeByProject, invoices, time]);

  const open = openId ? projectById.get(openId) ?? null : null;

  function openProject(p: DevProject) {
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setOpenId(p.id);
    setInvPick(null);
    setMsForm({ title: "", amount: "", due_date: "" });
    setTimeForm({ work_date: todayIso(), hours: "", milestone_id: "", description: "", billable: true });
    setLinksForm({
      repo_url: p.repo_url ?? "",
      live_url: p.live_url ?? "",
      staging_url: p.staging_url ?? "",
      notes: p.notes ?? "",
    });
    setTimeout(() => document.getElementById("dev-project-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // ---------- project handlers ----------
  async function handleAddProject() {
    if (addingProj || !projForm.name.trim()) return;
    setAddingProj(true);
    setMessage(null);
    const { data, error } = await addProject(createClient(), userId, businessId, {
      name: projForm.name.trim(),
      client_id: projForm.client_id || null,
      project_type: projForm.project_type,
      billing_model: projForm.billing_model,
      hourly_rate: projForm.rate.trim() ? Number(projForm.rate) : null,
      budget: projForm.budget.trim() ? Number(projForm.budget) : null,
      due_date: projForm.due_date || null,
    });
    setAddingProj(false);
    if (error || !data) {
      setMessage("Could not add that project. Please try again.");
      return;
    }
    setProjects((rows) => [...rows, data]);
    setProjForm((f) => ({ ...f, name: "", budget: "", due_date: "" }));
  }

  async function patchProject(p: DevProject, patch: Parameters<typeof updateProject>[2]) {
    const prev = projects;
    setProjects((rows) => rows.map((r) => (r.id === p.id ? { ...r, ...patch } as DevProject : r)));
    const { error } = await updateProject(createClient(), p.id, patch);
    if (error) {
      setProjects(prev);
      setMessage("Could not update that project. Please try again.");
    }
  }

  async function handleSaveLinks(p: DevProject) {
    setSavingLinks(true);
    await patchProject(p, {
      repo_url: linksForm.repo_url.trim() || null,
      live_url: linksForm.live_url.trim() || null,
      staging_url: linksForm.staging_url.trim() || null,
      notes: linksForm.notes.trim() || null,
    });
    setSavingLinks(false);
  }

  async function handleDeleteProject(p: DevProject) {
    if (
      !(await confirm({
        message: `Remove project "${p.name}"? Its milestones and time log are removed too. Invoices are kept.`,
        danger: true,
      }))
    )
      return;
    const { error } = await deleteProject(createClient(), p.id);
    if (error) {
      setMessage("Could not remove that project. Please try again.");
      return;
    }
    setOpenId(null);
    reload();
  }

  // ---------- milestone handlers ----------
  async function handleAddMilestone(p: DevProject) {
    if (busy || !msForm.title.trim()) return;
    const amount = msForm.amount.trim() ? Number(msForm.amount) : 0;
    if (!Number.isFinite(amount) || amount < 0) return setMessage("Milestone amount must be zero or more.");
    setBusy(true);
    const { data, error } = await addMilestone(createClient(), userId, {
      project_id: p.id,
      title: msForm.title.trim(),
      amount,
      due_date: msForm.due_date || null,
      sort_order: (msByProject.get(p.id)?.length ?? 0) + 1,
    });
    setBusy(false);
    if (error || !data) return setMessage("Could not add that milestone. Please try again.");
    setMilestones((rows) => [...rows, data]);
    setMsForm({ title: "", amount: "", due_date: "" });
  }

  async function handleMilestoneStatus(m: DevMilestone, status: MilestoneStatus) {
    const prev = milestones;
    setMilestones((rows) => rows.map((r) => (r.id === m.id ? { ...r, status } : r)));
    const { error } = await updateMilestone(createClient(), m.id, { status });
    if (error) {
      setMilestones(prev);
      setMessage("Could not update that milestone. Please try again.");
    }
  }

  async function handleDeleteMilestone(m: DevMilestone) {
    if (!(await confirm({ message: `Remove milestone "${m.title}"?`, danger: true }))) return;
    const { error } = await deleteMilestone(createClient(), m.id);
    if (error) return setMessage("Could not remove that milestone. Please try again.");
    setMilestones((rows) => rows.filter((r) => r.id !== m.id));
  }

  // ---------- time handlers ----------
  async function handleAddTime(p: DevProject) {
    if (busy) return;
    const hours = Number(timeForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) return setMessage("Hours must be more than zero.");
    setBusy(true);
    setMessage(null);
    const { data, error } = await addTimeEntry(createClient(), userId, {
      project_id: p.id,
      milestone_id: timeForm.milestone_id || null,
      work_date: timeForm.work_date || todayIso(),
      hours,
      description: timeForm.description.trim() || null,
      billable: timeForm.billable,
    });
    setBusy(false);
    if (error || !data) return setMessage("Could not log that time. Please try again.");
    setTime((rows) => [data, ...rows].sort((a, b) => b.work_date.localeCompare(a.work_date)));
    setTimeForm((f) => ({ ...f, hours: "", description: "" }));
  }

  async function handleDeleteTime(t: DevTimeEntry) {
    if (!(await confirm({ message: `Remove ${num(t.hours)}h on ${fmtDate(t.work_date)}?`, danger: true }))) return;
    const { error } = await deleteTimeEntry(createClient(), t.id);
    if (error) return setMessage("Could not remove that entry. Please try again.");
    setTime((rows) => rows.filter((r) => r.id !== t.id));
  }

  // ---------- invoice creation ----------
  function startInvoice(p: DevProject) {
    const u = unbilledFor(p);
    setInvPick({ ms: new Set(u.ms.map((m) => m.id)), time: new Set(u.hrs.map((t) => t.id)), due: plusDays(14), notes: "" });
  }

  async function handleCreateInvoice(p: DevProject) {
    if (!invPick || busy) return;
    if (invPick.ms.size + invPick.time.size === 0) return setMessage("Pick at least one milestone or time entry.");
    setBusy(true);
    setMessage(null);
    const { error } = await createDevInvoice(createClient(), {
      projectId: p.id,
      milestoneIds: [...invPick.ms],
      timeIds: [...invPick.time],
      dueDate: invPick.due || null,
      notes: invPick.notes.trim() || null,
    });
    setBusy(false);
    if (error) return setMessage(`Could not create the invoice: ${error}`);
    setInvPick(null);
    reload();
    setTimeout(() => document.getElementById("dev-invoices")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }

  const showRate = projForm.billing_model !== "fixed";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Projects</h4>
        {message && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{message}</div>}

        {/* This month */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { k: "Active projects", v: String(stats.active) },
            { k: "Ready to invoice", v: money(stats.unbilled), color: stats.unbilled > 0 ? "text-[#f5d020]" : undefined },
            {
              k: stats.overdue ? `Outstanding · ${stats.overdue} overdue` : "Outstanding",
              v: money(stats.outstanding),
              color: stats.overdue ? "text-[#ff5c7a]" : undefined,
            },
            { k: "Paid this month", v: money(stats.paidMonth), color: "text-[#3ddc97]" },
            { k: "Hours this month", v: stats.hoursMonth.toFixed(1) },
          ].map((t) => (
            <div key={t.k} className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-text-muted">{t.k}</div>
              <div className={`mt-0.5 text-lg font-semibold ${t.color ?? "text-text-primary"}`}>{loading ? "…" : t.v}</div>
            </div>
          ))}
        </div>

        {/* Add project */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input
            placeholder="Project name"
            value={projForm.name}
            onChange={(e) => setProjForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
          <select
            aria-label="Client"
            value={projForm.client_id}
            onChange={(e) => setProjForm((f) => ({ ...f, client_id: e.target.value }))}
            className={inputClass}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Project type"
            value={projForm.project_type}
            onChange={(e) => setProjForm((f) => ({ ...f, project_type: e.target.value as ProjectType }))}
            className={inputClass}
          >
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            aria-label="Billing"
            value={projForm.billing_model}
            onChange={(e) => setProjForm((f) => ({ ...f, billing_model: e.target.value as BillingModel }))}
            className={inputClass}
          >
            {BILLING_MODELS.map((b) => (
              <option key={b} value={b}>
                {BILLING_MODEL_LABELS[b]}
              </option>
            ))}
          </select>
          {showRate && (
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Hourly rate ($)"
              value={projForm.rate}
              onChange={(e) => setProjForm((f) => ({ ...f, rate: e.target.value }))}
              className={`${inputClass} w-36`}
            />
          )}
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Budget ($, optional)"
            value={projForm.budget}
            onChange={(e) => setProjForm((f) => ({ ...f, budget: e.target.value }))}
            className={`${inputClass} w-40`}
          />
          <input
            type="date"
            aria-label="Due date"
            title="Due date (optional)"
            value={projForm.due_date}
            onChange={(e) => setProjForm((f) => ({ ...f, due_date: e.target.value }))}
            className={inputClass}
          />
          <button type="button" disabled={addingProj || !projForm.name.trim()} onClick={handleAddProject} className={btnPrimary}>
            {addingProj ? "Adding…" : "Add Project"}
          </button>
        </div>

        {/* Board */}
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BOARD_COLUMNS.map((col) => {
              const list = projects.filter((p) => p.status === col || (col === "done" && p.status === "cancelled"));
              return (
                <div key={col} className="rounded-xl bg-white/5 p-2.5">
                  <div className="mb-2 text-xs font-semibold text-text-muted">
                    {PROJECT_STATUS_LABELS[col]} {list.length ? `(${list.length})` : ""}
                  </div>
                  <div className="flex flex-col gap-2">
                    {list.map((p) => {
                      const ms = msByProject.get(p.id) ?? [];
                      const doneMs = ms.filter((m) => ["delivered", "invoiced", "paid"].includes(m.status)).length;
                      const pct = ms.length ? Math.round((doneMs / ms.length) * 100) : 0;
                      const hrs = (timeByProject.get(p.id) ?? []).reduce((s, t) => s + num(t.hours), 0);
                      const client = p.client_id ? clientById.get(p.client_id)?.name : null;
                      const isOpen = openId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openProject(p)}
                          className={`rounded-lg bg-[#0f131c] p-2.5 text-left hover:ring-1 hover:ring-[#f5d020]/50 ${
                            isOpen ? "ring-1 ring-[#f5d020]" : ""
                          } ${p.status === "cancelled" ? "opacity-50" : ""}`}
                        >
                          <div className="text-sm font-medium text-text-primary">{p.name}</div>
                          <div className="text-xs text-text-muted">
                            {[client, PROJECT_TYPE_LABELS[p.project_type]].filter(Boolean).join(" · ")}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-text-muted">
                            {p.budget != null && <span>{money(num(p.budget))}</span>}
                            {hrs > 0 && <span>{hrs.toFixed(1)}h</span>}
                            {p.due_date && <span>due {fmtDate(p.due_date)}</span>}
                          </div>
                          {ms.length > 0 && (
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" title={`${pct}% of milestones delivered`}>
                              <div className="h-full rounded-full bg-[#3ddc97]" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Project detail */}
      {open && (
        <div id="dev-project-detail" className="scroll-mt-24 rounded-2xl border border-[#f5d020]/40 bg-card-bg p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-text-primary">{open.name}</div>
              <div className="text-xs text-text-muted">
                {[
                  open.client_id ? clientById.get(open.client_id)?.name : "No client",
                  PROJECT_TYPE_LABELS[open.project_type],
                  BILLING_MODEL_LABELS[open.billing_model] +
                    (open.hourly_rate != null && open.billing_model !== "fixed" ? ` @ ${money(num(open.hourly_rate))}/h` : ""),
                  open.budget != null ? `Budget ${money(num(open.budget))}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <select
                aria-label="Project status"
                value={open.status}
                onChange={(e) => patchProject(open, { status: e.target.value as ProjectStatus })}
                className={smallInput}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => handleDeleteProject(open)} className="text-[#ff5c7a] hover:underline">
                Remove project
              </button>
              <button type="button" onClick={() => setOpenId(null)} className="text-text-muted hover:text-text-primary">
                Close
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Milestones */}
            <div className="rounded-xl bg-white/5 p-3.5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Milestones</div>
              {(msByProject.get(open.id) ?? []).length === 0 ? (
                <div className="mb-3 text-xs text-text-muted">No milestones yet (e.g. Design, Build, Launch).</div>
              ) : (
                <div className="mb-3 flex flex-col gap-1.5">
                  {(msByProject.get(open.id) ?? []).map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0f131c] px-2.5 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-text-primary">{m.title}</div>
                        <div className="text-text-muted">
                          {money(num(m.amount))}
                          {m.due_date ? ` · due ${fmtDate(m.due_date)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.invoice_id ? (
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${MILESTONE_BADGE[m.status]}`}>
                            {MILESTONE_STATUS_LABELS[m.status]}
                          </span>
                        ) : (
                          <select
                            aria-label={`${m.title} status`}
                            value={m.status}
                            onChange={(e) => handleMilestoneStatus(m, e.target.value as MilestoneStatus)}
                            className={smallInput}
                          >
                            {MANUAL_MILESTONE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {MILESTONE_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        )}
                        {!m.invoice_id && (
                          <button type="button" onClick={() => handleDeleteMilestone(m)} className="text-[#ff5c7a] hover:underline">
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  placeholder="Milestone"
                  value={msForm.title}
                  onChange={(e) => setMsForm((f) => ({ ...f, title: e.target.value }))}
                  className={smallInput}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount ($)"
                  value={msForm.amount}
                  onChange={(e) => setMsForm((f) => ({ ...f, amount: e.target.value }))}
                  className={`${smallInput} w-24`}
                />
                <input
                  type="date"
                  aria-label="Milestone due date"
                  value={msForm.due_date}
                  onChange={(e) => setMsForm((f) => ({ ...f, due_date: e.target.value }))}
                  className={smallInput}
                />
                <button type="button" disabled={busy || !msForm.title.trim()} onClick={() => handleAddMilestone(open)} className={btnSmall}>
                  Add
                </button>
              </div>
            </div>

            {/* Time log */}
            <div className="rounded-xl bg-white/5 p-3.5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span>Time log</span>
                <span className="normal-case">
                  {(timeByProject.get(open.id) ?? []).reduce((s, t) => s + num(t.hours), 0).toFixed(1)}h total
                </span>
              </div>
              {(timeByProject.get(open.id) ?? []).length === 0 ? (
                <div className="mb-3 text-xs text-text-muted">No time logged yet.</div>
              ) : (
                <div className="mb-3 flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {(timeByProject.get(open.id) ?? []).map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded bg-[#0f131c] px-2.5 py-1.5 text-xs">
                      <div className="min-w-0">
                        <span className="text-text-primary">{fmtDate(t.work_date)}</span>
                        <span className="text-text-muted"> · {num(t.hours)}h</span>
                        {t.description && <span className="text-text-muted"> · {t.description}</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!t.billable && <span className="text-text-muted">non-billable</span>}
                        {t.invoice_id ? (
                          <span className="text-[#c9a3ff]">invoiced</span>
                        ) : (
                          <button type="button" onClick={() => handleDeleteTime(t)} className="text-[#ff5c7a] hover:underline">
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Work date"
                  value={timeForm.work_date}
                  onChange={(e) => setTimeForm((f) => ({ ...f, work_date: e.target.value }))}
                  className={smallInput}
                />
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  placeholder="Hours"
                  value={timeForm.hours}
                  onChange={(e) => setTimeForm((f) => ({ ...f, hours: e.target.value }))}
                  className={`${smallInput} w-20`}
                />
                <input
                  placeholder="What did you work on?"
                  value={timeForm.description}
                  onChange={(e) => setTimeForm((f) => ({ ...f, description: e.target.value }))}
                  className={smallInput}
                />
                {(msByProject.get(open.id) ?? []).length > 0 && (
                  <select
                    aria-label="Milestone"
                    value={timeForm.milestone_id}
                    onChange={(e) => setTimeForm((f) => ({ ...f, milestone_id: e.target.value }))}
                    className={smallInput}
                  >
                    <option value="">No milestone</option>
                    {(msByProject.get(open.id) ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                )}
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={timeForm.billable}
                    onChange={(e) => setTimeForm((f) => ({ ...f, billable: e.target.checked }))}
                  />
                  Billable
                </label>
                <button type="button" disabled={busy || !timeForm.hours} onClick={() => handleAddTime(open)} className={btnSmall}>
                  Log
                </button>
              </div>
              {open.billing_model !== "fixed" && open.hourly_rate == null && (
                <div className="mt-2 text-xs text-[#f5d020]">Set an hourly rate below so logged hours bill correctly.</div>
              )}
            </div>
          </div>

          {/* Links + notes */}
          <div className="mt-5 rounded-xl bg-white/5 p-3.5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Links &amp; notes</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Repo URL"
                value={linksForm.repo_url}
                onChange={(e) => setLinksForm((f) => ({ ...f, repo_url: e.target.value }))}
                className={smallInput}
              />
              <input
                placeholder="Staging URL"
                value={linksForm.staging_url}
                onChange={(e) => setLinksForm((f) => ({ ...f, staging_url: e.target.value }))}
                className={smallInput}
              />
              <input
                placeholder="Live URL"
                value={linksForm.live_url}
                onChange={(e) => setLinksForm((f) => ({ ...f, live_url: e.target.value }))}
                className={smallInput}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Hourly rate"
                placeholder="Hourly rate ($)"
                defaultValue={open.hourly_rate ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const next = v ? Number(v) : null;
                  if (next !== (open.hourly_rate == null ? null : num(open.hourly_rate))) patchProject(open, { hourly_rate: next });
                }}
                className={`${smallInput} w-28`}
                key={`rate-${open.id}`}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Budget"
                placeholder="Budget ($)"
                defaultValue={open.budget ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const next = v ? Number(v) : null;
                  if (next !== (open.budget == null ? null : num(open.budget))) patchProject(open, { budget: next });
                }}
                className={`${smallInput} w-28`}
                key={`budget-${open.id}`}
              />
            </div>
            <textarea
              rows={2}
              placeholder="Notes"
              value={linksForm.notes}
              onChange={(e) => setLinksForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${smallInput} mt-2 w-full`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <button type="button" disabled={savingLinks} onClick={() => handleSaveLinks(open)} className={btnSmall}>
                {savingLinks ? "Saving…" : "Save links & notes"}
              </button>
              {[open.repo_url, open.staging_url, open.live_url].filter(Boolean).map((u) => (
                <a
                  key={u!}
                  href={/^https?:\/\//i.test(u!) ? u! : `https://${u}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[#7aa8ff] hover:underline"
                >
                  {u}
                </a>
              ))}
            </div>
          </div>

          {/* Create invoice */}
          <div className="mt-5 rounded-xl bg-white/5 p-3.5">
            {(() => {
              const u = unbilledFor(open);
              if (!invPick) {
                return (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-text-primary">
                      Ready to invoice: <span className="font-semibold text-[#f5d020]">{money(u.amount)}</span>
                      <span className="text-xs text-text-muted">
                        {" "}
                        ({u.ms.length} delivered milestone{u.ms.length === 1 ? "" : "s"}, {u.hrs.reduce((s, t) => s + num(t.hours), 0).toFixed(1)}h
                        unbilled)
                      </span>
                    </div>
                    <button type="button" disabled={u.ms.length + u.hrs.length === 0} onClick={() => startInvoice(open)} className={btnPrimary}>
                      Create invoice
                    </button>
                  </div>
                );
              }
              const rate = num(open.hourly_rate);
              const total =
                u.ms.filter((m) => invPick.ms.has(m.id)).reduce((s, m) => s + num(m.amount), 0) +
                u.hrs.filter((t) => invPick.time.has(t.id)).reduce((s, t) => s + num(t.hours) * rate, 0);
              const toggle = (kind: "ms" | "time", id: string) =>
                setInvPick((p) => {
                  if (!p) return p;
                  const next = new Set(p[kind]);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return { ...p, [kind]: next };
                });
              return (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">New invoice</div>
                  <div className="mb-3 flex flex-col gap-1 text-xs">
                    {u.ms.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-text-primary">
                        <input type="checkbox" checked={invPick.ms.has(m.id)} onChange={() => toggle("ms", m.id)} />
                        Milestone: {m.title} — {money(num(m.amount))}
                      </label>
                    ))}
                    {u.hrs.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-text-primary">
                        <input type="checkbox" checked={invPick.time.has(t.id)} onChange={() => toggle("time", t.id)} />
                        {fmtDate(t.work_date)} · {num(t.hours)}h {t.description ? `· ${t.description}` : ""} — {money(num(t.hours) * rate)}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-text-muted">
                      Due
                      <input
                        type="date"
                        value={invPick.due}
                        onChange={(e) => setInvPick((p) => (p ? { ...p, due: e.target.value } : p))}
                        className={smallInput}
                      />
                    </label>
                    <input
                      placeholder="Notes on invoice (optional, e.g. payment details)"
                      value={invPick.notes}
                      onChange={(e) => setInvPick((p) => (p ? { ...p, notes: e.target.value } : p))}
                      className={`${smallInput} min-w-[260px] flex-1`}
                    />
                    <span className="text-sm font-semibold text-text-primary">{money(total)}</span>
                    <button type="button" disabled={busy || total <= 0} onClick={() => handleCreateInvoice(open)} className={btnSmall}>
                      {busy ? "Creating…" : "Create draft invoice"}
                    </button>
                    <button type="button" onClick={() => setInvPick(null)} className="text-xs text-text-muted hover:text-text-primary">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div id="dev-invoices" className="scroll-mt-24">
        <InvoicesPanel
          loading={loading}
          invoices={invoices}
          lines={lines}
          clients={clients}
          projectNameById={(id) => (id ? projectById.get(id)?.name ?? null : null)}
          from={{ name: businessName, lines: [userEmail] }}
          onChanged={reload}
          onError={setMessage}
        />
      </div>
    </div>
  );
}
