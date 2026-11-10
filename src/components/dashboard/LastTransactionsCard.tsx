"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { BUILTIN_CATEGORIES, fmtDate, fmtTime, labelFor, money } from "@/lib/dashboard/transactions";
import type { PlaidTransactionRow, TransactionCategory } from "@/lib/types/dashboard";

export default function LastTransactionsCard() {
  const [transactions, setTransactions] = useState<PlaidTransactionRow[]>([]);
  const [categories, setCategories] = useState<TransactionCategory[]>(BUILTIN_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  // Menu is portaled to <body> with fixed positioning: the card is the last
  // one on the page and AppShell's overflow-x-hidden content column clipped
  // the old absolute dropdown, so the ⋯ click looked like it did nothing.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
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
    // pointerdown, not click: App Router's React root is the document, so a
    // document "click" listener ran in the same click that opened the menu
    // and closed it instantly (the ⋯ looked dead). Clicks on a ⋯ toggle are
    // ignored here so its own onClick can open/close the menu.
    function onDocClick(e: Event) {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-tx-menu-toggle]")) return;
      if (menuRef.current && !menuRef.current.contains(target as Node)) {
        setOpenMenuFor(null);
      }
    }
    function close(e?: Event) {
      if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpenMenuFor(null);
    }
    document.addEventListener("pointerdown", onDocClick);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  function toggleMenu(txId: string, btn: HTMLElement) {
    if (openMenuFor === txId) {
      setOpenMenuFor(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    const W = 190;
    const GAP = 4;
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const want = Math.min(320, categories.length * 36 + 12);
    const openUp = below < want && above > below;
    const maxH = Math.max(120, Math.min(320, openUp ? above : below));
    const top = openUp ? r.top - GAP - Math.min(want, maxH) : r.bottom + GAP;
    const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
    setMenuPos({ top, left, maxH });
    setOpenMenuFor(txId);
  }

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

  // Hidden once loaded with nothing to show, per your call to drop
  // zero/not-applicable Dashboard cards instead of a static "No
  // transactions yet." shell.
  if (!loading && transactions.length === 0) return null;

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
                      toggleMenu(t.id, e.currentTarget);
                    }}
                    className="rounded px-2 py-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
                    data-tx-menu-toggle=""
                    aria-label="Change category"
                  >
                    ⋯
                  </button>
                  {openMenuFor === t.id && menuPos && createPortal(
                    <div
                      ref={menuRef}
                      style={{ position: "fixed", top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxH }}
                      className="z-[60] w-[190px] overflow-y-auto rounded-lg border border-[#2c3448] bg-[#1b2130] p-1.5 shadow-xl"
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
                    </div>,
                    document.body,
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
