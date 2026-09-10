// Row shape for `plaid_transactions`, verified column-by-column via the
// Supabase MCP `list_tables`/`execute_sql` tools against project
// gxxjxslnsjgsuonnxxgq. `ManualAccount` lives in src/lib/accounts/types.ts
// now (the Banking page's canonical home for that table) and is re-exported
// here since My Wallet's balance/spending calcs also read it.

export type { ManualAccount } from "@/lib/accounts/types";

// Only the columns the wallet's read-only charts/cards use -- this app
// never inserts/updates plaid_transactions from the client (no INSERT RLS
// policy exists for it; rows arrive via a server-side Plaid sync this app
// doesn't touch), so there's no mutation-side type to also define here.
export type PlaidTransaction = {
  amount: number | string;
  transaction_date: string;
  account_id: string | null;
};
