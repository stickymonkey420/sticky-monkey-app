import {
  CHARGE_KINDS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  type ExpenseCategory,
  type RentalData,
  type RentalLease,
  type RentalLedgerEntry,
} from "./types";

export function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const pad2 = (n: number) => (n < 10 ? "0" + n : "" + n);

// Local calendar date (never toISOString, which is UTC and shifts the day
// for US users in the evening).
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function periodStart(period: string): string {
  return `${period}-01`;
}

export function periodEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${period}-${pad2(last)}`;
}

export function dueDateFor(lease: RentalLease, period: string): string {
  return `${period}-${pad2(Math.min(Math.max(lease.due_day || 1, 1), 28))}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
}

export function money(n: number): string {
  return n.toLocaleString([], { style: "currency", currency: "USD" });
}

// A lease is chargeable for a month if it's active and its dates overlap it.
export function leaseCoversPeriod(lease: RentalLease, period: string): boolean {
  if (lease.status !== "active") return false;
  if (lease.start_date > periodEnd(period)) return false;
  if (lease.end_date && lease.end_date < periodStart(period)) return false;
  return true;
}

const isCharge = (e: RentalLedgerEntry) => CHARGE_KINDS.includes(e.kind);

export function leaseBalance(
  leaseId: string,
  ledger: RentalLedgerEntry[],
): number {
  let bal = 0;
  for (const e of ledger) {
    if (e.lease_id !== leaseId) continue;
    bal += isCharge(e) ? num(e.amount) : -num(e.amount);
  }
  return Math.round(bal * 100) / 100;
}

// Rent charges still missing for `period` -- one per covering lease. Safe
// to run repeatedly: the DB's unique (lease, kind, period) index is the
// backstop if two tabs post at once.
export function planRentPosting(
  data: RentalData,
  period: string,
): Record<string, unknown>[] {
  const have = new Set(
    data.ledger
      .filter((e) => e.kind === "rent" && e.period === period)
      .map((e) => e.lease_id),
  );
  return data.leases
    .filter(
      (l) =>
        leaseCoversPeriod(l, period) &&
        !have.has(l.id) &&
        num(l.rent_amount) > 0,
    )
    .map((l) => ({
      lease_id: l.id,
      entry_date: dueDateFor(l, period),
      kind: "rent",
      amount: num(l.rent_amount),
      period,
      memo: `Rent -- ${formatPeriod(period)}`,
    }));
}

// Late fees owed as of `today`. A month is late when its grace deadline has
// passed and, by that deadline, the tenant's payments/credits hadn't covered
// every charge dated on or before that month's due date (first-in,
// first-out). Only months that already have a rent charge are considered,
// and each month gets at most one late fee.
export function planLateFees(
  data: RentalData,
  today: string,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const lease of data.leases) {
    if (lease.status !== "active" || num(lease.late_fee) <= 0) continue;
    const entries = data.ledger.filter((e) => e.lease_id === lease.id);
    const feePeriods = new Set(
      entries.filter((e) => e.kind === "late_fee").map((e) => e.period),
    );
    const rentPeriods = entries
      .filter((e) => e.kind === "rent" && e.period)
      .map((e) => e.period as string);
    for (const period of rentPeriods) {
      if (feePeriods.has(period)) continue;
      const due = dueDateFor(lease, period);
      const deadline = addDays(due, lease.grace_days ?? 0);
      if (deadline >= today) continue;
      const owed = entries
        .filter(
          (e) => isCharge(e) && e.kind !== "late_fee" && e.entry_date <= due,
        )
        .reduce((s, e) => s + num(e.amount), 0);
      const paid = entries
        .filter((e) => !isCharge(e) && e.entry_date <= deadline)
        .reduce((s, e) => s + num(e.amount), 0);
      if (paid + 0.005 < owed) {
        out.push({
          lease_id: lease.id,
          entry_date: addDays(deadline, 1),
          kind: "late_fee",
          amount: num(lease.late_fee),
          period,
          memo: `Late fee -- ${formatPeriod(period)} rent`,
        });
      }
    }
  }
  return out;
}

export type RentalSummary = {
  unitCount: number;
  occupiedCount: number;
  rentDueThisMonth: number;
  collectedThisMonth: number;
  outstanding: number;
  openMaintenance: number;
  incomeYtd: number;
  expensesYtd: number;
};

