// Row shapes for the My Wallet page. Both tables verified column-by-column
// via the Supabase MCP `list_tables`/`execute_sql` tools against project
// gxxjxslnsjgsuonnxxgq. Numeric columns are typed `number | string` to
// match the existing convention (see src/lib/options/types.ts) since
// numeric columns can come back from supabase-js as strings.

export type ManualAccount = {
  id: string;
  user_id: string;
  category: string; // e.g. "checking", "savings", "credit_card" -- free-text column, not a DB enum
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

// Only the columns the wallet's read-only charts/cards use -- this app
// never inserts/updates plaid_transactions from the client (no INSERT RLS
// policy exists for it; rows arrive via a server-side Plaid sync this app
// doesn't touch), so there's no mutation-side type to also define here.
export type PlaidTransaction = {
  amount: number | string;
  transaction_date: string;
  account_id: string | null;
};
