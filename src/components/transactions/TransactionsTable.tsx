"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import { categoryByKey, fmtLongDate, filterTransactions } from "@/lib/transactions/calc";
import type { Category, CreditCardTransactionRow } from "@/lib/transactions/types";
import CategoryBadge from "./CategoryBadge";
import CategoryPicker from "./CategoryPicker";

type TransactionsTableProps = {
  transactions: CreditCardTransactionRow[];
  categories: Category[];
  loading: boolean;
  onChangeCategory: (transactionId: string, key: string) => void;
  onAddCategory: (label: string) => Promise<string | null>;
};

// Read+write port of the live Webflow "Transactions" page (page id
// 665f5b07319971d77a6e1318): a search box, and a table of credit-card
// transactions with an inline category picker per row. Categorization
// (custom_transaction_categories + update_transaction_category) is free
// tier -- see queries.ts / calc.ts for why -- so unlike Options/Holdings
// this page has no separate paid-gated write increment to defer.
export default function TransactionsTable({
  transactions,
  categories,
  loading,
  onChangeCategory,
  onAddCategory,
}: TransactionsTableProps) {
  const [query, setQuery] = useState("");
  const filtered = filterTransactions(transactions, categories, query);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Credit Card Transactions</h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transactions…"
          autoComplete="off"
          className="w-full max-w-xs rounded-lg border border-card-border bg-[#0f131c] px-3.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-text-muted">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-muted">No credit card transactions yet.</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-muted">No transactions match your search.</div>
      ) : (
        <div className="flex flex-col divide-y divide-card-border">
          {filtered.map((t) => {
            const amount = Number(t.amount) || 0;
            const isCredit = amount < 0;
            const cat = categoryByKey(categories, t.category_bucket);
            return (
              <div key={t.transaction_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {t.merchant_name || t.name || "Unknown"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={cat} fallbackLabel={t.category_bucket || "Uncategorized"} />
                    <span className="text-xs text-text-muted">{fmtLongDate(t.transaction_date)}</span>
                  </div>
                </div>
                <div className="w-32 shrink-0 truncate text-xs text-text-muted">
                  {t.account_name || "Card"}
                  {t.mask ? ` ···${t.mask}` : ""}
                </div>
                <div
                  className="w-24 shrink-0 text-right text-sm font-medium"
                  style={{ color: isCredit ? "#3ddc97" : "#e05353" }}
                >
                  {/* money() already prepends "-" for a negative (credit)
                      amount; a positive (charge) amount shows no sign,
                      matching the live script's convention. */}
                  {money(amount)}
                </div>
                <span
                  className="w-16 shrink-0 rounded-full border px-2 py-0.5 text-center text-xs font-semibold"
                  style={
                    t.pending
                      ? { borderColor: "#f2c200", color: "#f2c200" }
                      : { borderColor: "#3ddc97", color: "#3ddc97" }
                  }
                >
                  {t.pending ? "Pending" : "Posted"}
                </span>
                <CategoryPicker
                  categories={categories}
                  current={cat}
                  onSelect={(key) => onChangeCategory(t.transaction_id, key)}
                  onAddCategory={onAddCategory}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
