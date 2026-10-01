"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import {
  addAttendee,
  addSession,
  deleteAttendee,
  deleteSession,
  fetchAttendees,
  fetchSessions,
  updateAttendee,
  updateAttendeePaid,
  updateSessionStatus,
} from "@/lib/business/sessionQueries";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  SESSION_STATUSES,
  SESSION_STATUS_LABELS,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  defaultPaymentType,
  type BusinessSession,
  type PaymentMethod,
  type PaymentType,
  type SessionAttendee,
  type SessionStatus,
  type SessionType,
} from "@/lib/business/sessionTypes";
import type { BusinessClient } from "@/lib/business/types";

// Sessions for class-based businesses (Yoga Instructor, Fitness / Personal
// Trainer): one session -- group class, private, or workshop -- holds MANY
// clients, each with their own payment (drop-in, class pass, private, ...).
// Replaces the one-client-per-job Jobs board for these categories.

const inputClass = "rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";
const smallInput = "rounded border border-card-border bg-[#0f131c] px-2 py-1.5 text-xs text-text-primary outline-none";
const NEW_CLIENT = "__new__";

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { weekday: "short", dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions);
  } catch {
    try {
      return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }
}
// Class passes and comps don't bring in money per class.
function defaultAmount(type: PaymentType, sessionPrice: number | null): string {
  if (type === "class_pass" || type === "comp") return "0";
  return sessionPrice != null ? String(sessionPrice) : "";
}

const TYPE_BADGE: Record<SessionType, string> = {
  group_class: "bg-[#4f8cff]/15 text-[#7aa8ff]",
  private: "bg-[#b07aff]/15 text-[#c9a3ff]",
  workshop: "bg-[#f5d020]/15 text-[#f5d020]",
};

type AttendeeForm = {
  clientChoice: string;
  newName: string;
  payment_type: PaymentType;
  payment_method: string;
  amount: string;
  paid: boolean;
};

