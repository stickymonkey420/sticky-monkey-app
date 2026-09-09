import type { ExpenseCategorySlot, ExpenseCategoryTotalRow } from "@/lib/types/dashboard";

// Ported 1:1 from the live Webflow Dashboard page's Expense Categories dials
// widget (head-code script, ".expense-categories-singel-wrapper" elements).
// Ranks every category_bucket with spend this calendar month (via the
// get_expense_category_totals RPC) and fills the dial slots with the top N
// by dollar amount, largest on the left.

export const CATEGORY_COLORS: Record<string, string> = {
  food_grocery: "#f2994a",
  transport: "#56ccf2",
  medical: "#eb5757",
  shopping: "#bb6bd9",
  bill_others: "#8a94a6",
  business: "#27ae60",
  postal: "#f2c94c",
  interest: "#2d9cdb",
};

export const FALLBACK_COLORS = ["#9b51e0", "#219653", "#f2994a", "#56ccf2", "#eb5757", "#bb6bd9"];

export const CATEGORY_LABELS: Record<string, string> = {
  food_grocery: "Food & Grocery",
  transport: "Transport",
  medical: "Medical",
  shopping: "Shopping",
  bill_others: "Bill & Others",
  business: "Business",
  postal: "Postal & Shipping",
  interest: "Interest",
};

export const RING_TRACK_COLOR = "rgba(89, 99, 128, 0.35)";

// Order known categories are used to pad out empty slots, matching the
// "5-slot patch" behavior from the live app (dashboard-quick-actions-js):
// rather than hiding a dial when fewer than 5 categories had spend this
// month, remaining slots fill with known categories at 0%.
export const KNOWN_CATEGORY_ORDER = [
  "food_grocery",
  "transport",
  "medical",
  "shopping",
  "bill_others",
  "business",
  "postal",
  "interest",
];

export function labelFor(bucket: string): string {
  if (CATEGORY_LABELS[bucket]) return CATEGORY_LABELS[bucket];
  return bucket.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function colorFor(bucket: string, slotIndex: number): string {
  if (CATEGORY_COLORS[bucket]) return CATEGORY_COLORS[bucket];
  return FALLBACK_COLORS[slotIndex % FALLBACK_COLORS.length];
}

export function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  function iso(d: Date) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  return { start: iso(start), end: iso(end) };
}

export function rankExpenseCategories(
  rows: ExpenseCategoryTotalRow[],
  slotCount: number
): ExpenseCategorySlot[] {
  const entries = (rows || [])
    .map((r) => ({ bucket: r.category_bucket || "", total: Number(r.total_amount) || 0 }))
    .filter((e) => e.bucket && e.total > 0);

  entries.sort((a, b) => b.total - a.total);
  const top = entries.slice(0, slotCount);

  // Pad out remaining slots with known categories at 0% instead of hiding
  // them, matching the live app's 5-slot patch.
  const used = new Set(top.map((e) => e.bucket));
  for (const bucket of KNOWN_CATEGORY_ORDER) {
    if (top.length >= slotCount) break;
    if (used.has(bucket)) continue;
    top.push({ bucket, total: 0 });
    used.add(bucket);
  }

  const shownTotal = top.reduce((sum, e) => sum + e.total, 0);

  const slots: ExpenseCategorySlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const entry = top[i];
    if (!entry) {
      slots.push(null);
      continue;
    }
    const pct = shownTotal > 0 ? (entry.total / shownTotal) * 100 : 0;
    slots.push({ bucket: entry.bucket, total: entry.total, pct, color: colorFor(entry.bucket, i) });
  }
  return slots;
}
