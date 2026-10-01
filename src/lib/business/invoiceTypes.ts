// Shared invoices for every business type: business_invoices +
// business_invoice_lines (owner-only RLS). Status changes go through the
// set_business_invoice_status RPC so linked milestones / hours stay in step.

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_PAYMENT_METHODS = [
  "bank_transfer",
  "zelle",
  "venmo",
  "paypal",
  "stripe",
  "card",
  "cash_app",
  "check",
  "cash",
  "other",
] as const;
export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];
export const INVOICE_PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  zelle: "Zelle",
  venmo: "Venmo",
  paypal: "PayPal",
  stripe: "Stripe",
  card: "Card",
  cash_app: "Cash App",
  check: "Check",
  cash: "Cash",
  other: "Other",
};

export type BusinessInvoice = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string | null;
  project_id: string | null;
  number: string;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  subtotal: number | string;
  total: number | string;
  paid_date: string | null;
  payment_method: InvoicePaymentMethod | null;
  notes: string | null;
  created_at: string;
};

export type BusinessInvoiceLine = {
  id: string;
  user_id: string;
  invoice_id: string;
  source_type: "milestone" | "time" | "custom";
  source_id: string | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  sort_order: number;
};

// "Overdue" is derived: sent and past its due date.
export function isOverdue(inv: BusinessInvoice, todayIso: string): boolean {
  return inv.status === "sent" && !!inv.due_date && inv.due_date < todayIso;
}

export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
