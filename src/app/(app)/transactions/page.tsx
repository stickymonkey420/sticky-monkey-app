"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import { createClient } from "@/lib/supabase/client";
import {
  addCustomCategory,
  fetchCreditCardTransactions,
  fetchCustomCategories,
  updateTransactionCategory,
} from "@/lib/transactions/queries";
import { buildCategoryList, nextCustomCategoryColor, slugifyCategoryLabel } from "@/lib/transactions/calc";
import type { CreditCardTransactionRow, CustomCategory } from "@/lib/transactions/types";

// Port of the live Webflow "Transactions" page (page id
// 665f5b07319971d77a6e1318): credit-card transaction history with a
// search box and per-row category picker. Fully read+write from the
// first increment -- unlike Options/Holdings/Banking, categorization
// here isn't paid-gated (see lib/transactions/queries.ts), so there's no
// write slice to defer.
export default function TransactionsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<CreditCardTransactionRow[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      if (!cancelled) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setUserId(null);
          setTransactions([]);
          setCustomCategories([]);
          setLoading(false);
        }
        return;
      }

      const [txRows, customRows] = await Promise.all([
        fetchCreditCardTransactions(supabase, 100),
        fetchCustomCategories(supabase, user.id),
      ]);
      if (cancelled) return;
      setUserId(user.id);
      setTransactions(txRows);
      setCustomCategories(customRows);
      setLoading(false);
    }

    load();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const categories = useMemo(() => buildCategoryList(customCategories), [customCategories]);

  async function handleChangeCategory(transactionId: string, key: string) {
    // Optimistic update -- the live script updates the badge immediately
    // on a successful response, so this matches that (and reverts on
    // failure rather than leaving a stale badge).
    const prev = transactions;
    setTransactions((rows) =>
      rows.map((t) => (t.transaction_id === transactionId ? { ...t, category_bucket: key } : t))
    );
    const supabase = createClient();
    const { error } = await updateTransactionCategory(supabase, transactionId, key);
    if (error) {
      console.error("updateTransactionCategory failed", error);
      setTransactions(prev);
    }
  }

  async function handleAddCategory(label: string): Promise<string | null> {
    if (!userId) return null;
    const existingKeys = new Set([
      "food_grocery",
      "transport",
      "medical",
      "shopping",
      "bill_others",
      ...customCategories.map((c) => c.key),
    ]);
    // If a category with this exact label already exists, reuse it
    // instead of creating a duplicate -- matches the live script's
    // addCustomCategory() short-circuit.
    const existing = customCategories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) return existing.key;

    const key = slugifyCategoryLabel(label, existingKeys);
    const color = nextCustomCategoryColor(customCategories.length);
    const supabase = createClient();
    const { category, error } = await addCustomCategory(supabase, userId, key, label, color);
    if (error || !category) {
      console.error("addCustomCategory failed", error);
      return null;
    }
    setCustomCategories((rows) => [...rows, category]);
    return category.key;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Transactions</h1>
      </div>
      <TransactionsTable
        transactions={transactions}
        categories={categories}
        loading={loading}
        onChangeCategory={handleChangeCategory}
        onAddCategory={handleAddCategory}
      />
    </>
  );
}
