"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchTickerQuote } from "@/lib/screener/queries";
import type { TickerQuoteResult } from "@/lib/screener/types";
import type { Role } from "@/lib/usersGroups/types";
import TickerQuoteCard from "./TickerQuoteCard";

// Opened by clicking a ticker row in ScreenerTable -- same quote/Sticky
// Monkey Score/gauges card TickerLookup's search box renders, just fetched
// automatically for the clicked ticker instead of typed in. Follows the
// same overlay pattern as BuyPaperTradeModal/EntryFormModal (click the
// backdrop to close). Wider than those two (max-w-[1280px], about the main Screener page width) since this card's
// gauge grid and side-by-side Score/Buy columns need the room -- on
// TickerLookup's own page it just runs the page's full width instead.
export default function TickerDetailModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [status, setStatus] = useState(`Looking up ${ticker}…`);
  const [result, setResult] = useState<TickerQuoteResult | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        setUserId(user.id);
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!cancelled && data) setRole((data as { role: Role }).role);
      }

      const res = await fetchTickerQuote(supabase, ticker);
      if (cancelled) return;
      if (!res.ok) {
        if (res.kind === "not_found") setStatus(`${ticker} not found.`);
        else if (res.kind === "invalid_symbol") setStatus("Invalid ticker symbol.");
        else setStatus("Could not look up that ticker right now. Try again in a moment.");
        return;
      }
      setStatus("");
      setResult(res.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-[1280px] overflow-y-auto rounded-3xl bg-card-bg p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">{ticker}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>

        {status && <div className="text-sm text-text-muted">{status}</div>}
        {result && <TickerQuoteCard result={result} userId={userId} role={role} compact />}
      </div>
    </div>
  );
}
