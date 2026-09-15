"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchTickerQuote } from "@/lib/screener/queries";
import type { TickerQuoteResult } from "@/lib/screener/types";
import type { Role } from "@/lib/usersGroups/types";
import TickerQuoteCard from "./TickerQuoteCard";

// Port of the live script's ticker-search widget: a single input + button
// hitting the `ticker-quote-lookup` edge function, rendering a price card
// plus the two Peter Lynch gauges. Ported 1:1 down to the 4-column grid
// (ticker card spans columns 1-2, gauges stack in column 2).
export default function TickerLookup() {
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TickerQuoteResult | null>(null);

  // Signed-in user id + tier, fetched once and shared by both
  // AverageCostOwnedCard and BuyButton below instead of each fetching its
  // own copy.
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setUserId(null);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!cancelled && data) setRole((data as { role: Role }).role);
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doSearch() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setResult(null);
    setStatus(`Looking up ${sym}…`);
    const supabase = createClient();
    const res = await fetchTickerQuote(supabase, sym);
    if (!res.ok) {
      if (res.kind === "not_found") setStatus(`${sym} not found. Check the ticker and try again.`);
      else if (res.kind === "invalid_symbol") setStatus("Enter a valid ticker symbol.");
      else setStatus("Could not look up that ticker right now. Try again in a moment.");
      return;
    }
    setStatus("");
    setResult(res.data);
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Ticker Lookup</h3>
      <p className="mb-4 text-xs text-text-muted">
        Live quote plus 7 gauges for any ticker: Peter Lynch-style PEG and Debt/Equity valuation, Return on Equity,
        Return on Assets, Current Ratio, Net Profit Margin, and Price/Free Cash Flow -- tallied into a Sticky Monkey
        Score, compared against the ticker&apos;s industry peers, alongside a Graham Number intrinsic value estimate.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              doSearch();
            }
          }}
          placeholder="Ticker symbol (e.g. AAPL)"
          className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm uppercase text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={doSearch}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "#4f8cff" }}
        >
          Search
        </button>
      </div>

      {status && <div className="mb-4 text-sm text-text-muted">{status}</div>}

      {result && <TickerQuoteCard result={result} userId={userId} role={role} />}
    </div>
  );
}
