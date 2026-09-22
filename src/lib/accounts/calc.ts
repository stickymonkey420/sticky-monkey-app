import { CATEGORICAL_PALETTE } from "@/lib/palette";
import { ACCOUNT_CATEGORIES, ACCOUNT_CATEGORY_LABELS, type AccountCategory, type ManualAccount } from "./types";

// Category -> color, in the SAME fixed order as ACCOUNT_CATEGORIES (which
// matches the table's own check constraint) -- a closed 6-value enum, so
// every category gets a direct fixed slot with no ranking/folding needed
// (unlike the ticker donuts in src/lib/invest/calc.ts).
export const ACCOUNT_CATEGORY_COLORS: Record<AccountCategory, string> = Object.fromEntries(
  ACCOUNT_CATEGORIES.map((cat, i) => [cat, CATEGORICAL_PALETTE[i]])
) as Record<AccountCategory, string>;

export type AccountsSummary = {
  totalAssets: number; // sum of balance for bank_account/business_account only
  totalCreditCardBalance: number; // sum of balance where category = credit_card
};

// This page is titled "Banking" -- its top summary cards are meant to
// reflect banking only (checking/savings/business accounts) net of credit
// card balances, not the account holder's entire net worth. Brokerage,
// retirement, and precious-metal accounts still show in their own
// sections below via groupAccountsByCategory, they just don't feed this
// summary -- that's what the Dashboard's own separate Net Worth card
// (src/lib/dashboard/netWorth.ts) is for.
export function computeAccountsSummary(accounts: ManualAccount[]): AccountsSummary {
  let totalAssets = 0;
  let totalCreditCardBalance = 0;
  accounts.forEach((a) => {
    const bal = Number(a.balance) || 0;
    if (a.category === "credit_card") totalCreditCardBalance += bal;
    else if (a.category === "bank_account" || a.category === "business_account") totalAssets += bal;
  });
  return { totalAssets, totalCreditCardBalance };
}

export type AccountCategoryGroup = {
  category: AccountCategory;
  label: string;
  color: string;
  accounts: ManualAccount[];
  subtotal: number;
};

// Groups accounts by category in the fixed ACCOUNT_CATEGORIES order
// (never re-sorted by amount) -- categories with no accounts are omitted
// rather than shown as an empty group.
export function groupAccountsByCategory(accounts: ManualAccount[]): AccountCategoryGroup[] {
  return ACCOUNT_CATEGORIES.map((category) => {
    const inCategory = accounts.filter((a) => a.category === category);
    const subtotal = inCategory.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    return {
      category,
      label: ACCOUNT_CATEGORY_LABELS[category],
      color: ACCOUNT_CATEGORY_COLORS[category],
      accounts: inCategory,
      subtotal,
    };
  }).filter((g) => g.accounts.length > 0);
}
