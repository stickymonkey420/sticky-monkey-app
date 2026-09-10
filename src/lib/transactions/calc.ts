import { CATEGORICAL_PALETTE } from "@/lib/palette";
import type { Category, CreditCardTransactionRow, CustomCategory } from "./types";

// The 5 built-in category keys `update_transaction_category` accepts
// without a custom_transaction_categories row backing them (hardcoded in
// its own validation, see queries.ts) -- keys and labels are fixed by
// that function's contract, but colors are re-picked here from the shared
// fixed categorical order. The live script's own hex set (#f2994a orange,
// #56ccf2 light blue, #eb5757 red, #bb6bd9 purple, #8a94a6 gray) fails the
// dataviz validator: the gray is below the chroma floor (0.029, "reads
// gray") and two others sit outside the lightness band -- the same class
// of problem the Invest/Wallet donuts had.
export const BUILTIN_CATEGORIES: Category[] = [
  { key: "food_grocery", label: "Food & Grocery", color: CATEGORICAL_PALETTE[0] },
  { key: "transport", label: "Transport", color: CATEGORICAL_PALETTE[1] },
  { key: "medical", label: "Medical", color: CATEGORICAL_PALETTE[2] },
  { key: "shopping", label: "Shopping", color: CATEGORICAL_PALETTE[3] },
  { key: "bill_others", label: "Bills & Other", color: CATEGORICAL_PALETTE[4] },
];

// Custom categories are open-ended (a user can name as many as they like),
// unlike every other categorical encoding in this app -- there's no
// "fold into Other" available here since each is a distinct, deliberately
// user-named tag, not a ranked slice of a fixed total. Slots 5-7 of the
// shared palette continue the fixed order; past that this intentionally
// cycles back through them rather than inventing new hues, since the
// always-visible label text (not the dot alone) carries identity once a
// palette is fully spoken for -- the same fallback the dataviz skill
// allows for a fully-labeled legend.
export function nextCustomCategoryColor(existingCustomCount: number): string {
  return CATEGORICAL_PALETTE[(BUILTIN_CATEGORIES.length + existingCustomCount) % CATEGORICAL_PALETTE.length];
}

export function buildCategoryList(custom: CustomCategory[]): Category[] {
  return BUILTIN_CATEGORIES.concat(custom.map((c) => ({ key: c.key, label: c.label, color: c.color })));
}

export function categoryByKey(categories: Category[], key: string): Category | null {
  return categories.find((c) => c.key === key) || null;
}

// Same slugify as the live script: lowercase, non-alnum runs collapse to
// a single underscore, trimmed, and de-duplicated against every existing
// key (built-in or custom) by appending _2, _3, ... .
export function slugifyCategoryLabel(label: string, existingKeys: Set<string>): string {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) base = "category";
  let key = base;
  let n = 2;
  while (existingKeys.has(key)) {
    key = `${base}_${n}`;
    n++;
  }
  return key;
}

export function fmtLongDate(dateStr: string): string {
  try {
    const dt = new Date(dateStr + "T00:00:00");
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Client-side search across everything visible in a row, same fields the
// live script matched: merchant/name, transaction id, date, amount, card
// name, category, and pending/posted status.
export function filterTransactions(
  rows: CreditCardTransactionRow[],
  categories: Category[],
  query: string
): CreditCardTransactionRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((t) => {
    const cat = categoryByKey(categories, t.category_bucket);
    const haystack = [
      t.merchant_name,
      t.name,
      t.plaid_transaction_id,
      fmtLongDate(t.transaction_date),
      t.account_name,
      cat?.label,
      t.pending ? "pending" : "posted",
      String(Number(t.amount) || 0),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
