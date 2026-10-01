"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { createItInvoice, fetchItWorkspace, itDelete, itInsert, itUpdate } from "@/lib/business/itQueries";
import {
  OPEN_STATUSES,
  PRIORITIES,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  SLA_TEXT,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  WORK_TYPES,
  WORK_TYPE_LABELS,
  billedMinutes,
  contractCovers,
  fmtMinutes,
  slaState,
  type ItAsset,
  type ItContract,
  type ItPart,
  type ItSite,
  type ItTicket,
  type ItTimeEntry,
  type Priority,
  type TicketStatus,
  type TicketType,
  type WorkType,
} from "@/lib/business/itTypes";
import { todayIso, type BusinessInvoice, type BusinessInvoiceLine } from "@/lib/business/invoiceTypes";
import type { BusinessClient } from "@/lib/business/types";
import InvoicesPanel from "./InvoicesPanel";
import { itBtn, itBtnSmall, itInput, itSmall, money, num } from "./itUi";
import ItAssetsTab from "./ItAssetsTab";
import ItContractsTab from "./ItContractsTab";

// IT / Tech Support Consultant workspace:
//   Tickets (P1-P4 SLAs) -> time log (billed in 15-min increments) + parts
//   -> invoice per client; Assets & Sites; Contracts (managed / prepaid /
//   rate card); shared Invoices panel with PDF + logo.

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SLA_TONE = {
  ok: "text-text-muted",
  soon: "text-[#f5d020]",
  breach: "font-semibold text-[#ff5c7a]",
  met: "text-[#3ddc97]",
} as const;

type Tab = "tickets" | "assets" | "contracts";
type QueueFilter = "open" | "waiting" | "done" | "all";

