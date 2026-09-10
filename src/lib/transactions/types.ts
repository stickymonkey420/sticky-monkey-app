// Row shape returned by the `get_credit_card_transactions` Postgres RPC
// (SECURITY DEFINER; verified via pg_get_functiondef against project
// gxxjxslnsjgsuonnxxgq) -- this app can't read plaid_transactions joined
// to plaid_items directly (plaid_items is server-side only, RLS blocks
// every client read since it holds Plaid access tokens), so the RPC is
// the only path to a transaction's account/institution/mask, pre-scoped
// to auth.uid() and to credit_card-category accounts.
export type CreditCardTransactionRow = {
  transaction_id: string;
  plaid_transaction_id: string;
  transaction_date: string;
  name: string | null;
  merchant_name: string | null;
  amount: number | string;
  pending: boolean;
  category_bucket: string;
  account_id: string;
  account_name: string | null;
  institution_name: string | null;
  mask: string | null;
};

// Row shape for `custom_transaction_categories` -- unlike every other
// write path in this app, this table's INSERT/UPDATE/DELETE policies are
// NOT paid-gated (all four are just `user_id = auth.uid()`), so category
// management is free-tier from day one, matching `update_transaction_category`
// itself being ungated (verified via pg_get_functiondef -- it only checks
// the category is one of the 5 built-ins or one of the caller's own rows
// here, no role check).
export type CustomCategory = {
  id: string;
  user_id: string;
  key: string;
  label: string;
  color: string;
  created_at: string;
};

// One shape for both the 5 fixed built-ins and every row loaded from
// custom_transaction_categories -- everything downstream (the badge, the
// category picker menu) works off this, not the two source shapes above.
export type Category = { key: string; label: string; color: string };
