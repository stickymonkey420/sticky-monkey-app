// Row shapes for the Rental Property module (My Business, when the business
// is "Property Management (Small Scale)"). Tables + RLS: see
// rental-property-tables.sql (six owner-only tables, parent-ownership
// checked in every policy's WITH CHECK).
//
// Scope is deliberately the core of a small-landlord tool (modeled on
// RentRedi's core feature set): properties/units, tenants & leases, a rent
// ledger with late fees, maintenance tickets, expenses, and year-end
// reports. Integrations that cost money or need a payments/screening
// provider (online rent collection, tenant screening, listing syndication,
// e-signatures, tenant portal) are intentionally out of scope.

export type RentalProperty = {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export type RentalUnit = {
  id: string;
  user_id: string;
  property_id: string;
  label: string;
  bedrooms: number | string | null;
  bathrooms: number | string | null;
  market_rent: number | string | null;
  created_at: string;
};

export const LEASE_STATUSES = ["active", "ended"] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export type RentalLease = {
  id: string;
  user_id: string;
  unit_id: string;
  tenant_name: string;
  tenant_email: string | null;
  tenant_phone: string | null;
  start_date: string;
  end_date: string | null;
  rent_amount: number | string;
  due_day: number;
  deposit: number | string | null;
  late_fee: number | string;
  grace_days: number;
  status: LeaseStatus;
  notes: string | null;
  created_at: string;
};

export const LEDGER_KINDS = [
  "rent",
  "late_fee",
  "other_charge",
  "payment",
  "credit",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  rent: "Rent",
  late_fee: "Late fee",
  other_charge: "Other charge",
  payment: "Payment",
  credit: "Credit",
};
// Charges raise what the tenant owes; payments and credits lower it.
export const CHARGE_KINDS: LedgerKind[] = ["rent", "late_fee", "other_charge"];

export const PAYMENT_METHODS = [
  "ach",
  "card",
  "cash",
  "check",
  "money_order",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ach: "Bank transfer (ACH)",
  card: "Card",
  cash: "Cash",
  check: "Check",
  money_order: "Money order",
  other: "Other",
};

export type RentalLedgerEntry = {
  id: string;
  user_id: string;
  lease_id: string;
  entry_date: string;
  kind: LedgerKind;
  amount: number | string;
  method: PaymentMethod | null;
  period: string | null;
  memo: string | null;
  created_at: string;
};

export const MAINT_PRIORITIES = ["low", "normal", "urgent"] as const;
export type MaintPriority = (typeof MAINT_PRIORITIES)[number];
export const MAINT_STATUSES = ["open", "in_progress", "completed"] as const;
export type MaintStatus = (typeof MAINT_STATUSES)[number];
export const MAINT_STATUS_LABELS: Record<MaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
};

export type RentalMaintenance = {
  id: string;
  user_id: string;
  unit_id: string;
  title: string;
  details: string | null;
  priority: MaintPriority;
  status: MaintStatus;
  vendor: string | null;
  cost: number | string | null;
  opened_on: string;
  completed_on: string | null;
  created_at: string;
};

// Mirrors the IRS Schedule E expense lines closely enough for a clean
// year-end export.
export const EXPENSE_CATEGORIES = [
  "repairs",
  "maintenance",
  "utilities",
  "property_tax",
  "insurance",
  "mortgage_interest",
  "hoa",
  "management",
  "advertising",
  "legal_professional",
  "supplies",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  repairs: "Repairs",
  maintenance: "Cleaning & maintenance",
  utilities: "Utilities",
  property_tax: "Property taxes",
  insurance: "Insurance",
  mortgage_interest: "Mortgage interest",
  hoa: "HOA fees",
  management: "Management fees",
  advertising: "Advertising",
  legal_professional: "Legal & professional",
  supplies: "Supplies",
  other: "Other",
};

export type RentalExpense = {
  id: string;
  user_id: string;
  property_id: string;
  expense_date: string;
  category: ExpenseCategory;
  amount: number | string;
  vendor: string | null;
  memo: string | null;
  created_at: string;
};

export type RentalData = {
  properties: RentalProperty[];
  units: RentalUnit[];
  leases: RentalLease[];
  ledger: RentalLedgerEntry[];
  maintenance: RentalMaintenance[];
  expenses: RentalExpense[];
};

// Which gig categories get the rental module in My Business.
export function isRentalBusiness(
  categoryName: string | null | undefined,
): boolean {
  return /property management/i.test(categoryName ?? "");
}