export default function ItWorkspace({
  userId,
  businessId,
  businessName,
  logoDataUrl,
  onLogoChange,
  clients,
}: {
  userId: string;
  businessId: string;
  businessName: string;
  logoDataUrl: string | null;
  onLogoChange: (logo: string | null) => void;
  clients: BusinessClient[];
}) {
  const confirm = useConfirm();
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>("tickets");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [tickets, setTickets] = useState<ItTicket[]>([]);
  const [sites, setSites] = useState<ItSite[]>([]);
  const [contracts, setContracts] = useState<ItContract[]>([]);
  const [assets, setAssets] = useState<ItAsset[]>([]);
  const [time, setTime] = useState<ItTimeEntry[]>([]);
  const [parts, setParts] = useState<ItPart[]>([]);
  const [invoices, setInvoices] = useState<BusinessInvoice[]>([]);
  const [lines, setLines] = useState<BusinessInvoiceLine[]>([]);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);

  const [queue, setQueue] = useState<QueueFilter>("open");
  const [clientFilter, setClientFilter] = useState("");
  const [prioFilter, setPrioFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tForm, setTForm] = useState({
    client_id: "",
    subject: "",
    ticket_type: "incident" as TicketType,
    priority: "p3" as Priority,
    site_id: "",
    asset_id: "",
    description: "",
  });
  const [timeForm, setTimeForm] = useState({ minutes: "", work_type: "remote" as WorkType, description: "", billable: true, covered: false, work_date: todayIso() });
  const [partForm, setPartForm] = useState({ item: "", quantity: "1", unit_cost: "", unit_price: "" });
  const [notesForm, setNotesForm] = useState({ description: "", resolution: "" });
  const [billPick, setBillPick] = useState<{ time: Set<string>; parts: Set<string>; due: string; notes: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([fetchItWorkspace(supabase, businessId), supabase.auth.getUser()]).then(([ws, u]) => {
      if (cancelled) return;
      setTickets(ws.tickets);
      setSites(ws.sites);
      setContracts(ws.contracts);
      setAssets(ws.assets);
      setTime(ws.time);
      setParts(ws.parts);
      setInvoices(ws.invoices);
      setLines(ws.lines);
      setDefaultRate(ws.defaultRate);
      setUserEmail(u.data.user?.email ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const ticketById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const timeByTicket = useMemo(() => {
    const m = new Map<string, ItTimeEntry[]>();
    for (const x of time) m.set(x.ticket_id, [...(m.get(x.ticket_id) ?? []), x]);
    return m;
  }, [time]);
  const partsByTicket = useMemo(() => {
    const m = new Map<string, ItPart[]>();
    for (const x of parts) m.set(x.ticket_id, [...(m.get(x.ticket_id) ?? []), x]);
    return m;
  }, [parts]);

  const rateFor = (t: ItTicket | undefined) => {
    const c = t?.contract_id ? contractById.get(t.contract_id) : null;
    return c?.hourly_rate != null ? num(c.hourly_rate) : defaultRate ?? 0;
  };
  const isUnbilledTime = (e: ItTimeEntry) => e.billable && !e.covered && !e.invoice_id;

  // ---------- tiles ----------
  const stats = useMemo(() => {
    const open = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
    const breaches = open.filter((t) => slaState(t, now)?.tone === "breach").length;
    let unbilled = 0;
    for (const e of time) if (isUnbilledTime(e)) unbilled += (billedMinutes(e.minutes) / 60) * rateFor(ticketById.get(e.ticket_id));
    for (const p of parts) if (!p.invoice_id) unbilled += num(p.quantity) * num(p.unit_price);
    const mrr = contracts.filter((c) => c.active && c.contract_type === "managed").reduce((s, c) => s + num(c.monthly_fee), 0);
    const in60 = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10);
    const warranty = assets.filter((a) => a.status === "active" && a.warranty_end && a.warranty_end <= in60).length;
    return { open: open.length, breaches, unbilled, mrr, warranty };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, time, parts, contracts, assets, now, defaultRate]);

  // ---------- queue ----------
  const shown = useMemo(() => {
    let list = tickets.filter((t) =>
      queue === "open"
        ? OPEN_STATUSES.includes(t.status)
        : queue === "waiting"
          ? t.status === "waiting"
          : queue === "done"
            ? t.status === "resolved" || t.status === "closed"
            : true
    );
    if (clientFilter) list = list.filter((t) => t.client_id === clientFilter);
    if (prioFilter) list = list.filter((t) => t.priority === prioFilter);
    if (queue === "open" || queue === "waiting")
      list = list.slice().sort((a, b) => (a.resolve_due_at ?? "").localeCompare(b.resolve_due_at ?? "") || a.priority.localeCompare(b.priority));
    return list;
  }, [tickets, queue, clientFilter, prioFilter]);

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
      waiting: tickets.filter((t) => t.status === "waiting").length,
      done: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
      all: tickets.length,
    }),
    [tickets]
  );

  const activeContractFor = (clientId: string) => contracts.find((c) => c.client_id === clientId && c.active) ?? null;

  // ---------- ticket handlers ----------
  async function handleAddTicket() {
    if (busy || !tForm.subject.trim()) return;
    setBusy(true);
    setMessage(null);
    const contract = tForm.client_id ? activeContractFor(tForm.client_id) : null;
    const { data, error } = await itInsert<ItTicket>(createClient(), "it_tickets", {
      user_id: userId,
      business_id: businessId,
      client_id: tForm.client_id || null,
      site_id: tForm.site_id || null,
      asset_id: tForm.asset_id || null,
      contract_id: contract?.id ?? null,
      subject: tForm.subject.trim(),
      description: tForm.description.trim() || null,
      ticket_type: tForm.ticket_type,
      priority: tForm.priority,
      number: "",
    });
    setBusy(false);
    if (error || !data) return setMessage("Could not create that ticket. Please try again.");
    setTickets((rows) => [data, ...rows]);
    setTForm((f) => ({ ...f, subject: "", description: "", site_id: "", asset_id: "" }));
    setQueue("open");
  }

  async function patchTicket(t: ItTicket, patch: Partial<ItTicket>) {
    const full: Record<string, unknown> = { ...patch };
    if (patch.status) {
      if (patch.status !== "new" && !t.first_response_at) full.first_response_at = new Date().toISOString();
      if ((patch.status === "resolved" || patch.status === "closed") && !t.resolved_at) full.resolved_at = new Date().toISOString();
      if (patch.status !== "resolved" && patch.status !== "closed") full.resolved_at = null;
    }
    const prev = tickets;
    setTickets((rows) => rows.map((r) => (r.id === t.id ? ({ ...r, ...full } as ItTicket) : r)));
    const { error } = await itUpdate<ItTicket>(createClient(), "it_tickets", t.id, full);
    if (error) {
      setTickets(prev);
      setMessage("Could not update that ticket. Please try again.");
    }
  }

  async function handleDeleteTicket(t: ItTicket) {
    const billed = (timeByTicket.get(t.id) ?? []).some((e) => e.invoice_id) || (partsByTicket.get(t.id) ?? []).some((p) => p.invoice_id);
    if (
      !(await confirm({
        message: `Delete ${t.number}? Its time log and parts are removed too.${billed ? " Invoices already created keep their lines." : ""}`,
        danger: true,
      }))
    )
      return;
    const { error } = await itDelete(createClient(), "it_tickets", t.id);
    if (error) return setMessage("Could not delete that ticket. Please try again.");
    setOpenId(null);
    reload();
  }

  function openTicket(t: ItTicket) {
    if (openId === t.id) return setOpenId(null);
    setOpenId(t.id);
    setBillPick(null);
    setNotesForm({ description: t.description ?? "", resolution: t.resolution ?? "" });
    const c = t.contract_id ? contractById.get(t.contract_id) : null;
    setTimeForm({ minutes: "", work_type: "remote", description: "", billable: true, covered: contractCovers(c, "remote"), work_date: todayIso() });
    setPartForm({ item: "", quantity: "1", unit_cost: "", unit_price: "" });
  }

  async function handleSaveNotes(t: ItTicket) {
    setBusy(true);
    await patchTicket(t, { description: notesForm.description.trim() || null, resolution: notesForm.resolution.trim() || null });
    setBusy(false);
  }

  async function handleLogTime(t: ItTicket, minutesOverride?: number) {
    if (busy) return;
    const minutes = minutesOverride ?? Math.round(Number(timeForm.minutes));
    if (!Number.isFinite(minutes) || minutes <= 0) return setMessage("Enter minutes worked (more than zero).");
    setBusy(true);
    setMessage(null);
    const { data, error } = await itInsert<ItTimeEntry>(createClient(), "it_time_entries", {
      user_id: userId,
      ticket_id: t.id,
      work_date: timeForm.work_date || todayIso(),
      minutes,
      work_type: timeForm.work_type,
      description: timeForm.description.trim() || null,
      billable: timeForm.billable,
      covered: timeForm.billable ? timeForm.covered : false,
    });
    setBusy(false);
    if (error || !data) return setMessage("Could not log that time. Please try again.");
    setTime((rows) => [data, ...rows]);
    setTimeForm((f) => ({ ...f, minutes: "", description: "" }));
    // First time logged counts as the first response.
    if (!t.first_response_at || t.status === "new") await patchTicket(t, { status: t.status === "new" ? "in_progress" : t.status });
  }

  async function handleDeleteTime(e: ItTimeEntry) {
    if (!(await confirm({ message: `Remove ${fmtMinutes(e.minutes)} on ${fmtDate(e.work_date)}?`, danger: true }))) return;
    const { error } = await itDelete(createClient(), "it_time_entries", e.id);
    if (error) return setMessage("Could not remove that entry. Please try again.");
    setTime((rows) => rows.filter((r) => r.id !== e.id));
  }

  async function handleAddPart(t: ItTicket) {
    if (busy || !partForm.item.trim()) return;
    const qty = Number(partForm.quantity || 1);
    const cost = Number(partForm.unit_cost || 0);
    const price = Number(partForm.unit_price || 0);
    if (![qty, cost, price].every((n) => Number.isFinite(n) && n >= 0) || qty <= 0) return setMessage("Check the part's quantity and prices.");
    setBusy(true);
    const { data, error } = await itInsert<ItPart>(createClient(), "it_ticket_parts", {
      user_id: userId,
      ticket_id: t.id,
      item: partForm.item.trim(),
      quantity: qty,
      unit_cost: cost,
      unit_price: price,
    });
    setBusy(false);
    if (error || !data) return setMessage("Could not add that part. Please try again.");
    setParts((rows) => [...rows, data]);
    setPartForm({ item: "", quantity: "1", unit_cost: "", unit_price: "" });
  }

  async function handleDeletePart(p: ItPart) {
    if (!(await confirm({ message: `Remove part "${p.item}"?`, danger: true }))) return;
    const { error } = await itDelete(createClient(), "it_ticket_parts", p.id);
    if (error) return setMessage("Could not remove that part. Please try again.");
    setParts((rows) => rows.filter((r) => r.id !== p.id));
  }

  // ---------- billing (per client, across all their tickets) ----------
  function unbilledForClient(clientId: string | null) {
    const tIds = new Set(tickets.filter((t) => t.client_id === clientId).map((t) => t.id));
    return {
      time: time.filter((e) => tIds.has(e.ticket_id) && isUnbilledTime(e)),
      parts: parts.filter((p) => tIds.has(p.ticket_id) && !p.invoice_id),
    };
  }

  function startBilling(t: ItTicket) {
    const u = unbilledForClient(t.client_id);
    setBillPick({ time: new Set(u.time.map((e) => e.id)), parts: new Set(u.parts.map((p) => p.id)), due: plusDays(14), notes: "" });
  }

  async function handleCreateInvoice(t: ItTicket) {
    if (!billPick || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createItInvoice(createClient(), {
      businessId,
      clientId: t.client_id,
      timeIds: [...billPick.time],
      partIds: [...billPick.parts],
      dueDate: billPick.due || null,
      notes: billPick.notes.trim() || null,
    });
    setBusy(false);
    if (error) return setMessage(`Could not create the invoice: ${error}`);
    setBillPick(null);
    reload();
    setTimeout(() => document.getElementById("it-invoices")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }

  const formSites = sites.filter((s) => s.client_id === tForm.client_id);
  const formAssets = assets.filter((a) => a.client_id === tForm.client_id && a.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        {message && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{message}</div>}

        {/* Tiles */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { k: "Open tickets", v: String(stats.open) },
            { k: "SLA breaches", v: String(stats.breaches), color: stats.breaches ? "text-[#ff5c7a]" : undefined },
            { k: "Unbilled", v: money(stats.unbilled), color: stats.unbilled > 0 ? "text-[#f5d020]" : undefined },
            { k: "Contracts / month", v: money(stats.mrr), color: "text-[#3ddc97]" },
            { k: "Warranty ≤ 60 days", v: String(stats.warranty), color: stats.warranty ? "text-[#f5d020]" : undefined },
          ].map((t) => (
            <div key={t.k} className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-text-muted">{t.k}</div>
              <div className={`mt-0.5 text-lg font-semibold ${t.color ?? "text-text-primary"}`}>{loading ? "…" : t.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          {(
            [
              ["tickets", "Tickets"],
              ["assets", "Assets & Sites"],
              ["contracts", "Contracts & Rates"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === k ? "bg-[#f5d020] text-[#0f131c]" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "assets" && (
          <ItAssetsTab userId={userId} businessId={businessId} clients={clients} sites={sites} assets={assets} now={now} onChanged={reload} onError={setMessage} />
        )}
        {tab === "contracts" && (
          <ItContractsTab
            userId={userId}
            businessId={businessId}
            clients={clients}
            contracts={contracts}
            tickets={tickets}
            time={time}
            defaultRate={defaultRate}
            onDefaultRate={setDefaultRate}
            onChanged={reload}
            onError={setMessage}
          />
        )}

        {tab === "tickets" && (
          <>
            {/* New ticket */}
            <div className="mb-5 rounded-xl bg-white/5 p-3.5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">New ticket</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Client"
                  value={tForm.client_id}
                  onChange={(e) => setTForm((f) => ({ ...f, client_id: e.target.value, site_id: "", asset_id: "" }))}
                  className={itInput}
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Subject (e.g. Outlook won't open)"
                  value={tForm.subject}
                  onChange={(e) => setTForm((f) => ({ ...f, subject: e.target.value }))}
                  className={`${itInput} min-w-[240px] flex-1`}
                />
                <select
                  aria-label="Type"
                  value={tForm.ticket_type}
                  onChange={(e) => setTForm((f) => ({ ...f, ticket_type: e.target.value as TicketType }))}
                  className={itInput}
                >
                  {TICKET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TICKET_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Priority"
                  value={tForm.priority}
                  onChange={(e) => setTForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                  className={itInput}
                  title={SLA_TEXT[tForm.priority]}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
                {formSites.length > 0 && (
                  <select aria-label="Site" value={tForm.site_id} onChange={(e) => setTForm((f) => ({ ...f, site_id: e.target.value }))} className={itInput}>
                    <option value="">No site</option>
                    {formSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                {formAssets.length > 0 && (
                  <select aria-label="Asset" value={tForm.asset_id} onChange={(e) => setTForm((f) => ({ ...f, asset_id: e.target.value }))} className={itInput}>
                    <option value="">No asset</option>
                    {formAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" disabled={busy || !tForm.subject.trim()} onClick={handleAddTicket} className={itBtn}>
                  Open Ticket
                </button>
              </div>
              <textarea
                rows={2}
                placeholder="Details (optional)"
                value={tForm.description}
                onChange={(e) => setTForm((f) => ({ ...f, description: e.target.value }))}
                className={`${itSmall} mt-2 w-full`}
              />
              <div className="mt-1 text-xs text-text-muted">
                SLA for {PRIORITY_LABELS[tForm.priority]}: {SLA_TEXT[tForm.priority]}
                {tForm.client_id && activeContractFor(tForm.client_id) ? ` · Contract: ${activeContractFor(tForm.client_id)!.title}` : ""}
              </div>
            </div>

            {/* Queue filters */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(
                [
                  ["open", "Open"],
                  ["waiting", "Waiting"],
                  ["done", "Resolved & closed"],
                  ["all", "All"],
                ] as [QueueFilter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setQueue(k)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${queue === k ? "bg-white/15 text-text-primary" : "bg-white/5 text-text-muted hover:text-text-primary"}`}
                >
                  {label} ({counts[k]})
                </button>
              ))}
              <select aria-label="Filter by client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={itSmall}>
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select aria-label="Filter by priority" value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)} className={itSmall}>
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            {/* Queue */}
            {loading ? (
              <div className="text-sm text-text-muted">Loading…</div>
            ) : shown.length === 0 ? (
              <div className="text-sm text-text-muted">No tickets here.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {shown.map((t) => {
                  const sla = slaState(t, now);
                  const entries = timeByTicket.get(t.id) ?? [];
                  const mins = entries.reduce((s, e) => s + e.minutes, 0);
                  const isOpen = openId === t.id;
                  const contract = t.contract_id ? contractById.get(t.contract_id) : null;
                  return (
                    <div key={t.id} className={`rounded-xl bg-white/5 ${isOpen ? "ring-1 ring-[#f5d020]/60" : ""}`}>
                      <button type="button" onClick={() => openTicket(t)} className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-text-muted">{t.number}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_BADGE[t.priority]}`}>{t.priority.toUpperCase()}</span>
                            <span className="truncate text-sm font-medium text-text-primary">{t.subject}</span>
                          </div>
                          <div className="truncate text-xs text-text-muted">
                            {[
                              t.client_id ? clientById.get(t.client_id)?.name : "No client",
                              TICKET_TYPE_LABELS[t.ticket_type],
                              t.site_id ? siteById.get(t.site_id)?.name : null,
                              t.asset_id ? assetById.get(t.asset_id)?.name : null,
                              `opened ${fmtDateTime(t.opened_at)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          {sla && <span className={SLA_TONE[sla.tone]}>{sla.label}</span>}
                          {mins > 0 && <span className="text-text-muted">{fmtMinutes(mins)}</span>}
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-text-primary">{TICKET_STATUS_LABELS[t.status]}</span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-white/[0.08] px-3.5 py-3.5">
                          {/* Controls */}
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                            <select aria-label="Status" value={t.status} onChange={(e) => patchTicket(t, { status: e.target.value as TicketStatus })} className={itSmall}>
                              {TICKET_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {TICKET_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <select aria-label="Priority" value={t.priority} onChange={(e) => patchTicket(t, { priority: e.target.value as Priority })} className={itSmall}>
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {PRIORITY_LABELS[p]}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Contract"
                              value={t.contract_id ?? ""}
                              onChange={(e) => patchTicket(t, { contract_id: e.target.value || null })}
                              className={itSmall}
                            >
                              <option value="">No contract (default rate)</option>
                              {contracts
                                .filter((c) => c.client_id === t.client_id)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                    {c.active ? "" : " (inactive)"}
                                  </option>
                                ))}
                            </select>
                            <span className="text-text-muted">
                              Rate {money(rateFor(t))}/h
                              {t.first_response_at ? ` · responded ${fmtDateTime(t.first_response_at)}` : ""}
                              {t.resolved_at ? ` · resolved ${fmtDateTime(t.resolved_at)}` : ""}
                            </span>
                            <span className="flex-1" />
                            <button type="button" onClick={() => handleDeleteTicket(t)} className="text-[#ff5c7a] hover:underline">
                              Delete ticket
                            </button>
                            <button type="button" onClick={() => setOpenId(null)} className="text-text-muted hover:text-text-primary">
                              Close
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {/* Notes */}
                            <div className="rounded-lg bg-[#0f131c] p-3">
                              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Details</div>
                              <textarea
                                rows={3}
                                placeholder="Problem description"
                                value={notesForm.description}
                                onChange={(e) => setNotesForm((f) => ({ ...f, description: e.target.value }))}
                                className={`${itSmall} w-full`}
                              />
                              <textarea
                                rows={3}
                                placeholder="Resolution / what was done"
                                value={notesForm.resolution}
                                onChange={(e) => setNotesForm((f) => ({ ...f, resolution: e.target.value }))}
                                className={`${itSmall} mt-2 w-full`}
                              />
                              <button type="button" disabled={busy} onClick={() => handleSaveNotes(t)} className={`${itBtnSmall} mt-2`}>
                                Save notes
                              </button>
                            </div>

                            {/* Time */}
                            <div className="rounded-lg bg-[#0f131c] p-3">
                              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
                                <span>Time log</span>
                                <span className="normal-case">
                                  {fmtMinutes(mins)} worked · {fmtMinutes(entries.reduce((s, e) => s + billedMinutes(e.minutes), 0))} billed (15-min)
                                </span>
                              </div>
                              {entries.length > 0 && (
                                <div className="mb-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                                  {entries.map((e) => (
                                    <div key={e.id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5 text-xs">
                                      <div className="min-w-0">
                                        <span className="text-text-primary">{fmtDate(e.work_date)}</span>
                                        <span className="text-text-muted">
                                          {" "}
                                          · {fmtMinutes(e.minutes)}
                                          {billedMinutes(e.minutes) !== e.minutes ? ` → ${fmtMinutes(billedMinutes(e.minutes))}` : ""} · {WORK_TYPE_LABELS[e.work_type]}
                                        </span>
                                        {e.description && <span className="text-text-muted"> · {e.description}</span>}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        {e.invoice_id ? (
                                          <span className="text-[#c9a3ff]">invoiced</span>
                                        ) : e.covered ? (
                                          <span className="text-[#3ddc97]">covered</span>
                                        ) : !e.billable ? (
                                          <span className="text-text-muted">no charge</span>
                                        ) : (
                                          <span className="text-[#f5d020]">{money((billedMinutes(e.minutes) / 60) * rateFor(t))}</span>
                                        )}
                                        {!e.invoice_id && (
                                          <button type="button" onClick={() => handleDeleteTime(e)} className="text-[#ff5c7a] hover:underline">
                                            ×
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <select
                                  aria-label="Work type"
                                  value={timeForm.work_type}
                                  onChange={(e) => {
                                    const w = e.target.value as WorkType;
                                    setTimeForm((f) => ({ ...f, work_type: w, covered: contractCovers(contract, w) }));
                                  }}
                                  className={itSmall}
                                >
                                  {WORK_TYPES.map((w) => (
                                    <option key={w} value={w}>
                                      {WORK_TYPE_LABELS[w]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="What was done"
                                  value={timeForm.description}
                                  onChange={(e) => setTimeForm((f) => ({ ...f, description: e.target.value }))}
                                  className={`${itSmall} min-w-[140px] flex-1`}
                                />
                                {[15, 30, 60].map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleLogTime(t, m)}
                                    className="rounded bg-white/10 px-2 py-1.5 text-xs font-semibold text-text-primary hover:bg-white/15 disabled:opacity-60"
                                  >
                                    +{m === 60 ? "1h" : `${m}m`}
                                  </button>
                                ))}
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="min"
                                  aria-label="Custom minutes"
                                  value={timeForm.minutes}
                                  onChange={(e) => setTimeForm((f) => ({ ...f, minutes: e.target.value }))}
                                  className={`${itSmall} w-16`}
                                />
                                <button type="button" disabled={busy || !timeForm.minutes} onClick={() => handleLogTime(t)} className={itBtnSmall}>
                                  Log
                                </button>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                                <input
                                  type="date"
                                  aria-label="Work date"
                                  value={timeForm.work_date}
                                  onChange={(e) => setTimeForm((f) => ({ ...f, work_date: e.target.value }))}
                                  className={itSmall}
                                />
                                <label className="flex items-center gap-1">
                                  <input type="checkbox" checked={timeForm.billable} onChange={(e) => setTimeForm((f) => ({ ...f, billable: e.target.checked }))} />
                                  Billable
                                </label>
                                <label className="flex items-center gap-1" title="Included in the client's contract -- not billed separately">
                                  <input
                                    type="checkbox"
                                    checked={timeForm.covered}
                                    disabled={!timeForm.billable}
                                    onChange={(e) => setTimeForm((f) => ({ ...f, covered: e.target.checked }))}
                                  />
                                  Covered by contract
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* Parts */}
                          <div className="mt-4 rounded-lg bg-[#0f131c] p-3">
                            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Parts &amp; hardware</div>
                            {(partsByTicket.get(t.id) ?? []).map((p) => (
                              <div key={p.id} className="mb-1 flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5 text-xs">
                                <span className="text-text-primary">
                                  {num(p.quantity)} × {p.item}
                                  <span className="text-text-muted">
                                    {" "}
                                    · cost {money(num(p.unit_cost))} · sell {money(num(p.unit_price))} · margin{" "}
                                    {money(num(p.quantity) * (num(p.unit_price) - num(p.unit_cost)))}
                                  </span>
                                </span>
                                {p.invoice_id ? (
                                  <span className="text-[#c9a3ff]">invoiced</span>
                                ) : (
                                  <button type="button" onClick={() => handleDeletePart(p)} className="text-[#ff5c7a] hover:underline">
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input placeholder="Item" value={partForm.item} onChange={(e) => setPartForm((f) => ({ ...f, item: e.target.value }))} className={itSmall} />
                              <input
                                type="number"
                                min="1"
                                step="1"
                                aria-label="Quantity"
                                value={partForm.quantity}
                                onChange={(e) => setPartForm((f) => ({ ...f, quantity: e.target.value }))}
                                className={`${itSmall} w-14`}
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Your cost"
                                value={partForm.unit_cost}
                                onChange={(e) => setPartForm((f) => ({ ...f, unit_cost: e.target.value }))}
                                className={`${itSmall} w-24`}
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Sell price"
                                value={partForm.unit_price}
                                onChange={(e) => setPartForm((f) => ({ ...f, unit_price: e.target.value }))}
                                className={`${itSmall} w-24`}
                              />
                              <button type="button" disabled={busy || !partForm.item.trim()} onClick={() => handleAddPart(t)} className={itBtnSmall}>
                                Add part
                              </button>
                            </div>
                          </div>

                          {/* Billing */}
                          <div className="mt-4 rounded-lg bg-[#0f131c] p-3">
                            {(() => {
                              const u = unbilledForClient(t.client_id);
                              const clientName = t.client_id ? clientById.get(t.client_id)?.name ?? "client" : "no-client tickets";
                              const amountOf = (e: ItTimeEntry) => (billedMinutes(e.minutes) / 60) * rateFor(ticketById.get(e.ticket_id));
                              if (!billPick) {
                                const total = u.time.reduce((s, e) => s + amountOf(e), 0) + u.parts.reduce((s, p) => s + num(p.quantity) * num(p.unit_price), 0);
                                return (
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-sm text-text-primary">
                                      Unbilled for {clientName}: <span className="font-semibold text-[#f5d020]">{money(total)}</span>
                                      <span className="text-xs text-text-muted">
                                        {" "}
                                        ({u.time.length} time entr{u.time.length === 1 ? "y" : "ies"}, {u.parts.length} part{u.parts.length === 1 ? "" : "s"} across all their tickets)
                                      </span>
                                    </div>
                                    <button type="button" disabled={u.time.length + u.parts.length === 0} onClick={() => startBilling(t)} className={itBtn}>
                                      Create invoice
                                    </button>
                                  </div>
                                );
                              }
                              const total =
                                u.time.filter((e) => billPick.time.has(e.id)).reduce((s, e) => s + amountOf(e), 0) +
                                u.parts.filter((p) => billPick.parts.has(p.id)).reduce((s, p) => s + num(p.quantity) * num(p.unit_price), 0);
                              const toggle = (kind: "time" | "parts", id: string) =>
                                setBillPick((b) => {
                                  if (!b) return b;
                                  const next = new Set(b[kind]);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return { ...b, [kind]: next };
                                });
                              return (
                                <div>
                                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">New invoice for {clientName}</div>
                                  <div className="mb-3 flex flex-col gap-1 text-xs">
                                    {u.time.map((e) => {
                                      const tk = ticketById.get(e.ticket_id);
                                      return (
                                        <label key={e.id} className="flex items-center gap-2 text-text-primary">
                                          <input type="checkbox" checked={billPick.time.has(e.id)} onChange={() => toggle("time", e.id)} />
                                          {tk?.number} · {fmtDate(e.work_date)} · {fmtMinutes(e.minutes)} → {fmtMinutes(billedMinutes(e.minutes))} ·{" "}
                                          {WORK_TYPE_LABELS[e.work_type]} — {money(amountOf(e))}
                                        </label>
                                      );
                                    })}
                                    {u.parts.map((p) => (
                                      <label key={p.id} className="flex items-center gap-2 text-text-primary">
                                        <input type="checkbox" checked={billPick.parts.has(p.id)} onChange={() => toggle("parts", p.id)} />
                                        {ticketById.get(p.ticket_id)?.number} · {num(p.quantity)} × {p.item} — {money(num(p.quantity) * num(p.unit_price))}
                                      </label>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-text-muted">
                                      Due
                                      <input type="date" value={billPick.due} onChange={(e) => setBillPick((b) => (b ? { ...b, due: e.target.value } : b))} className={itSmall} />
                                    </label>
                                    <input
                                      placeholder="Notes on invoice (optional)"
                                      value={billPick.notes}
                                      onChange={(e) => setBillPick((b) => (b ? { ...b, notes: e.target.value } : b))}
                                      className={`${itSmall} min-w-[240px] flex-1`}
                                    />
                                    <span className="text-sm font-semibold text-text-primary">{money(total)}</span>
                                    <button type="button" disabled={busy || total <= 0} onClick={() => handleCreateInvoice(t)} className={itBtnSmall}>
                                      {busy ? "Creating…" : "Create draft invoice"}
                                    </button>
                                    <button type="button" onClick={() => setBillPick(null)} className="text-xs text-text-muted hover:text-text-primary">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div id="it-invoices" className="scroll-mt-24">
        <InvoicesPanel
          loading={loading}
          invoices={invoices}
          lines={lines}
          clients={clients}
          projectNameById={() => null}
          from={{ name: businessName, lines: [userEmail], logo: logoDataUrl }}
          businessId={businessId}
          onLogoChange={onLogoChange}
          onChanged={reload}
          onError={setMessage}
        />
      </div>
    </div>
  );
}
