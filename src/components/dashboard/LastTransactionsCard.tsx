"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUILTIN_CATEGORIES, fmtDate, fmtTime, labelFor, money } from "@/lib/dashboard/transactions";
import type { PlaidTransactionRow, TransactionCategory } from "@/lib/types/dashboard";

export default function LastTransactionsCard() {
  const [transactions, setTransactions] = useState<PlaidTransactionRow[]>([]);
  const [categories, setCategories] = useState<TransactionCategory[]>(BUILTIN_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [{ data: customCats }, { data: txRows, error: txError }] = await Promise.all([
        supabase
          .from("custom_transaction_categories")
          .select("key,label,color")
          .order("created_at", { ascending: true }),
        supabase
          .from("plaid_transactions")
          .select("id,transaction_date,name,merchant_name,amount,pending,category_bucket,created_at")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (cancelled) return;
      setCategories([...BUILTIN_CATEGORIES, ...((customCats as TransactionCategory[]) || [])]);
      setTransactions(txError ? [] : (txRows as PlaidTransactionRow[]) || []);
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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuFor(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function selectCategory(txId: string, catKey: string) {
    setOpenMenuFor(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_transaction_category", {
      p_transaction_id: txId,
      p_category: catKey,
    });
    if (error) return;
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, category_bucket: catKey } : t)));
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Last Transactions</h3>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="text-sm text-text-muted">No transactions yet.</div>
      ) : (
        <div className="flex flex-col divide-y divide-white/10">
          {transactions.map((t) => {
            const cat = categories.find((c) => c.key === t.category_bucket);
            const amount = Number(t.amount) || 0;
            return (
              <div key={t.id} className="flex items-center gap-4 py-3 text-sm">
                <div className="w-32 shrink-0" style={{ color: cat?.color || undefined }}>
                  <span className={cat ? "" : "text-text-muted"}>{labelFor(t.category_bucket, categories)}</span>
                </div>
                <div className="flex-1 truncate text-text-primary">{t.merchant_name || t.name || "Transaction"}</div>
                <div className="w-36 shrink-0 text-xs text-text-muted">{fmtDate(t.transaction_date)}</div>
                <div className="w-16 shrink-0 text-xs text-text-muted">{fmtTime(t.created_at)}</div>
                <div
                  className="w-24 shrink-0 text-right font-medium"
                  style={{ color: amount < 0 ? "#3ddc97" : "#e05353" }}
                >
                  {amount < 0 ? "-" : ""}
                  {money(amount)}
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuFor(openMenuFor === t.id ? null : t.id);
                    }}
                    className="rounded px-2 py-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
                    aria-label="Change category"
                  >
                    ⋯
                  </button>
                  {openMenuFor === t.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-full z-20 mt-1 max-h-[320px] w-[190px] overflow-y-auto rounded-lg border border-[#2c3448] bg-[#1b2130] p-1.5 shadow-xl"
                    >
                      {categories.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => selectCategory(t.id, c.key)}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-[#e6e9f0] hover:bg-[#2c3448]"
                        >
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