export function computeSummary(data: RentalData, today: string): RentalSummary {
  const period = periodOf(today);
  const year = today.slice(0, 4);
  const occupiedUnits = new Set(
    data.leases
      .filter(
        (l) =>
          l.status === "active" &&
          l.start_date <= today &&
          (!l.end_date || l.end_date >= today),
      )
      .map((l) => l.unit_id),
  );
  const outstanding = data.leases.reduce(
    (s, l) => s + Math.max(0, leaseBalance(l.id, data.ledger)),
    0,
  );
  return {
    unitCount: data.units.length,
    occupiedCount: data.units.filter((u) => occupiedUnits.has(u.id)).length,
    rentDueThisMonth: data.ledger
      .filter((e) => e.kind === "rent" && e.period === period)
      .reduce((s, e) => s + num(e.amount), 0),
    collectedThisMonth: data.ledger
      .filter((e) => e.kind === "payment" && periodOf(e.entry_date) === period)
      .reduce((s, e) => s + num(e.amount), 0),
    outstanding,
    openMaintenance: data.maintenance.filter((m) => m.status !== "completed")
      .length,
    incomeYtd: data.ledger
      .filter((e) => e.kind === "payment" && e.entry_date.startsWith(year))
      .reduce((s, e) => s + num(e.amount), 0),
    expensesYtd: data.expenses
      .filter((x) => x.expense_date.startsWith(year))
      .reduce((s, x) => s + num(x.amount), 0),
  };
}

// Lookups: lease -> unit -> property.
export function buildIndex(data: RentalData) {
  const unitById = new Map(data.units.map((u) => [u.id, u]));
  const propById = new Map(data.properties.map((p) => [p.id, p]));
  const leaseById = new Map(data.leases.map((l) => [l.id, l]));
  const propertyOfUnit = (unitId: string) => {
    const u = unitById.get(unitId);
    return u ? (propById.get(u.property_id) ?? null) : null;
  };
  const unitLabel = (unitId: string) => {
    const u = unitById.get(unitId);
    const p = u ? propById.get(u.property_id) : null;
    return u ? `${p ? p.name + " · " : ""}${u.label}` : "Unknown unit";
  };
  const propertyOfLease = (leaseId: string) => {
    const l = leaseById.get(leaseId);
    return l ? propertyOfUnit(l.unit_id) : null;
  };
  return {
    unitById,
    propById,
    leaseById,
    propertyOfUnit,
    unitLabel,
    propertyOfLease,
  };
}

export type PropertyReportRow = {
  propertyId: string;
  name: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
};

// Cash-basis year report: income = payments received in the year,
// expenses = expenses dated in the year.
export function computeYearReport(
  data: RentalData,
  year: string,
): PropertyReportRow[] {
  const idx = buildIndex(data);
  const rows = new Map<string, PropertyReportRow>();
  for (const p of data.properties) {
    rows.set(p.id, {
      propertyId: p.id,
      name: p.name,
      income: 0,
      expenses: 0,
      net: 0,
      byCategory: {},
    });
  }
  for (const e of data.ledger) {
    if (e.kind !== "payment" || !e.entry_date.startsWith(year)) continue;
    const p = idx.propertyOfLease(e.lease_id);
    const row = p ? rows.get(p.id) : null;
    if (row) row.income += num(e.amount);
  }
  for (const x of data.expenses) {
    if (!x.expense_date.startsWith(year)) continue;
    const row = rows.get(x.property_id);
    if (!row) continue;
    row.expenses += num(x.amount);
    row.byCategory[x.category] =
      (row.byCategory[x.category] ?? 0) + num(x.amount);
  }
  return Array.from(rows.values()).map((r) => ({
    ...r,
    net: r.income - r.expenses,
  }));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One file for the accountant: every rent payment received (positive) and
// every expense (negative) in the year, with property/unit/tenant attached.
export function buildYearCsv(data: RentalData, year: string): string {
  const idx = buildIndex(data);
  const lines: (string | number)[][] = [
    [
      "Date",
      "Property",
      "Unit",
      "Tenant",
      "Type",
      "Category / Method",
      "Amount",
      "Vendor",
      "Memo",
    ],
  ];
  const rows: (string | number)[][] = [];
  for (const e of data.ledger) {
    // Cash basis: only money actually received counts (charges aren't income).
    if (e.kind !== "payment" || !e.entry_date.startsWith(year)) continue;
    const lease = idx.leaseById.get(e.lease_id);
    const unit = lease ? idx.unitById.get(lease.unit_id) : undefined;
    const prop = lease ? idx.propertyOfUnit(lease.unit_id) : null;
    rows.push([
      e.entry_date,
      prop?.name ?? "",
      unit?.label ?? "",
      lease?.tenant_name ?? "",
      "Rent received",
      e.method ? PAYMENT_METHOD_LABELS[e.method] : "",
      num(e.amount).toFixed(2),
      "",
      e.memo ?? "",
    ]);
  }
  for (const x of data.expenses) {
    if (!x.expense_date.startsWith(year)) continue;
    rows.push([
      x.expense_date,
      idx.propById.get(x.property_id)?.name ?? "",
      "",
      "",
      "Expense",
      EXPENSE_CATEGORY_LABELS[x.category],
      (-num(x.amount)).toFixed(2),
      x.vendor ?? "",
      x.memo ?? "",
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [...lines, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
