// Row shape for the `manual_accounts` table (the Banking/Accounts page's
// canonical owner -- My Wallet's balance/spending calcs import this type
// too, since both pages read the same table). Verified column-by-column
// via the Supabase MCP `execute_sql`/`list_tables` tools against project
// gxxjxslnsjgsuonnxxgq. Numeric columns are typed `number | string` to
// match the existing convention (see src/lib/options/types.ts) since
// numeric columns can come back from supabase-js as strings.

export type ManualAccount = {
  id: string;
  user_id: string;
  category: AccountCategory;
  institution_name: string;
  account_name: string;
  balance: number | string;
  interest_rate: number | string | null;
  annual_fee: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  retirement_type: string | null;
  ira_asset_type: string | null;
  mask: string | null;
  account_subtype: string | null;
};

// Matches the table's `category` check constraint exactly (verified via
// pg_get_constraintdef against manual_accounts_category_check). Fixed
// order here doubles as the fixed categorical color order the Banking
// page's category dots use -- see src/lib/accounts/calc.ts.
export const ACCOUNT_CATEGORIES = [
  "bank_account",
  "brokerage_account",
  "retirement_account",
  "precious_metal",
  "business_account",
  "credit_card",
] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const ACCOUNT_CATEGORY_LABELS: Record<AccountCategory, string> = {
  bank_account: "Bank Accounts",
  brokerage_account: "Brokerage",
  retirement_account: "Retirement",
  precious_metal: "Precious Metals",
  business_account: "Business",
  credit_card: "Credit Cards",
};