export default function ClassSessions({
  userId,
  businessId,
  clients,
}: {
  userId: string;
  businessId: string;
  clients: BusinessClient[];
}) {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<BusinessSession[]>([]);
  const [attendees, setAttendees] = useState<SessionAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [openId, setOpenId] = useState<string | null>(null);
  // Weekly planner: offset in weeks from the current week (Sunday start).
  const [weekOffset, setWeekOffset] = useState(0);

  const [form, setForm] = useState({
    session_type: "group_class" as SessionType,
    title: "",
    start_at: "",
    location: "",
    capacity: "",
    price: "",
  });
  const [adding, setAdding] = useState(false);
  const [attForm, setAttForm] = useState<AttendeeForm>({
    clientChoice: "",
    newName: "",
    payment_type: "drop_in",
    payment_method: "",
    amount: "",
    paid: false,
  });
  const [addingAtt, setAddingAtt] = useState(false);
  // Inline edit of one roster line.
  const [editAttId, setEditAttId] = useState<string | null>(null);
  const [attEdit, setAttEdit] = useState({ name: "", payment_type: "drop_in" as PaymentType, payment_method: "", amount: "", paid: true });
  const [savingAtt, setSavingAtt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([fetchSessions(supabase, businessId), fetchAttendees(supabase, businessId)]).then(([s, a]) => {
      if (cancelled) return;
      setSessions(s);
      setAttendees(a);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const rosterBySession = useMemo(() => {
    const map = new Map<string, SessionAttendee[]>();
    for (const a of attendees) {
      const list = map.get(a.session_id) ?? [];
      list.push(a);
      map.set(a.session_id, list);
    }
    return map;
  }, [attendees]);

  // Page-load time: a session drops to "Past" 3h after it starts.
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(
    () => sessions.filter((s) => s.status === "scheduled" && new Date(s.start_at).getTime() >= now - 3 * 3600_000),
    [sessions, now]
  );
  const past = useMemo(
    () =>
      sessions
        .filter((s) => !upcoming.includes(s))
        .slice()
        .sort((a, b) => b.start_at.localeCompare(a.start_at)),
    [sessions, upcoming]
  );
  const shown = view === "upcoming" ? upcoming : past;

  // This month at a glance.
  const monthStats = useMemo(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const monthSessions = sessions.filter((s) => {
      const t = new Date(s.start_at).getTime();
      return t >= start && t < end && s.status !== "cancelled";
    });
    const ids = new Set(monthSessions.map((s) => s.id));
    const rows = attendees.filter((a) => ids.has(a.session_id));
    const collected = rows.filter((a) => a.paid).reduce((sum, a) => sum + Number(a.amount), 0);
    const unpaid = rows.filter((a) => !a.paid).reduce((sum, a) => sum + Number(a.amount), 0);
    return { sessions: monthSessions.length, attendees: rows.length, collected, unpaid };
  }, [sessions, attendees]);

  // 7 days of the selected week, each with its sessions (time order).
  const week = useMemo(() => {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - base.getDay() + weekOffset * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
    const end = new Date(base);
    end.setDate(base.getDate() + 7);
    const byDay: BusinessSession[][] = days.map(() => []);
    for (const s of sessions) {
      const t = new Date(s.start_at);
      if (t < base || t >= end) continue;
      byDay[t.getDay()].push(s);
    }
    for (const list of byDay) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return { days, byDay, start: base, end };
  }, [sessions, weekOffset, now]);

  const todayKey = new Date(now).toDateString();

  // Planner click: show the session in the list below with its roster open.
  function focusSession(s: BusinessSession) {
    setView(upcoming.includes(s) ? "upcoming" : "past");
    if (openId !== s.id) openRoster(s);
    setTimeout(() => document.getElementById(`session-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function openRoster(s: BusinessSession) {
    if (openId === s.id) {
      setOpenId(null);
      return;
    }
    setOpenId(s.id);
    const pt = defaultPaymentType(s.session_type);
    setAttForm({
      clientChoice: "",
      newName: "",
      payment_type: pt,
      payment_method: "",
      amount: defaultAmount(pt, s.default_price == null ? null : Number(s.default_price)),
      // New attendees start Unpaid -- mark Paid once the money is in.
      paid: false,
    });
  }

  async function handleAddSession() {
    if (adding || !form.title.trim() || !form.start_at) return;
    setAdding(true);
    setMessage(null);
    const { session, error } = await addSession(createClient(), userId, businessId, {
      session_type: form.session_type,
      title: form.title.trim(),
      start_at: new Date(form.start_at).toISOString(),
      location: form.location.trim() || null,
      capacity: form.capacity.trim() ? Math.max(1, Math.floor(Number(form.capacity))) : null,
      default_price: form.price.trim() ? Number(form.price) : null,
    });
    setAdding(false);
    if (error || !session) {
      setMessage("Could not add that session. Please try again.");
      return;
    }
    setSessions((rows) => [...rows, session].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setForm((f) => ({ ...f, title: "", start_at: "" }));
    setView("upcoming");
  }

  async function handleStatus(s: BusinessSession, status: SessionStatus) {
    const prev = sessions;
    setSessions((rows) => rows.map((r) => (r.id === s.id ? { ...r, status } : r)));
    const { error } = await updateSessionStatus(createClient(), s.id, status);
    if (error) {
      setSessions(prev);
      setMessage("Could not update that session. Please try again.");
    }
  }

  async function handleDeleteSession(s: BusinessSession) {
    const count = rosterBySession.get(s.id)?.length ?? 0;
    const extra = count ? ` Its roster of ${count} and their payments will be removed too.` : "";
    if (!(await confirm({ message: `Remove "${s.title}"?${extra}`, danger: true }))) return;
    const { error } = await deleteSession(createClient(), s.id);
    if (error) {
      setMessage("Could not remove that session. Please try again.");
      return;
    }
    setSessions((rows) => rows.filter((r) => r.id !== s.id));
    setAttendees((rows) => rows.filter((r) => r.session_id !== s.id));
    if (openId === s.id) setOpenId(null);
  }

  async function handleAddAttendee(s: BusinessSession) {
    if (addingAtt) return;
    const isNew = attForm.clientChoice === NEW_CLIENT;
    const client = isNew ? null : clients.find((c) => c.id === attForm.clientChoice) ?? null;
    const name = isNew ? attForm.newName.trim() : client?.name ?? "";
    if (!name) return;
    const amount = attForm.amount.trim() ? Number(attForm.amount) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Amount must be zero or more.");
      return;
    }
    setAddingAtt(true);
    setMessage(null);
    const { attendee, error } = await addAttendee(createClient(), userId, businessId, {
      session_id: s.id,
      client_id: client?.id ?? null,
      client_name: name,
      payment_type: attForm.payment_type,
      payment_method: (attForm.payment_method || null) as PaymentMethod | null,
      amount,
      paid: attForm.paid,
    });
    setAddingAtt(false);
    if (error || !attendee) {
      setMessage("Could not add that client to the session. Please try again.");
      return;
    }
    setAttendees((rows) => [...rows, attendee]);
    setAttForm((f) => ({ ...f, clientChoice: "", newName: "", paid: false }));
  }

  // Linked clients always show their current name from the Clients list.
  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const displayName = (a: SessionAttendee) => (a.client_id && clientNameById.get(a.client_id)) || a.client_name;

  function startEditAttendee(a: SessionAttendee) {
    setEditAttId(a.id);
    setAttEdit({
      name: displayName(a),
      payment_type: a.payment_type,
      payment_method: a.payment_method ?? "",
      amount: String(Number(a.amount)),
      paid: a.paid,
    });
  }

  async function handleSaveAttendee(a: SessionAttendee) {
    if (savingAtt) return;
    const amount = attEdit.amount.trim() ? Number(attEdit.amount) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Amount must be zero or more.");
      return;
    }
    const name = a.client_id ? displayName(a) : attEdit.name.trim();
    if (!name) return;
    setSavingAtt(true);
    setMessage(null);
    const { attendee, error } = await updateAttendee(createClient(), a.id, {
      client_name: name,
      payment_type: attEdit.payment_type,
      payment_method: (attEdit.payment_method || null) as PaymentMethod | null,
      amount,
      paid: attEdit.paid,
    });
    setSavingAtt(false);
    if (error || !attendee) {
      setMessage("Could not save that line. Please try again.");
      return;
    }
    setAttendees((rows) => rows.map((r) => (r.id === a.id ? attendee : r)));
    setEditAttId(null);
  }

  async function togglePaid(a: SessionAttendee) {
    const prev = attendees;
    setAttendees((rows) => rows.map((r) => (r.id === a.id ? { ...r, paid: !a.paid } : r)));
    const { error } = await updateAttendeePaid(createClient(), a.id, !a.paid);
    if (error) {
      setAttendees(prev);
      setMessage("Could not update that payment. Please try again.");
    }
  }

  async function handleRemoveAttendee(a: SessionAttendee) {
    if (!(await confirm({ message: `Remove ${displayName(a)} from this session?`, danger: true }))) return;
    const { error } = await deleteAttendee(createClient(), a.id);
    if (error) {
      setMessage("Could not remove that client. Please try again.");
      return;
    }
    setAttendees((rows) => rows.filter((r) => r.id !== a.id));
  }

  const showCapacity = form.session_type !== "private";

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Classes &amp; Sessions</h4>

      {message && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{message}</div>}

      {/* This month */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { k: "Sessions this month", v: String(monthStats.sessions) },
          { k: "Collected", v: money(monthStats.collected), color: "text-[#3ddc97]" },
          { k: "Unpaid", v: money(monthStats.unpaid), color: monthStats.unpaid > 0 ? "text-[#ff5c7a]" : undefined },
        ].map((t) => (
          <div key={t.k} className="rounded-xl bg-white/5 p-3">
            <div className="text-xs text-text-muted">{t.k}</div>
            <div className={`mt-0.5 text-lg font-semibold ${t.color ?? "text-text-primary"}`}>{loading ? "…" : t.v}</div>
          </div>
        ))}
      </div>

      {/* Add session */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          aria-label="Session type"
          value={form.session_type}
          onChange={(e) => setForm((f) => ({ ...f, session_type: e.target.value as SessionType }))}
          className={inputClass}
        >
          {SESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {SESSION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          placeholder={form.session_type === "private" ? "Session title (e.g. Private - Kyle)" : "Class title (e.g. Vinyasa Flow)"}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className={inputClass}
        />
        <input
          type="datetime-local"
          aria-label="Date and time"
          value={form.start_at}
          onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
          className={inputClass}
        />
        <input
          placeholder="Location (optional)"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          className={inputClass}
        />
        {showCapacity && (
          <input
            type="number"
            min="1"
            placeholder="Max spots (optional)"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            className={`${inputClass} w-40`}
          />
        )}
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder={form.session_type === "private" ? "Rate ($)" : "Price per person ($)"}
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          className={`${inputClass} w-44`}
        />
        <button
          type="button"
          disabled={adding || !form.title.trim() || !form.start_at}
          onClick={handleAddSession}
          className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add Session"}
        </button>
      </div>

      {/* Weekly planner */}
      <div className="mb-5 rounded-xl bg-white/[0.03] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-text-primary">
            {week.start.toLocaleDateString([], { month: "short", day: "numeric" })} –{" "}
            {new Date(week.end.getTime() - 86_400_000).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded-md bg-white/5 px-2.5 py-1 text-text-primary hover:bg-white/10"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
              className="rounded-md bg-white/5 px-2.5 py-1 text-text-primary hover:bg-white/10 disabled:opacity-50"
            >
              This week
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-md bg-white/5 px-2.5 py-1 text-text-primary hover:bg-white/10"
            >
              Next ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {week.days.map((d, i) => {
            const isToday = d.toDateString() === todayKey;
            const list = week.byDay[i];
            return (
              <div
                key={d.toISOString()}
                className={`min-h-[110px] rounded-lg p-2 ${isToday ? "bg-[#f5d020]/[0.08] ring-1 ring-[#f5d020]/40" : "bg-white/5"}`}
              >
                <div className={`mb-1.5 text-xs font-semibold ${isToday ? "text-[#f5d020]" : "text-text-muted"}`}>
                  {d.toLocaleDateString([], { weekday: "short" })} {d.getDate()}
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.map((s) => {
                    const roster = rosterBySession.get(s.id) ?? [];
                    const owed = roster.some((a) => !a.paid);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => focusSession(s)}
                        className={`rounded-md px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-125 ${TYPE_BADGE[s.session_type]} ${
                          s.status === "cancelled" ? "line-through opacity-60" : ""
                        }`}
                        title={`${s.title} -- ${SESSION_TYPE_LABELS[s.session_type]}`}
                      >
                        <div className="font-semibold">
                          {new Date(s.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                        <div className="truncate">{s.title}</div>
                        <div className="opacity-80">
                          {roster.length}
                          {s.capacity != null ? `/${s.capacity}` : ""} {owed ? "· $ owed" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming / Past */}
      <div className="mb-3 flex gap-2">
        {(["upcoming", "past"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              view === v ? "bg-[#f5d020] text-[#0f131c]" : "bg-white/5 text-text-muted hover:text-text-primary"
            }`}
          >
            {v === "upcoming" ? `Upcoming (${upcoming.length})` : `Past & cancelled (${past.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="text-sm text-text-muted">
          {view === "upcoming" ? "No upcoming sessions. Add one above." : "No past sessions yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((s) => {
            const roster = rosterBySession.get(s.id) ?? [];
            const collected = roster.filter((a) => a.paid).reduce((sum, a) => sum + Number(a.amount), 0);
            const unpaid = roster.filter((a) => !a.paid).reduce((sum, a) => sum + Number(a.amount), 0);
            const full = s.capacity != null && roster.length >= s.capacity;
            const open = openId === s.id;
            const sessionPrice = s.default_price == null ? null : Number(s.default_price);
            return (
              <div key={s.id} id={`session-${s.id}`} className="scroll-mt-24 rounded-xl bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[s.session_type]}`}>
                        {SESSION_TYPE_LABELS[s.session_type]}
                      </span>
                      <span className="truncate text-sm font-medium text-text-primary">{s.title}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-text-muted">
                      {fmtDateTime(s.start_at)}
                      {s.location ? ` · ${s.location}` : ""}
                      {sessionPrice != null ? ` · ${money(sessionPrice)}${s.session_type === "private" ? "" : "/person"}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className={full ? "font-semibold text-[#f5d020]" : "text-text-muted"}>
                      {roster.length}
                      {s.capacity != null ? ` / ${s.capacity}` : ""} {roster.length === 1 ? "client" : "clients"}
                      {full ? " · Full" : ""}
                    </span>
                    <span className="text-[#3ddc97]">{money(collected)}</span>
                    {unpaid > 0 && <span className="text-[#ff5c7a]">{money(unpaid)} unpaid</span>}
                    <select
                      aria-label={`${s.title} status`}
                      value={s.status}
                      onChange={(e) => handleStatus(s, e.target.value as SessionStatus)}
                      className={smallInput}
                    >
                      {SESSION_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {SESSION_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => openRoster(s)} className="font-semibold text-[#f5d020] hover:underline">
                      {open ? "Close roster" : "Roster"}
                    </button>
                    <button type="button" onClick={() => handleDeleteSession(s)} className="text-[#ff5c7a] hover:underline">
                      Remove
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-white/[0.08] px-3.5 py-3">
                    {roster.length === 0 ? (
                      <div className="mb-3 text-xs text-text-muted">No clients in this session yet.</div>
                    ) : (
                      <div className="mb-3 overflow-x-auto">
                        <table className="w-full min-w-[520px] border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/10 text-left uppercase text-text-muted">
                              <th className="py-1.5 pr-3">Client</th>
                              <th className="py-1.5 pr-3">Type</th>
                              <th className="py-1.5 pr-3">Method</th>
                              <th className="py-1.5 pr-3 text-right">Amount</th>
                              <th className="py-1.5 pr-3">Status</th>
                              <th className="py-1.5" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {roster.map((a) =>
                              editAttId === a.id ? (
                                <tr key={a.id} className="bg-white/[0.03]">
                                  <td className="py-1.5 pr-3">
                                    {a.client_id ? (
                                      <span className="text-text-primary" title="Rename linked clients in the Clients list">
                                        {displayName(a)}
                                      </span>
                                    ) : (
                                      <input
                                        aria-label="Name"
                                        value={attEdit.name}
                                        onChange={(e) => setAttEdit((f) => ({ ...f, name: e.target.value }))}
                                        className={`${smallInput} w-32`}
                                      />
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <select
                                      aria-label="Payment type"
                                      value={attEdit.payment_type}
                                      onChange={(e) => setAttEdit((f) => ({ ...f, payment_type: e.target.value as PaymentType }))}
                                      className={smallInput}
                                    >
                                      {PAYMENT_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {PAYMENT_TYPE_LABELS[t]}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <select
                                      aria-label="Payment method"
                                      value={attEdit.payment_method}
                                      onChange={(e) => setAttEdit((f) => ({ ...f, payment_method: e.target.value }))}
                                      className={smallInput}
                                    >
                                      <option value="">—</option>
                                      {PAYMENT_METHODS.map((m) => (
                                        <option key={m} value={m}>
                                          {PAYMENT_METHOD_LABELS[m]}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      aria-label="Amount"
                                      value={attEdit.amount}
                                      onChange={(e) => setAttEdit((f) => ({ ...f, amount: e.target.value }))}
                                      className={`${smallInput} w-24 text-right`}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <select
                                      aria-label="Paid status"
                                      value={attEdit.paid ? "paid" : "unpaid"}
                                      onChange={(e) => setAttEdit((f) => ({ ...f, paid: e.target.value === "paid" }))}
                                      className={smallInput}
                                    >
                                      <option value="paid">Paid</option>
                                      <option value="unpaid">Unpaid</option>
                                    </select>
                                  </td>
                                  <td className="whitespace-nowrap py-1.5 text-right">
                                    <button
                                      type="button"
                                      disabled={savingAtt || (!a.client_id && !attEdit.name.trim())}
                                      onClick={() => handleSaveAttendee(a)}
                                      className="mr-2 rounded bg-[#f5d020] px-2 py-1 font-semibold text-[#0f131c] disabled:opacity-60"
                                    >
                                      {savingAtt ? "Saving…" : "Save"}
                                    </button>
                                    <button type="button" onClick={() => setEditAttId(null)} className="text-text-muted hover:text-text-primary">
                                      Cancel
                                    </button>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={a.id}>
                                  <td className="py-1.5 pr-3 text-text-primary">{displayName(a)}</td>
                                  <td className="py-1.5 pr-3 text-text-muted">{PAYMENT_TYPE_LABELS[a.payment_type]}</td>
                                  <td className="py-1.5 pr-3 text-text-muted">
                                    {a.payment_method ? PAYMENT_METHOD_LABELS[a.payment_method] : "—"}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right text-text-primary">{money(Number(a.amount))}</td>
                                  <td className="py-1.5 pr-3">
                                    <button
                                      type="button"
                                      onClick={() => togglePaid(a)}
                                      className={`rounded-full px-2 py-0.5 font-semibold ${
                                        a.paid ? "bg-[#3ddc97]/15 text-[#3ddc97]" : "bg-[#ff5c7a]/15 text-[#ff5c7a]"
                                      }`}
                                      title="Tap to toggle paid / unpaid"
                                    >
                                      {a.paid ? "Paid" : "Unpaid"}
                                    </button>
                                  </td>
                                  <td className="whitespace-nowrap py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => startEditAttendee(a)}
                                      className="mr-3 font-semibold text-[#f5d020] hover:underline"
                                    >
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => handleRemoveAttendee(a)} className="text-[#ff5c7a] hover:underline">
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {full ? (
                      <div className="text-xs text-[#f5d020]">Session is full ({s.capacity} spots).</div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Client"
                          value={attForm.clientChoice}
                          onChange={(e) => setAttForm((f) => ({ ...f, clientChoice: e.target.value }))}
                          className={smallInput}
                        >
                          <option value="">Choose client…</option>
                          {clients
                            .filter((c) => !roster.some((a) => a.client_id === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          <option value={NEW_CLIENT}>+ Walk-in / new name</option>
                        </select>
                        {attForm.clientChoice === NEW_CLIENT && (
                          <input
                            placeholder="Name"
                            value={attForm.newName}
                            onChange={(e) => setAttForm((f) => ({ ...f, newName: e.target.value }))}
                            className={smallInput}
                          />
                        )}
                        <select
                          aria-label="Payment type"
                          value={attForm.payment_type}
                          onChange={(e) => {
                            const pt = e.target.value as PaymentType;
                            setAttForm((f) => ({ ...f, payment_type: pt, amount: defaultAmount(pt, sessionPrice) }));
                          }}
                          className={smallInput}
                        >
                          {PAYMENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {PAYMENT_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Payment method"
                          value={attForm.payment_method}
                          onChange={(e) => setAttForm((f) => ({ ...f, payment_method: e.target.value }))}
                          className={smallInput}
                        >
                          <option value="">Method…</option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {PAYMENT_METHOD_LABELS[m]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label="Amount"
                          placeholder="Amount ($)"
                          value={attForm.amount}
                          onChange={(e) => setAttForm((f) => ({ ...f, amount: e.target.value }))}
                          className={`${smallInput} w-28`}
                        />
                        <select
                          aria-label="Paid status"
                          value={attForm.paid ? "paid" : "unpaid"}
                          onChange={(e) => setAttForm((f) => ({ ...f, paid: e.target.value === "paid" }))}
                          className={smallInput}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                        <button
                          type="button"
                          disabled={
                            addingAtt ||
                            !attForm.clientChoice ||
                            (attForm.clientChoice === NEW_CLIENT && !attForm.newName.trim())
                          }
                          onClick={() => handleAddAttendee(s)}
                          className="rounded bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60"
                        >
                          {addingAtt ? "Adding…" : "Add to session"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
