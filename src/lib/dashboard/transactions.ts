import type { TransactionCategory } from "@/lib/types/dashboard";

// Ported from the live Webflow Dashboard's "Last Transactions" widget
// (dashboard-quick-actions-js edge function).

export const BUILTIN_CATEGORIES: TransactionCategory[] = [
  { key: "food_grocery", label: "Food & Grocery", color: "#f2994a" },
  { key: "transport", label: "Transport", color: "#56ccf2" },
  { key: "medical", label: "Medical", color: "#eb5757" },
  { key: "shopping", label: "Shopping", color: "#bb6bd9" },
  { key: "bill_others", label: "Bills & Other", color: "#8a94a6" },
];

export function labelFor(bucket: string | null, categories: TransactionCategory[]): string {
  const c = categories.find((cat) => cat.key === bucket);
  if (c) return c.label;
  return bucket ? bucket.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "Uncategorized";
}

export function money(n: number | string | null | undefined): string {
  const v = Math.abs(Number(n) || 0);
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d;
  }
}

export function fmtTime(ts: string | null): string {
  if (!ts) return "";
  try {
    const dt = new Date(ts);
    return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}
