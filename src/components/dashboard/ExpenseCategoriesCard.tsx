"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  RING_TRACK_COLOR,
  labelFor,
  monthBounds,
  rankExpenseCategories,
} from "@/lib/dashboard/expenseCategories";
import type { ExpenseCategorySlot, ExpenseCategoryTotalRow } from "@/lib/types/dashboard";

const SLOT_COUNT = 5;

export default function ExpenseCategoriesCard() {
  const [slots, setSlots] = useState<ExpenseCategorySlot[]>(Array(SLOT_COUNT).fill(null));
  const [loading, setLoading] = useState(true);

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

      const { start, end } = monthBounds();
      const { data, error } = await supabase.rpc("get_expense_category_totals", {
        p_start: start,
        p_end: end,
      });

      if (cancelled) return;
      const rows: ExpenseCategoryTotalRow[] = error ? [] : data || [];
      setSlots(rankExpenseCategories(rows, SLOT_COUNT));
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

  const visibleSlots = slots.filter((s): s is NonNullable<ExpenseCategorySlot> => s !== null);
  // rankExpenseCategories always pads out to SLOT_COUNT with known
  // categories at 0% (the live site's "5-slot patch" behavior) rather than
  // returning fewer slots, so visibleSlots.length===0 never actually
  // happens once loaded -- the real "nothing to show" signal is every slot
  // sitting at $0, which is what actually hides the card per your call.
  const hasRealSpend = visibleSlots.some((s) => s.total > 0);

  if (!loading && !hasRealSpend) return null;

  return (
    <div id="expense-categories-card" className="rounded-[30px] p-[30px]" style={{ backgroundColor: "#151b28" }}>
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Expense Categories</h3>
      {!loading && visibleSlots.length === 0 ? (
        <div className="text-sm text-text-muted">No spending recorded this month.</div>
      ) : (
        <div className="flex flex-wrap justify-around gap-6">
          {(loading ? Array(SLOT_COUNT).fill(null) : slots).map((slot, i) =>
            slot === null && loading ? (
              <div key={i} className="flex flex-col items-center gap-2">
                <div
                  className="h-[88px] w-[88px] rounded-full"
                  style={{ backgroundColor: RING_TRACK_COLOR }}
                />
                <div className="h-3 w-16 rounded bg-white/10" />
              </div>
            ) : slot === null ? null : (
              <div key={slot.bucket} className="flex flex-col items-center gap-2">
                <div className="relative h-[88px] w-[88px]">
                  <div
                    className="h-[88px] w-[88px] rounded-full"
                    style={{
                      backgroundImage:
                        slot.pct > 0
                          ? `conic-gradient(${slot.color} 0% ${Math.min(100, Math.max(0, slot.pct))}%, ${RING_TRACK_COLOR} ${Math.min(100, Math.max(0, slot.pct))}% 100%)`
                          : "none",
                      backgroundColor: slot.pct > 0 ? undefined : RING_TRACK_COLOR,
                    }}
                  />
                  <div className="absolute inset-[10px] flex items-center justify-center rounded-full bg-card-bg text-sm font-semibold text-text-primary">
                    {Math.round(slot.pct)}%
                  </div>
                </div>
                <div className="max-w-[100px] text-center text-xs text-text-muted">
                  {labelFor(slot.bucket)}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
