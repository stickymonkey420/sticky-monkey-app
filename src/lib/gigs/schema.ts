// Tailored gig workspaces (My Business). Every gig category that doesn't
// have its own hand-built module (rentals, classes, dev, IT) gets a
// workspace described by a GigConfig: its own record types ("collections")
// with real fields for that line of work, computed columns, KPIs, a
// getting-started checklist, integrations and resources. One renderer
// (components/gigs/GigWorkspace.tsx) draws them all; records live in
// public.gig_records (owner RLS, data jsonb).
//
// Money flows to Taxes: each collection can declare income() and
// expense(); the row stores them (income/expense columns, dated by
// dateField) and the Taxes page counts income - expense as that
// business's net profit for the year.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "datetime"
  | "select"
  | "bool"
  | "url"
  | "client" // a business_clients row (this business's clients)
  | "ref" // another record in this workspace (field.ref = collection key)
  | "rating"; // 1-5
// Value conventions in record data: money/number/percent fields hold numbers
// (a percent FIELD holds whole percents: 15 means 15%), date = "YYYY-MM-DD",
// datetime = "YYYY-MM-DDTHH:mm", bool = true/false, select = one option string.
// A computed column or KPI with format "percent" returns a FRACTION (0.15).

export type GigField = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[]; // select
  ref?: string; // ref: target collection key
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
  list?: boolean; // show as a table column (title + first few fields show by default)
  unit?: string; // suffix shown after numbers, e.g. "mi", "hrs", "sq ft"
};

export type RecordData = Record<string, unknown>;
export type NumFormat = "money" | "number" | "percent" | "hours";

export type GigComputed = {
  key: string;
  label: string;
  format: NumFormat;
  fn: (d: RecordData) => number | null;
  list?: boolean; // default true
};

export type GigCollection = {
  key: string; // stable id stored in gig_records.collection (never rename once shipped)
  label: string; // tab label, plural ("Orders")
  singular: string; // "Order"
  description?: string;
  fields: GigField[];
  computed?: GigComputed[];
  titleField: string; // main label of a row
  dateField?: string; // date/datetime field that dates the row (KPIs, taxes)
  statusField?: string; // select field used for the status chips
  income?: (d: RecordData) => number; // taxable money in
  expense?: (d: RecordData) => number; // deductible money out
  sort?: { field: string; dir: "asc" | "desc" };
  // CSV import (Etsy/eBay/Uber exports etc.): guesses map CSV headers to fields.
  csvImport?: {
    hint: string; // where to download the file
    guess?: Record<string, string[]>; // fieldKey -> header names to try (lowercase)
    idField?: string; // field whose value de-duplicates re-imports
  };
};

export type KpiCtx = {
  all: (collection: string) => RecordData[];
  ytd: (collection: string) => RecordData[];
  month: (collection: string) => RecordData[];
  incomeYtd: number;
  expenseYtd: number;
};

export type GigKpi = {
  label: string;
  format: NumFormat | "text";
  value: (ctx: KpiCtx) => number | string | null;
  hint?: string;
};

export type GigIntegration =
  | { kind: "printful" } // API token -> webhook + order/product sync into "orders"
  | { kind: "shopify_webhook" } // Shopify order webhooks into "orders"
  | { kind: "ical"; label: string } // Airbnb / VRBO / Booking.com calendar -> "reservations"
  | { kind: "link"; label: string; url: string; note?: string };

export type GigConfig = {
  categories: string[]; // exact gig_categories.name values this config serves
  tagline: string; // one line under the business name
  usesClients: boolean; // show the Clients card
  clientLabel?: string; // "Pet parents", "Students"...
  jobsBoard?: false | { label: string; placeholder: string }; // keep the Lead->Completed board, renamed
  schedule?: false | { label: string }; // show the scheduler
  collections: GigCollection[];
  kpis: GigKpi[];
  checklist?: { label: string; items: string[] };
  integrations?: GigIntegration[];
  resources?: { label: string; url: string; note?: string }[];
};

// ---------- helpers for configs ----------

export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return 0;
}

export function sum(rows: RecordData[], key: string | ((d: RecordData) => number)): number {
  return rows.reduce((s, r) => s + (typeof key === "function" ? key(r) : num(r[key])), 0);
}

export function count(rows: RecordData[], pred?: (d: RecordData) => boolean): number {
  return pred ? rows.filter(pred).length : rows.length;
}

export function avg(rows: RecordData[], key: string | ((d: RecordData) => number)): number | null {
  if (!rows.length) return null;
  return sum(rows, key) / rows.length;
}

export function ratio(a: number, b: number): number | null {
  return b ? a / b : null;
}

// Hours between two datetime-local strings (or ISO).
export function hoursBetween(start: unknown, end: unknown): number {
  if (typeof start !== "string" || typeof end !== "string" || !start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
}

// Days between two YYYY-MM-DD dates.
export function daysBetween(start: unknown, end: unknown): number {
  if (typeof start !== "string" || typeof end !== "string" || !start || !end) return 0;
  const ms = new Date(end.slice(0, 10) + "T00:00:00").getTime() - new Date(start.slice(0, 10) + "T00:00:00").getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

export const is = (key: string, ...values: string[]) => (d: RecordData) => values.includes(String(d[key] ?? ""));

// IRS standard business mileage rate: 72.5 cents/mile for 2026 (IR-2025-128).
// Update every January.
export const IRS_MILEAGE_RATE = 0.725;

// ---------- row mapping (shared by the UI and the webhook/import routes) ----------

export type GigRowFields = {
  status: string | null;
  record_date: string | null;
  income: number;
  expense: number;
};

export function rowFields(col: GigCollection, data: RecordData): GigRowFields {
  const status = col.statusField ? (data[col.statusField] as string | undefined) ?? null : null;
  const rawDate = col.dateField ? data[col.dateField] : null;
  const record_date = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let income = 0;
  let expense = 0;
  try {
    income = col.income ? r2(col.income(data) || 0) : 0;
    expense = col.expense ? r2(col.expense(data) || 0) : 0;
  } catch {
    // a bad value never blocks saving
  }
  return { status, record_date, income: Number.isFinite(income) ? income : 0, expense: Number.isFinite(expense) ? expense : 0 };
}

export function fmtValue(format: NumFormat, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (format === "money") return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
  if (format === "percent") return `${(n * 100).toFixed(1)}%`;
  if (format === "hours") return `${n.toFixed(1)} h`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
