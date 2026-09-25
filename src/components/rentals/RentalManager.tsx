"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_RENTAL_DATA,
  deleteRow,
  fetchRentalData,
  insertRows,
  updateRow,
  type RentalTable,
} from "@/lib/rentals/queries";
import {
  buildIndex,
  buildYearCsv,
  computeSummary,
  computeYearReport,
  formatPeriod,
  leaseBalance,
  localToday,
  money,
  num,
  periodOf,
  planLateFees,
  planRentPosting,
} from "@/lib/rentals/calc";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  LEDGER_KIND_LABELS,
  MAINT_PRIORITIES,
  MAINT_STATUSES,
  MAINT_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  CHARGE_KINDS,
  type ExpenseCategory,
  type LedgerKind,
  type MaintPriority,
  type MaintStatus,
  type PaymentMethod,
  type RentalData,
  type RentalExpense,
  type RentalLease,
  type RentalLedgerEntry,
  type RentalMaintenance,
  type RentalProperty,
  type RentalUnit,
} from "@/lib/rentals/types";

// Rental Property module -- shown inside My Business when the business is
// "Property Management (Small Scale)". Core small-landlord workflow only:
// properties & units, tenants & leases, rent ledger (monthly rent posting +
// automatic late fees + payments), maintenance tickets, expenses, and a
// cash-basis year report with a CSV export for tax time. Everything is
// manual record-keeping (no payment processor, screening or listing
// integrations), so it runs at $0.

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "properties", label: "Properties & Units" },
  { key: "leases", label: "Tenants & Leases" },
  { key: "ledger", label: "Rent Ledger" },
  { key: "maintenance", label: "Maintenance" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "Reports" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const inputClass =
  "rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";
const btnClass =
  "rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60";
const cardClass = "rounded-2xl border border-card-border bg-card-bg p-5";
const h4Class =
  "mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted";
const rowClass =
  "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5";
const removeBtn = "text-xs text-[#ff5c7a] hover:underline";

function optNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-[#f5d020]"
      : tone === "bad"
        ? "text-[#ff5c7a]"
        : "text-text-primary";
  return (
    <div className="rounded-xl bg-white/5 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function Empty({ text, goLabel, onGo }: { text: string; goLabel?: string; onGo?: () => void }) {
  return (
    <div className="text-sm text-text-muted">
      {text}{" "}
      {onGo && (
        <button type="button" onClick={onGo} className="font-semibold text-[#4f8cff] hover:underline">
          {goLabel}
        </button>
      )}
    </div>
  );
}

// Small centered dialog for the ledger forms: Esc or a backdrop click closes it.
function Modal({
  title,
  error,
  onClose,
  children,
}: {
  title: string;
  error?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-[#ff5c7a]/10 px-3 py-2 text-xs text-[#ff5c7a]">{error}</div>}
        {children}
      </div>
    </div>
  );
}

export default function RentalManager({
  userId,
  businessId,
}: {
  userId: string;
  businessId: string;
}) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabKey>("overview");
  const [data, setData] = useState<RentalData>(EMPTY_RENTAL_DATA);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const today = localToday();

  const applyLoad = useCallback((d: RentalData, error: string | null) => {
    if (error) {
      setMessage({
        text: /does not exist|schema cache/i.test(error)
          ? "Rental tables aren't set up yet -- ask your App Director to run the rental-property SQL."
          : "Could not load rental data. Please refresh.",
        ok: false,
      });
    }
    setData(d);
    setLoading(false);
  }, []);

  const reload = useCallback(async () => {
    const { data: d, error } = await fetchRentalData(createClient(), businessId);
    applyLoad(d, error);
  }, [businessId, applyLoad]);

  // Parent remounts this per business (key=business id), so the initial
  // loading=true state covers the first load.
  useEffect(() => {
    let cancelled = false;
    fetchRentalData(createClient(), businessId).then(({ data: d, error }) => {
      if (!cancelled) applyLoad(d, error);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, applyLoad]);

  const idx = useMemo(() => buildIndex(data), [data]);
  const summary = useMemo(() => computeSummary(data, today), [data, today]);

  const flash = (text: string, ok = true) => setMessage({ text, ok });

  async function add<T>(
    table: RentalTable,
    row: Record<string, unknown>,
    key: keyof RentalData,
    okText: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    const { rows, error } = await insertRows<T>(createClient(), table, [
      { ...row, user_id: userId },
    ]);
    setBusy(false);
    if (error || rows.length === 0) {
      flash(
        error && /does not exist|schema cache/i.test(error)
          ? "Rental tables aren't set up yet -- ask your App Director to run the rental-property SQL."
          : "That didn't save. Check the fields and try again.",
        false,
      );
      return false;
    }
    setData((d) => ({ ...d, [key]: [...(d[key] as unknown as T[]), ...rows] }));
    flash(okText);
    return true;
  }

  async function remove(
    table: RentalTable,
    id: string,
    key: keyof RentalData,
    what: string,
    cascades?: string,
  ) {
    if (
      !(await confirm({
        message: `Remove ${what}?${cascades ? ` This also removes ${cascades}.` : ""} This can't be undone.`,
        danger: true,
      }))
    )
      return;
    const { error } = await deleteRow(createClient(), table, id);
    if (error) {
      flash("Could not remove that. Please try again.", false);
      return;
    }
    if (cascades) {
      await reload();
    } else {
      setData((d) => ({
        ...d,
        [key]: (d[key] as unknown as { id: string }[]).filter(
          (r) => r.id !== id,
        ),
      }));
    }
  }

  // ---------------- Overview actions ----------------
  const [postPeriod, setPostPeriod] = useState(periodOf(today));

  async function postRent() {
    const rows = planRentPosting(data, postPeriod);
    if (rows.length === 0) {
      flash(
        `Rent for ${formatPeriod(postPeriod)} is already posted for every active lease.`,
      );
      return;
    }
    setBusy(true);
    const { rows: added, error } = await insertRows<RentalLedgerEntry>(
      createClient(),
      "rental_ledger",
      rows.map((r) => ({ ...r, user_id: userId })),
    );
    setBusy(false);
    if (error) {
      flash("Could not post rent. Refresh and try again.", false);
      return;
    }
    setData((d) => ({ ...d, ledger: [...added, ...d.ledger] }));
    flash(
      `Posted ${formatPeriod(postPeriod)} rent for ${added.length} lease${added.length === 1 ? "" : "s"}.`,
    );
  }

  async function applyLateFees() {
    const rows = planLateFees(data, today);
    if (rows.length === 0) {
      flash("No late fees due -- everyone paid within their grace period.");
      return;
    }
    const total = rows.reduce((s, r) => s + num(r.amount as number), 0);
    if (
      !(await confirm({
        message: `Add ${rows.length} late fee${rows.length === 1 ? "" : "s"} totaling ${money(total)}?`,
      }))
    )
      return;
    setBusy(true);
    const { rows: added, error } = await insertRows<RentalLedgerEntry>(
      createClient(),
      "rental_ledger",
      rows.map((r) => ({ ...r, user_id: userId })),
    );
    setBusy(false);
    if (error) {
      flash("Could not add late fees. Refresh and try again.", false);
      return;
    }
    setData((d) => ({ ...d, ledger: [...added, ...d.ledger] }));
    flash(`Added ${added.length} late fee${added.length === 1 ? "" : "s"}.`);
  }

  // ---------------- Forms ----------------
  const [propForm, setPropForm] = useState({ name: "", address: "" });
  const [unitForm, setUnitForm] = useState({
    property_id: "",
    label: "",
    bedrooms: "",
    bathrooms: "",
    market_rent: "",
  });
  const emptyLease = {
    unit_id: "",
    tenant_name: "",
    tenant_email: "",
    tenant_phone: "",
    start_date: today,
    end_date: "",
    rent_amount: "",
    due_day: "1",
    deposit: "",
    late_fee: "",
    grace_days: "5",
  };
  const [leaseForm, setLeaseForm] = useState(emptyLease);
  const [payForm, setPayForm] = useState({
    lease_id: "",
    entry_date: today,
    amount: "",
    method: "ach" as PaymentMethod,
    memo: "",
  });
  const [chargeForm, setChargeForm] = useState({
    lease_id: "",
    entry_date: today,
    kind: "other_charge" as LedgerKind,
    amount: "",
    memo: "",
  });
  const [ledgerFilter, setLedgerFilter] = useState("");
  const [ledgerModal, setLedgerModal] = useState<"payment" | "charge" | null>(null);
  // Inline edit of one ledger row (date, tenant, amount, method, memo).
  // Type stays fixed: rent/late fees belong to a month, and switching a
  // payment into a charge would silently flip the balance.
  const [editEntry, setEditEntry] = useState<{
    id: string;
    lease_id: string;
    entry_date: string;
    charge: string;
    paid: string;
    method: PaymentMethod | "";
    memo: string;
  } | null>(null);

  async function saveEntry() {
    if (!editEntry || busy) return;
    const orig = data.ledger.find((x) => x.id === editEntry.id);
    if (!orig) return;
    const charge = optNum(editEntry.charge) ?? 0;
    const paid = optNum(editEntry.paid) ?? 0;
    if (!editEntry.entry_date || charge < 0 || paid < 0 || (charge > 0) === (paid > 0)) {
      flash("Enter a date and an amount in either Charge or Paid / Credit (not both).", false);
      return;
    }
    // Moving the amount between columns changes the entry type: rent and
    // late fees can only be charges; a charge moved to Paid becomes a
    // credit (or stays a payment); a payment/credit moved to Charge becomes
    // an "other charge".
    let kind: LedgerKind = orig.kind;
    if (charge > 0 && !CHARGE_KINDS.includes(orig.kind)) kind = "other_charge";
    if (paid > 0 && CHARGE_KINDS.includes(orig.kind)) {
      if (orig.kind === "rent" || orig.kind === "late_fee") {
        flash("Rent and late fees are charges -- use Charge, or add a credit to reduce them.", false);
        return;
      }
      kind = "credit";
    }
    const amount = charge > 0 ? charge : paid;
    setBusy(true);
    const { row, error } = await updateRow<RentalLedgerEntry>(
      createClient(),
      "rental_ledger",
      editEntry.id,
      {
        lease_id: editEntry.lease_id,
        entry_date: editEntry.entry_date,
        kind,
        amount,
        method: kind === "payment" ? editEntry.method || null : null,
        memo: editEntry.memo.trim() || null,
      },
    );
    setBusy(false);
    if (error || !row) {
      flash(
        error && /duplicate|unique/i.test(error)
          ? "That tenant already has this month's rent or late fee -- edit that entry instead."
          : "Could not save that entry. Please try again.",
        false,
      );
      return;
    }
    setData((d) => ({
      ...d,
      ledger: d.ledger.map((x) => (x.id === row.id ? row : x)),
    }));
    setEditEntry(null);
    flash("Entry updated.");
  }
  const [maintForm, setMaintForm] = useState({
    unit_id: "",
    title: "",
    priority: "normal" as MaintPriority,
    vendor: "",
    details: "",
  });
  const [expForm, setExpForm] = useState({
    property_id: "",
    expense_date: today,
    category: "repairs" as ExpenseCategory,
    amount: "",
    vendor: "",
    memo: "",
  });
  const [year, setYear] = useState(today.slice(0, 4));

  const activeLeases = useMemo(
    () => data.leases.filter((l) => l.status === "active"),
    [data.leases],
  );

  async function endLease(l: RentalLease) {
    if (
      !(await confirm({
        message: `End ${l.tenant_name}'s lease as of today? No more rent will be posted for it.`,
      }))
    )
      return;
    const { row, error } = await updateRow<RentalLease>(
      createClient(),
      "rental_leases",
      l.id,
      {
        status: "ended",
        end_date: l.end_date && l.end_date < today ? l.end_date : today,
      },
    );
    if (error || !row) {
      flash("Could not end that lease.", false);
      return;
    }
    setData((d) => ({
      ...d,
      leases: d.leases.map((x) => (x.id === l.id ? row : x)),
    }));
  }

  async function setMaintStatus(m: RentalMaintenance, status: MaintStatus) {
    const patch: Record<string, unknown> = {
      status,
      completed_on: status === "completed" ? today : null,
    };
    const { row, error } = await updateRow<RentalMaintenance>(
      createClient(),
      "rental_maintenance",
      m.id,
      patch,
    );
    if (error || !row) {
      flash("Could not update that ticket.", false);
      return;
    }
    setData((d) => ({
      ...d,
      maintenance: d.maintenance.map((x) => (x.id === m.id ? row : x)),
    }));
    // Completed with a cost -> offer to book it as a property expense.
    if (status === "completed" && num(m.cost) > 0) {
      const prop = idx.propertyOfUnit(m.unit_id);
      if (
        prop &&
        (await confirm({
          message: `Also record ${money(num(m.cost))} as a repair expense for ${prop.name}?`,
        }))
      ) {
        await add<RentalExpense>(
          "rental_expenses",
          {
            property_id: prop.id,
            expense_date: today,
            category: "repairs",
            amount: num(m.cost),
            vendor: m.vendor,
            memo: `Maintenance: ${m.title}`.slice(0, 240),
          },
          "expenses",
          "Ticket completed and expense recorded.",
        );
      }
    }
  }

  async function setMaintCost(m: RentalMaintenance, value: string) {
    const cost = optNum(value);
    if (cost === (m.cost == null ? null : num(m.cost))) return;
    const { row, error } = await updateRow<RentalMaintenance>(
      createClient(),
      "rental_maintenance",
      m.id,
      { cost },
    );
    if (error || !row) {
      flash("Could not save that cost.", false);
      return;
    }
    setData((d) => ({
      ...d,
      maintenance: d.maintenance.map((x) => (x.id === m.id ? row : x)),
    }));
  }

  function downloadCsv() {
    const csv = buildYearCsv(data, year);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rental-income-expenses-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const years = useMemo(() => {
    const set = new Set<string>([today.slice(0, 4)]);
    data.ledger.forEach((e) => set.add(e.entry_date.slice(0, 4)));
    data.expenses.forEach((x) => set.add(x.expense_date.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [data.ledger, data.expenses, today]);

  const report = useMemo(() => computeYearReport(data, year), [data, year]);
  const reportTotals = report.reduce(
    (t, r) => ({
      income: t.income + r.income,
      expenses: t.expenses + r.expenses,
      net: t.net + r.net,
    }),
    { income: 0, expenses: 0, net: 0 },
  );

  const unitOptions = data.units.map((u) => (
    <option key={u.id} value={u.id}>
      {idx.unitLabel(u.id)}
    </option>
  ));
  const leaseOptions = (list: RentalLease[]) =>
    list.map((l) => (
      <option key={l.id} value={l.id}>
        {l.tenant_name} -- {idx.unitLabel(l.unit_id)}
      </option>
    ));
  const propertyOptions = data.properties.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  const needProperty = data.properties.length === 0;
  const needUnit = data.units.length === 0;
  const needLease = data.leases.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm ${tab === t.key ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-primary hover:bg-white/10"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm ${message.ok ? "bg-[#f5d020]/10 text-[#f5d020]" : "bg-[#ff5c7a]/10 text-[#ff5c7a]"}`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className={cardClass + " text-sm text-text-muted"}>Loading…</div>
      ) : (
        <>
          {/* ---------------- OVERVIEW ---------------- */}
          {tab === "overview" && (
            <>
              {needProperty ? (
                <div className={cardClass}>
                  <h4 className={h4Class}>Get started</h4>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
                    <li>Add a property and its units.</li>
                    <li>
                      Add a lease for each tenant (rent, due day, late fee).
                    </li>
                    <li>
                      Each month: Post rent, record payments, apply late fees.
                    </li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setTab("properties")}
                    className={btnClass + " mt-4"}
                  >
                    Add your first property
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Tile
                      label="Occupancy"
                      value={
                        summary.unitCount
                          ? `${Math.round((summary.occupiedCount / summary.unitCount) * 100)}%`
                          : "--"
                      }
                      sub={`${summary.occupiedCount} of ${summary.unitCount} units leased`}
                    />
                    <Tile
                      label="Rent posted"
                      value={money(summary.rentDueThisMonth)}
                      sub={formatPeriod(periodOf(today))}
                    />
                    <Tile
                      label="Collected"
                      value={money(summary.collectedThisMonth)}
                      sub="this month"
                      tone="good"
                    />
                    <Tile
                      label="Outstanding"
                      value={money(summary.outstanding)}
                      sub="all tenants"
                      tone={summary.outstanding > 0 ? "bad" : undefined}
                    />
                    <Tile
                      label="Income YTD"
                      value={money(summary.incomeYtd)}
                      sub="rent received"
                      tone="good"
                    />
                    <Tile
                      label="Expenses YTD"
                      value={money(summary.expensesYtd)}
                    />
                    <Tile
                      label="Net YTD"
                      value={money(summary.incomeYtd - summary.expensesYtd)}
                      tone={
                        summary.incomeYtd - summary.expensesYtd >= 0
                          ? "good"
                          : "bad"
                      }
                    />
                    <Tile
                      label="Open maintenance"
                      value={String(summary.openMaintenance)}
                      sub="tickets"
                      tone={summary.openMaintenance > 0 ? "bad" : undefined}
                    />
                  </div>

                  <div className={cardClass}>
                    <h4 className={h4Class}>Monthly rent run</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="month"
                        value={postPeriod}
                        onChange={(e) =>
                          setPostPeriod(e.target.value || periodOf(today))
                        }
                        className={inputClass}
                      />
                      <button
                        type="button"
                        disabled={busy || needLease}
                        onClick={postRent}
                        className={btnClass}
                      >
                        Post rent
                      </button>
                      <button
                        type="button"
                        disabled={busy || needLease}
                        onClick={applyLateFees}
                        className="rounded-md border border-card-border px-4 py-2 text-sm font-semibold text-text-primary hover:bg-white/5 disabled:opacity-60"
                      >
                        Apply late fees
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Post rent adds each active lease&apos;s rent for the month
                      (safe to click twice). Apply late fees adds each
                      lease&apos;s late fee for any month not paid by its due
                      day + grace period.
                    </p>
                  </div>

                  <div className={cardClass}>
                    <h4 className={h4Class}>Tenant balances</h4>
                    {activeLeases.length === 0 ? (
                      <Empty
                        text="No active leases."
                        onGo={() => setTab("leases")}
                        goLabel="Add a lease"
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {activeLeases.map((l) => {
                          const bal = leaseBalance(l.id, data.ledger);
                          return (
                            <div key={l.id} className={rowClass}>
                              <div className="min-w-0">
                                <div className="truncate text-sm text-text-primary">
                                  {l.tenant_name}
                                </div>
                                <div className="truncate text-xs text-text-muted">
                                  {idx.unitLabel(l.unit_id)} ·{" "}
                                  {money(num(l.rent_amount))}/mo due on the{" "}
                                  {l.due_day}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span
                                  className={`text-sm font-semibold ${bal > 0 ? "text-[#ff5c7a]" : bal < 0 ? "text-[#f5d020]" : "text-text-muted"}`}
                                >
                                  {bal > 0
                                    ? `Owes ${money(bal)}`
                                    : bal < 0
                                      ? `Credit ${money(-bal)}`
                                      : "Paid up"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayForm((f) => ({
                                      ...f,
                                      lease_id: l.id,
                                      amount: bal > 0 ? bal.toFixed(2) : "",
                                    }));
                                    setTab("ledger");
                                    setLedgerModal("payment");
                                  }}
                                  className="text-xs font-semibold text-[#4f8cff] hover:underline"
                                >
                                  Record payment
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- PROPERTIES & UNITS ---------------- */}
          {tab === "properties" && (
            <>
              <div className={cardClass}>
                <h4 className={h4Class}>Properties</h4>
                {needProperty ? (
                  <div className="mb-4 text-sm text-text-muted">
                    No properties yet.
                  </div>
                ) : (
                  <div className="mb-4 flex flex-col gap-3">
                    {data.properties.map((p) => {
                      const units = data.units.filter(
                        (u) => u.property_id === p.id,
                      );
                      return (
                        <div key={p.id} className="rounded-xl bg-white/5 p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-text-primary">
                                {p.name}
                              </div>
                              {p.address && (
                                <div className="truncate text-xs text-text-muted">
                                  {p.address}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                remove(
                                  "rental_properties",
                                  p.id,
                                  "properties",
                                  `"${p.name}"`,
                                  "its units, leases, ledger, maintenance and expenses",
                                )
                              }
                              className={removeBtn}
                            >
                              Remove
                            </button>
                          </div>
                          {units.length > 0 && (
                            <div className="mt-2.5 flex flex-col gap-1.5">
                              {units.map((u: RentalUnit) => {
                                const lease = activeLeases.find(
                                  (l) => l.unit_id === u.id,
                                );
                                return (
                                  <div
                                    key={u.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0f131c] px-3 py-2"
                                  >
                                    <div className="text-xs text-text-primary">
                                      <span className="font-semibold">
                                        {u.label}
                                      </span>
                                      {u.bedrooms != null &&
                                        ` · ${num(u.bedrooms)} bd`}
                                      {u.bathrooms != null &&
                                        ` · ${num(u.bathrooms)} ba`}
                                      {u.market_rent != null &&
                                        ` · ${money(num(u.market_rent))} market`}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span
                                        className={
                                          lease
                                            ? "text-[#f5d020]"
                                            : "text-[#ffb648]"
                                        }
                                      >
                                        {lease
                                          ? `Leased · ${lease.tenant_name}`
                                          : "Vacant"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          remove(
                                            "rental_units",
                                            u.id,
                                            "units",
                                            `unit "${u.label}"`,
                                            "its leases, ledger and maintenance",
                                          )
                                        }
                                        className={removeBtn}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="Property name (e.g. Oak St Duplex)"
                    value={propForm.name}
                    onChange={(e) =>
                      setPropForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className={inputClass + " min-w-[220px] flex-1"}
                  />
                  <input
                    placeholder="Address (optional)"
                    value={propForm.address}
                    onChange={(e) =>
                      setPropForm((f) => ({ ...f, address: e.target.value }))
                    }
                    className={inputClass + " min-w-[220px] flex-1"}
                  />
                  <button
                    type="button"
                    disabled={busy || !propForm.name.trim()}
                    onClick={async () => {
                      const ok = await add<RentalProperty>(
                        "rental_properties",
                        {
                          business_id: businessId,
                          name: propForm.name.trim(),
                          address: propForm.address.trim() || null,
                        },
                        "properties",
                        "Property added. Now add its units.",
                      );
                      if (ok) setPropForm({ name: "", address: "" });
                    }}
                    className={btnClass}
                  >
                    Add Property
                  </button>
                </div>
              </div>

              {!needProperty && (
                <div className={cardClass}>
                  <h4 className={h4Class}>Add a unit</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={unitForm.property_id}
                      onChange={(e) =>
                        setUnitForm((f) => ({
                          ...f,
                          property_id: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">Property…</option>
                      {propertyOptions}
                    </select>
                    <input
                      placeholder="Unit (e.g. Unit A, Whole house)"
                      value={unitForm.label}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, label: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Beds"
                      value={unitForm.bedrooms}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, bedrooms: e.target.value }))
                      }
                      className={inputClass + " w-20"}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Baths"
                      value={unitForm.bathrooms}
                      onChange={(e) =>
                        setUnitForm((f) => ({
                          ...f,
                          bathrooms: e.target.value,
                        }))
                      }
                      className={inputClass + " w-20"}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Market rent"
                      value={unitForm.market_rent}
                      onChange={(e) =>
                        setUnitForm((f) => ({
                          ...f,
                          market_rent: e.target.value,
                        }))
                      }
                      className={inputClass + " w-32"}
                    />
                    <button
                      type="button"
                      disabled={
                        busy || !unitForm.property_id || !unitForm.label.trim()
                      }
                      onClick={async () => {
                        const ok = await add<RentalUnit>(
                          "rental_units",
                          {
                            property_id: unitForm.property_id,
                            label: unitForm.label.trim(),
                            bedrooms: optNum(unitForm.bedrooms),
                            bathrooms: optNum(unitForm.bathrooms),
                            market_rent: optNum(unitForm.market_rent),
                          },
                          "units",
                          "Unit added.",
                        );
                        if (ok)
                          setUnitForm((f) => ({
                            ...f,
                            label: "",
                            bedrooms: "",
                            bathrooms: "",
                            market_rent: "",
                          }));
                      }}
                      className={btnClass}
                    >
                      Add Unit
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------------- TENANTS & LEASES ---------------- */}
          {tab === "leases" && (
            <>
              <div className={cardClass}>
                <h4 className={h4Class}>Leases</h4>
                {needLease ? (
                  <div className="text-sm text-text-muted">No leases yet.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...data.leases]
                      .sort((a, b) =>
                        a.status === b.status
                          ? a.tenant_name.localeCompare(b.tenant_name)
                          : a.status === "active"
                            ? -1
                            : 1,
                      )
                      .map((l) => {
                        const bal = leaseBalance(l.id, data.ledger);
                        return (
                          <div
                            key={l.id}
                            className={
                              rowClass +
                              (l.status === "ended" ? " opacity-60" : "")
                            }
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-text-primary">
                                {l.tenant_name}{" "}
                                <span className="text-xs text-text-muted">
                                  · {idx.unitLabel(l.unit_id)}
                                </span>
                              </div>
                              <div className="truncate text-xs text-text-muted">
                                {money(num(l.rent_amount))}/mo · due {l.due_day}{" "}
                                · {l.start_date} →{" "}
                                {l.end_date ?? "month-to-month"}
                                {num(l.deposit) > 0 &&
                                  ` · deposit ${money(num(l.deposit))}`}
                                {num(l.late_fee) > 0 &&
                                  ` · late fee ${money(num(l.late_fee))} after ${l.grace_days}d`}
                              </div>
                              {(l.tenant_email || l.tenant_phone) && (
                                <div className="truncate text-xs text-text-muted">
                                  {[l.tenant_email, l.tenant_phone]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span
                                className={
                                  bal > 0
                                    ? "font-semibold text-[#ff5c7a]"
                                    : "text-text-muted"
                                }
                              >
                                {bal > 0
                                  ? `Owes ${money(bal)}`
                                  : bal < 0
                                    ? `Credit ${money(-bal)}`
                                    : "Paid up"}
                              </span>
                              {l.status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() => endLease(l)}
                                  className="text-[#f5d020] hover:underline"
                                >
                                  End lease
                                </button>
                              ) : (
                                <span className="text-text-muted">Ended</span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  remove(
                                    "rental_leases",
                                    l.id,
                                    "leases",
                                    `${l.tenant_name}'s lease`,
                                    "its rent ledger entries",
                                  )
                                }
                                className={removeBtn}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className={cardClass}>
                <h4 className={h4Class}>Add a lease</h4>
                {needUnit ? (
                  <Empty
                    text="Add a property and unit first."
                    onGo={() => setTab("properties")}
                    goLabel="Go to Properties & Units"
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <select
                        value={leaseForm.unit_id}
                        onChange={(e) => {
                          const u = data.units.find(
                            (x) => x.id === e.target.value,
                          );
                          setLeaseForm((f) => ({
                            ...f,
                            unit_id: e.target.value,
                            rent_amount:
                              f.rent_amount ||
                              (u?.market_rent != null
                                ? String(num(u.market_rent))
                                : ""),
                          }));
                        }}
                        className={inputClass}
                      >
                        <option value="">Unit…</option>
                        {unitOptions}
                      </select>
                      <input
                        placeholder="Tenant name"
                        value={leaseForm.tenant_name}
                        onChange={(e) =>
                          setLeaseForm((f) => ({
                            ...f,
                            tenant_name: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <input
                        type="email"
                        placeholder="Tenant email (optional)"
                        value={leaseForm.tenant_email}
                        onChange={(e) =>
                          setLeaseForm((f) => ({
                            ...f,
                            tenant_email: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <input
                        placeholder="Tenant phone (optional)"
                        value={leaseForm.tenant_phone}
                        onChange={(e) =>
                          setLeaseForm((f) => ({
                            ...f,
                            tenant_phone: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Start date
                        <input
                          type="date"
                          value={leaseForm.start_date}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              start_date: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        End date (blank = month-to-month)
                        <input
                          type="date"
                          value={leaseForm.end_date}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              end_date: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Monthly rent
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={leaseForm.rent_amount}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              rent_amount: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Due day of month (1-28)
                        <input
                          type="number"
                          min="1"
                          max="28"
                          step="1"
                          value={leaseForm.due_day}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              due_day: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Security deposit
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={leaseForm.deposit}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              deposit: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Late fee (flat)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={leaseForm.late_fee}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              late_fee: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
                        Grace days before late fee
                        <input
                          type="number"
                          min="0"
                          max="27"
                          step="1"
                          value={leaseForm.grace_days}
                          onChange={(e) =>
                            setLeaseForm((f) => ({
                              ...f,
                              grace_days: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !leaseForm.unit_id ||
                        !leaseForm.tenant_name.trim() ||
                        !leaseForm.start_date ||
                        optNum(leaseForm.rent_amount) == null ||
                        (!!leaseForm.end_date &&
                          leaseForm.end_date < leaseForm.start_date)
                      }
                      onClick={async () => {
                        const dueDay = Math.min(
                          28,
                          Math.max(
                            1,
                            Math.round(optNum(leaseForm.due_day) ?? 1),
                          ),
                        );
                        const grace = Math.min(
                          27,
                          Math.max(
                            0,
                            Math.round(optNum(leaseForm.grace_days) ?? 5),
                          ),
                        );
                        const ok = await add<RentalLease>(
                          "rental_leases",
                          {
                            unit_id: leaseForm.unit_id,
                            tenant_name: leaseForm.tenant_name.trim(),
                            tenant_email: leaseForm.tenant_email.trim() || null,
                            tenant_phone: leaseForm.tenant_phone.trim() || null,
                            start_date: leaseForm.start_date,
                            end_date: leaseForm.end_date || null,
                            rent_amount: optNum(leaseForm.rent_amount) ?? 0,
                            due_day: dueDay,
                            deposit: optNum(leaseForm.deposit),
                            late_fee: optNum(leaseForm.late_fee) ?? 0,
                            grace_days: grace,
                          },
                          "leases",
                          "Lease added. Use Overview → Post rent to charge this month's rent.",
                        );
                        if (ok) setLeaseForm(emptyLease);
                      }}
                      className={btnClass + " mt-3"}
                    >
                      Add Lease
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ---------------- RENT LEDGER ---------------- */}
          {tab === "ledger" && (
            <>
              {needLease ? (
                <div className={cardClass}>
                  <Empty
                    text="Add a lease first."
                    onGo={() => setTab("leases")}
                    goLabel="Go to Tenants & Leases"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setLedgerModal("payment")}
                      className="flex items-center gap-3.5 rounded-2xl border border-card-border bg-card-bg p-4 text-left transition hover:border-[#f5d020]/60 hover:bg-white/5"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5d020]/15 text-xl">💵</span>
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">Record a Payment</span>
                        <span className="mt-0.5 block text-xs text-text-muted">Rent received by ACH, card, cash or check</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerModal("charge")}
                      className="flex items-center gap-3.5 rounded-2xl border border-card-border bg-card-bg p-4 text-left transition hover:border-[#f5d020]/60 hover:bg-white/5"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5d020]/15 text-xl">🧾</span>
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">Add a Charge or Credit</span>
                        <span className="mt-0.5 block text-xs text-text-muted">Utilities, fees, discounts, deposit applied</span>
                      </span>
                    </button>
                  </div>

                  {ledgerModal === "payment" && (
                    <Modal title="Record a Payment" error={message && !message.ok ? message.text : null} onClose={() => setLedgerModal(null)}>
                      <div className="flex flex-col gap-2">
                        <select
                          value={payForm.lease_id}
                          onChange={(e) => {
                            const bal = leaseBalance(
                              e.target.value,
                              data.ledger,
                            );
                            setPayForm((f) => ({
                              ...f,
                              lease_id: e.target.value,
                              amount: bal > 0 ? bal.toFixed(2) : f.amount,
                            }));
                          }}
                          className={inputClass}
                        >
                          <option value="">Tenant…</option>
                          {leaseOptions(data.leases)}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="date"
                            value={payForm.entry_date}
                            onChange={(e) =>
                              setPayForm((f) => ({
                                ...f,
                                entry_date: e.target.value,
                              }))
                            }
                            className={inputClass}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            value={payForm.amount}
                            onChange={(e) =>
                              setPayForm((f) => ({
                                ...f,
                                amount: e.target.value,
                              }))
                            }
                            className={inputClass + " w-32"}
                          />
                          <select
                            value={payForm.method}
                            onChange={(e) =>
                              setPayForm((f) => ({
                                ...f,
                                method: e.target.value as PaymentMethod,
                              }))
                            }
                            className={inputClass}
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {PAYMENT_METHOD_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          placeholder="Memo (optional, e.g. check #)"
                          value={payForm.memo}
                          onChange={(e) =>
                            setPayForm((f) => ({ ...f, memo: e.target.value }))
                          }
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !payForm.lease_id ||
                            !payForm.entry_date ||
                            !((optNum(payForm.amount) ?? 0) > 0)
                          }
                          onClick={async () => {
                            const ok = await add<RentalLedgerEntry>(
                              "rental_ledger",
                              {
                                lease_id: payForm.lease_id,
                                entry_date: payForm.entry_date,
                                kind: "payment",
                                amount: optNum(payForm.amount),
                                method: payForm.method,
                                memo: payForm.memo.trim() || null,
                              },
                              "ledger",
                              "Payment recorded.",
                            );
                            if (ok) {
                              setPayForm((f) => ({
                                ...f,
                                amount: "",
                                memo: "",
                              }));
                              setLedgerModal(null);
                            }
                          }}
                          className={btnClass + " self-start"}
                        >
                          Record Payment
                        </button>
                      </div>
                    </Modal>
                  )}
                  {ledgerModal === "charge" && (
                    <Modal title="Add a Charge or Credit" error={message && !message.ok ? message.text : null} onClose={() => setLedgerModal(null)}>
                      <div className="flex flex-col gap-2">
                        <select
                          value={chargeForm.lease_id}
                          onChange={(e) =>
                            setChargeForm((f) => ({
                              ...f,
                              lease_id: e.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">Tenant…</option>
                          {leaseOptions(data.leases)}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={chargeForm.kind}
                            onChange={(e) =>
                              setChargeForm((f) => ({
                                ...f,
                                kind: e.target.value as LedgerKind,
                              }))
                            }
                            className={inputClass}
                          >
                            <option value="other_charge">
                              Other charge (utilities, pet fee…)
                            </option>
                            <option value="credit">
                              Credit (discount, deposit applied…)
                            </option>
                          </select>
                          <input
                            type="date"
                            value={chargeForm.entry_date}
                            onChange={(e) =>
                              setChargeForm((f) => ({
                                ...f,
                                entry_date: e.target.value,
                              }))
                            }
                            className={inputClass}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            value={chargeForm.amount}
                            onChange={(e) =>
                              setChargeForm((f) => ({
                                ...f,
                                amount: e.target.value,
                              }))
                            }
                            className={inputClass + " w-32"}
                          />
                        </div>
                        <input
                          placeholder="Description"
                          value={chargeForm.memo}
                          onChange={(e) =>
                            setChargeForm((f) => ({
                              ...f,
                              memo: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !chargeForm.lease_id ||
                            !chargeForm.entry_date ||
                            !((optNum(chargeForm.amount) ?? 0) > 0) ||
                            !chargeForm.memo.trim()
                          }
                          onClick={async () => {
                            const ok = await add<RentalLedgerEntry>(
                              "rental_ledger",
                              {
                                lease_id: chargeForm.lease_id,
                                entry_date: chargeForm.entry_date,
                                kind: chargeForm.kind,
                                amount: optNum(chargeForm.amount),
                                memo: chargeForm.memo.trim(),
                              },
                              "ledger",
                              chargeForm.kind === "credit"
                                ? "Credit added."
                                : "Charge added.",
                            );
                            if (ok) {
                              setChargeForm((f) => ({
                                ...f,
                                amount: "",
                                memo: "",
                              }));
                              setLedgerModal(null);
                            }
                          }}
                          className={btnClass + " self-start"}
                        >
                          Add
                        </button>
                      </div>
                    </Modal>
                  )}

                  <div className={cardClass}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className={h4Class + " mb-0"}>Ledger</h4>
                      <select
                        value={ledgerFilter}
                        onChange={(e) => setLedgerFilter(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">All tenants</option>
                        {leaseOptions(data.leases)}
                      </select>
                    </div>
                    {ledgerFilter && (
                      <div className="mb-3 text-sm text-text-muted">
                        Balance:{" "}
                        <span className="font-semibold text-text-primary">
                          {money(leaseBalance(ledgerFilter, data.ledger))}
                        </span>
                      </div>
                    )}
                    {(() => {
                      const rows = data.ledger.filter(
                        (e) => !ledgerFilter || e.lease_id === ledgerFilter,
                      );
                      if (rows.length === 0)
                        return (
                          <div className="text-sm text-text-muted">
                            No entries yet. Post rent from the Overview tab.
                          </div>
                        );
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                              <tr className="text-left text-[10.5px] uppercase tracking-wide text-text-muted">
                                <th className="border-b border-card-border pb-2 pr-3">
                                  Date
                                </th>
                                <th className="border-b border-card-border pb-2 pr-3">
                                  Tenant
                                </th>
                                <th className="border-b border-card-border pb-2 pr-3">
                                  Type
                                </th>
                                <th className="border-b border-card-border pb-2 pr-3">
                                  Memo
                                </th>
                                <th className="border-b border-card-border pb-2 pr-3 text-right">
                                  Charge
                                </th>
                                <th className="border-b border-card-border pb-2 pr-3 text-right">
                                  Paid / Credit
                                </th>
                                <th className="w-[1%] border-b border-card-border pb-2 pr-4" />
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((e) => {
                                const charge = CHARGE_KINDS.includes(e.kind);
                                const lease = idx.leaseById.get(e.lease_id);
                                const td = "border-b border-white/5 py-2 pr-3";
                                const cellInput =
                                  "w-full rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none";
                                if (editEntry && editEntry.id === e.id) {
                                  const lockedCharge = e.kind === "rent" || e.kind === "late_fee";
                                  const amountInput = (field: "charge" | "paid", disabled = false) => (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="0"
                                      disabled={disabled}
                                      value={editEntry[field]}
                                      onChange={(ev) =>
                                        setEditEntry((x) => x && { ...x, [field]: ev.target.value })
                                      }
                                      className={cellInput.replace("w-full", "w-24") + " ml-auto block text-right disabled:opacity-40"}
                                    />
                                  );
                                  return (
                                    <tr key={e.id} className="bg-white/5">
                                      <td className={td}>
                                        <input
                                          type="date"
                                          value={editEntry.entry_date}
                                          onChange={(ev) =>
                                            setEditEntry((x) => x && { ...x, entry_date: ev.target.value })
                                          }
                                          className={cellInput}
                                        />
                                      </td>
                                      <td className={td}>
                                        <select
                                          value={editEntry.lease_id}
                                          onChange={(ev) =>
                                            setEditEntry((x) => x && { ...x, lease_id: ev.target.value })
                                          }
                                          className={cellInput}
                                        >
                                          {data.leases.map((l) => (
                                            <option key={l.id} value={l.id}>
                                              {l.tenant_name}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className={td + " text-text-muted"}>
                                        {e.kind !== "payment" && LEDGER_KIND_LABELS[e.kind]}
                                        {e.kind === "payment" && (
                                          <select
                                            value={editEntry.method}
                                            onChange={(ev) =>
                                              setEditEntry(
                                                (x) => x && { ...x, method: ev.target.value as PaymentMethod | "" },
                                              )
                                            }
                                            className={cellInput}
                                          >
                                            <option value="">No method</option>
                                            {PAYMENT_METHODS.map((m) => (
                                              <option key={m} value={m}>
                                                {PAYMENT_METHOD_LABELS[m]}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                      </td>
                                      <td className={td}>
                                        <input
                                          value={editEntry.memo}
                                          maxLength={240}
                                          onChange={(ev) =>
                                            setEditEntry((x) => x && { ...x, memo: ev.target.value })
                                          }
                                          onKeyDown={(ev) => {
                                            if (ev.key === "Enter") saveEntry();
                                            if (ev.key === "Escape") setEditEntry(null);
                                          }}
                                          className={cellInput}
                                        />
                                      </td>
                                      <td className={td}>{amountInput("charge")}</td>
                                      <td className={td}>{amountInput("paid", lockedCharge)}</td>
                                      <td className="whitespace-nowrap border-b border-white/5 py-2 pl-2 pr-4 text-right text-xs">
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={saveEntry}
                                          className="font-semibold text-[#f5d020] hover:underline disabled:opacity-60"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditEntry(null)}
                                          className="ml-2 text-text-muted hover:underline"
                                        >
                                          Cancel
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                }
                                return (
                                  <tr key={e.id}>
                                    <td className={td + " text-text-primary"}>{e.entry_date}</td>
                                    <td className={td + " text-text-primary"}>{lease?.tenant_name ?? "--"}</td>
                                    <td className={td + " text-text-muted"}>
                                      {LEDGER_KIND_LABELS[e.kind]}
                                      {e.method ? ` · ${PAYMENT_METHOD_LABELS[e.method]}` : ""}
                                    </td>
                                    <td className={td + " text-text-muted"}>{e.memo ?? ""}</td>
                                    <td className={td + " text-right text-text-primary"}>
                                      {charge ? money(num(e.amount)) : ""}
                                    </td>
                                    <td className={td + " text-right text-[#f5d020]"}>
                                      {charge ? "" : money(num(e.amount))}
                                    </td>
                                    <td className="whitespace-nowrap border-b border-white/5 py-2 pl-2 pr-4 text-right text-xs">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditEntry({
                                            id: e.id,
                                            lease_id: e.lease_id,
                                            entry_date: e.entry_date,
                                            charge: charge ? String(num(e.amount)) : "0",
                                            paid: charge ? "0" : String(num(e.amount)),
                                            method: e.method ?? "",
                                            memo: e.memo ?? "",
                                          })
                                        }
                                        className="font-semibold text-[#4f8cff] hover:underline"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => remove("rental_ledger", e.id, "ledger", "this ledger entry")}
                                        className={removeBtn + " ml-2.5"}
                                      >
                                        ×
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- MAINTENANCE ---------------- */}
          {tab === "maintenance" && (
            <>
              <div className={cardClass}>
                <h4 className={h4Class}>Maintenance requests</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {MAINT_STATUSES.map((status) => {
                    const items = data.maintenance.filter(
                      (m) => m.status === status,
                    );
                    return (
                      <div key={status} className="rounded-xl bg-white/5 p-2.5">
                        <div className="mb-2 text-xs font-semibold text-text-muted">
                          {MAINT_STATUS_LABELS[status]} ({items.length})
                        </div>
                        <div className="flex flex-col gap-2">
                          {items.map((m) => (
                            <div
                              key={m.id}
                              className="rounded-lg bg-[#0f131c] p-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm text-text-primary">
                                  {m.title}
                                </div>
                                {m.priority !== "normal" && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.priority === "urgent" ? "bg-[#ff5c7a]/15 text-[#ff5c7a]" : "bg-white/10 text-text-muted"}`}
                                  >
                                    {m.priority}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-text-muted">
                                {idx.unitLabel(m.unit_id)} · opened{" "}
                                {m.opened_on}
                                {m.vendor ? ` · ${m.vendor}` : ""}
                                {m.completed_on
                                  ? ` · done ${m.completed_on}`
                                  : ""}
                              </div>
                              {m.details && (
                                <div className="mt-1 text-xs text-text-muted">
                                  {m.details}
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-1.5">
                                <select
                                  value={m.status}
                                  onChange={(e) =>
                                    setMaintStatus(
                                      m,
                                      e.target.value as MaintStatus,
                                    )
                                  }
                                  className="flex-1 rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                                >
                                  {MAINT_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {MAINT_STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  key={`${m.id}-${m.cost ?? ""}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Cost"
                                  defaultValue={
                                    m.cost == null ? "" : String(num(m.cost))
                                  }
                                  onBlur={(e) =>
                                    setMaintCost(m, e.target.value)
                                  }
                                  className="w-20 rounded border border-card-border bg-[#0f131c] px-1.5 py-1 text-xs text-text-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    remove(
                                      "rental_maintenance",
                                      m.id,
                                      "maintenance",
                                      `ticket "${m.title}"`,
                                    )
                                  }
                                  className={removeBtn}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={cardClass}>
                <h4 className={h4Class}>New request</h4>
                {needUnit ? (
                  <Empty
                    text="Add a property and unit first."
                    onGo={() => setTab("properties")}
                    goLabel="Go to Properties & Units"
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={maintForm.unit_id}
                        onChange={(e) =>
                          setMaintForm((f) => ({
                            ...f,
                            unit_id: e.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Unit…</option>
                        {unitOptions}
                      </select>
                      <input
                        placeholder="What needs fixing?"
                        value={maintForm.title}
                        onChange={(e) =>
                          setMaintForm((f) => ({ ...f, title: e.target.value }))
                        }
                        className={inputClass + " min-w-[200px] flex-1"}
                      />
                      <select
                        value={maintForm.priority}
                        onChange={(e) =>
                          setMaintForm((f) => ({
                            ...f,
                            priority: e.target.value as MaintPriority,
                          }))
                        }
                        className={inputClass}
                      >
                        {MAINT_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p[0].toUpperCase() + p.slice(1)} priority
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Vendor (optional)"
                        value={maintForm.vendor}
                        onChange={(e) =>
                          setMaintForm((f) => ({
                            ...f,
                            vendor: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <textarea
                      placeholder="Details (optional)"
                      rows={2}
                      value={maintForm.details}
                      onChange={(e) =>
                        setMaintForm((f) => ({ ...f, details: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={
                        busy || !maintForm.unit_id || !maintForm.title.trim()
                      }
                      onClick={async () => {
                        const ok = await add<RentalMaintenance>(
                          "rental_maintenance",
                          {
                            unit_id: maintForm.unit_id,
                            title: maintForm.title.trim(),
                            priority: maintForm.priority,
                            vendor: maintForm.vendor.trim() || null,
                            details: maintForm.details.trim() || null,
                            opened_on: today,
                          },
                          "maintenance",
                          "Request added.",
                        );
                        if (ok)
                          setMaintForm((f) => ({
                            ...f,
                            title: "",
                            vendor: "",
                            details: "",
                            priority: "normal",
                          }));
                      }}
                      className={btnClass + " self-start"}
                    >
                      Add Request
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------------- EXPENSES ---------------- */}
          {tab === "expenses" && (
            <>
              <div className={cardClass}>
                <h4 className={h4Class}>Add an expense</h4>
                {needProperty ? (
                  <Empty
                    text="Add a property first."
                    onGo={() => setTab("properties")}
                    goLabel="Go to Properties & Units"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={expForm.property_id}
                      onChange={(e) =>
                        setExpForm((f) => ({
                          ...f,
                          property_id: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">Property…</option>
                      {propertyOptions}
                    </select>
                    <input
                      type="date"
                      value={expForm.expense_date}
                      onChange={(e) =>
                        setExpForm((f) => ({
                          ...f,
                          expense_date: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                    <select
                      value={expForm.category}
                      onChange={(e) =>
                        setExpForm((f) => ({
                          ...f,
                          category: e.target.value as ExpenseCategory,
                        }))
                      }
                      className={inputClass}
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EXPENSE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={expForm.amount}
                      onChange={(e) =>
                        setExpForm((f) => ({ ...f, amount: e.target.value }))
                      }
                      className={inputClass + " w-32"}
                    />
                    <input
                      placeholder="Vendor (optional)"
                      value={expForm.vendor}
                      onChange={(e) =>
                        setExpForm((f) => ({ ...f, vendor: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <input
                      placeholder="Memo (optional)"
                      value={expForm.memo}
                      onChange={(e) =>
                        setExpForm((f) => ({ ...f, memo: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !expForm.property_id ||
                        !expForm.expense_date ||
                        !((optNum(expForm.amount) ?? 0) > 0)
                      }
                      onClick={async () => {
                        const ok = await add<RentalExpense>(
                          "rental_expenses",
                          {
                            property_id: expForm.property_id,
                            expense_date: expForm.expense_date,
                            category: expForm.category,
                            amount: optNum(expForm.amount),
                            vendor: expForm.vendor.trim() || null,
                            memo: expForm.memo.trim() || null,
                          },
                          "expenses",
                          "Expense added.",
                        );
                        if (ok)
                          setExpForm((f) => ({
                            ...f,
                            amount: "",
                            vendor: "",
                            memo: "",
                          }));
                      }}
                      className={btnClass}
                    >
                      Add Expense
                    </button>
                  </div>
                )}
              </div>

              <div className={cardClass}>
                <h4 className={h4Class}>Expenses</h4>
                {data.expenses.length === 0 ? (
                  <div className="text-sm text-text-muted">
                    No expenses yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...data.expenses]
                      .sort((a, b) =>
                        b.expense_date.localeCompare(a.expense_date),
                      )
                      .map((x) => (
                        <div key={x.id} className={rowClass}>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-text-primary">
                              {EXPENSE_CATEGORY_LABELS[x.category]} ·{" "}
                              {money(num(x.amount))}
                            </div>
                            <div className="truncate text-xs text-text-muted">
                              {x.expense_date} ·{" "}
                              {idx.propById.get(x.property_id)?.name ?? ""}
                              {x.vendor ? ` · ${x.vendor}` : ""}
                              {x.memo ? ` · ${x.memo}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              remove(
                                "rental_expenses",
                                x.id,
                                "expenses",
                                "this expense",
                              )
                            }
                            className={removeBtn}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------------- REPORTS ---------------- */}
          {tab === "reports" && (
            <div className={cardClass}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className={h4Class + " mb-0"}>
                  Income & expenses by property (cash basis)
                </h4>
                <div className="flex items-center gap-2">
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className={inputClass}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={downloadCsv}
                    disabled={needProperty}
                    className={btnClass}
                  >
                    Download CSV
                  </button>
                </div>
              </div>
              {needProperty ? (
                <div className="text-sm text-text-muted">
                  No properties yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wide text-text-muted">
                        <th className="border-b border-card-border pb-2 pr-3">
                          Property
                        </th>
                        <th className="border-b border-card-border pb-2 pr-3 text-right">
                          Rent received
                        </th>
                        <th className="border-b border-card-border pb-2 pr-3 text-right">
                          Expenses
                        </th>
                        <th className="border-b border-card-border pb-2 text-right">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.map((r) => (
                        <tr key={r.propertyId} className="align-top">
                          <td className="border-b border-white/5 py-2 pr-3 text-text-primary">
                            {r.name}
                            {Object.keys(r.byCategory).length > 0 && (
                              <div className="mt-1 text-xs text-text-muted">
                                {Object.entries(r.byCategory)
                                  .map(
                                    ([c, v]) =>
                                      `${EXPENSE_CATEGORY_LABELS[c as ExpenseCategory]} ${money(v as number)}`,
                                  )
                                  .join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-white/5 py-2 pr-3 text-right text-[#f5d020]">
                            {money(r.income)}
                          </td>
                          <td className="border-b border-white/5 py-2 pr-3 text-right text-text-primary">
                            {money(r.expenses)}
                          </td>
                          <td
                            className={`border-b border-white/5 py-2 text-right font-semibold ${r.net >= 0 ? "text-[#f5d020]" : "text-[#ff5c7a]"}`}
                          >
                            {money(r.net)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="pt-2.5 pr-3 font-semibold text-text-primary">
                          Total
                        </td>
                        <td className="pt-2.5 pr-3 text-right font-semibold text-[#f5d020]">
                          {money(reportTotals.income)}
                        </td>
                        <td className="pt-2.5 pr-3 text-right font-semibold text-text-primary">
                          {money(reportTotals.expenses)}
                        </td>
                        <td
                          className={`pt-2.5 text-right font-bold ${reportTotals.net >= 0 ? "text-[#f5d020]" : "text-[#ff5c7a]"}`}
                        >
                          {money(reportTotals.net)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-text-muted">
                    The CSV lists every rent payment and expense for {year} with
                    property, unit and tenant -- ready to hand to your
                    accountant. Expense categories follow the Schedule E lines.
                    Not tax advice.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
