"use client";

import { useMemo, useState } from "react";
import { marketCapFmt, money, num1, pctColored, pctPlain } from "@/lib/screener/calc";
import type { StockUniverseRow } from "@/lib/screener/types";
import TickerDetailModal from "./TickerDetailModal";

// Column headers are click-to-sort, independent of the "Sort:" dropdown in
// ScreenerFilters -- that dropdown re-sorts the underlying `filtered` array
// server-side-feeling (it's really just filterAndSort() in lib/screener/
// calc.ts), while this is a lightweight client-side re-sort of whatever
// rows already made it through the filters, same pattern as
// OpenPositionsTable's sortable columns. Clicking a header always wins over
// the dropdown's order until the page is reloaded or filters change the row
// set again.
type SortKey = "ticker" | "company_name" | "sector" | "price" | "day_change_pct" | "market_cap" | "pe_ratio" | "dividend_yield";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "company_name", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "price", label: "Price", align: "right" },
  { key: "day_change_pct", label: "Day %", align: "right" },
  { key: "market_cap", label: "Market Cap", align: "right" },
  { key: "pe_ratio", label: "P/E", align: "right" },
  { key: "dividend_yield", label: "Div Yield", align: "right" },
];

// Nulls always sort to the bottom regardless of direction, so flipping
// direction never buries real values behind a wall of "--" rows.
function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// Clicking a ticker opens TickerDetailModal -- the same quote/Sticky Monkey
// Score/gauges card the Ticker Lookup search box renders, just pre-fetched
// for the row's ticker instead of typed in.
export default function ScreenerTable({ rows, total }: { rows: StockUniverseRow[]; total: number }) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => dir * compareValues(a[sortKey], b[sortKey]));
  }, [rows, sortKey, sortDir]);

  return (
    <>
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-3 text-xs text-text-muted">
          {rows.length} of {total} stocks · curated universe, not the full market
        </div>
        {rows.length === 0 ? (
          <div className="text-sm text-text-muted">No stocks match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={`whitespace-nowrap py-2 pr-4 select-none ${col.align === "right" ? "text-right" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-1 uppercase text-text-muted hover:text-text-primary ${
                          col.align === "right" ? "flex-row-reverse" : ""
                        }`}
                        aria-label={`Sort by ${col.label}`}
                      >
                        {col.label}
                        <span className="text-[10px] leading-none" style={{ color: sortKey === col.key ? "#4f8cff" : undefined }}>
                          {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedRows.map((r) => {
                  const chg = pctColored(r.day_change_pct);
                  return (
                    <tr key={r.ticker}>
                      <td className="whitespace-nowrap py-2.5 pr-4 font-medium">
                        <button
                          type="button"
                          onClick={() => setSelectedTicker(r.ticker)}
                          className="text-text-primary underline decoration-text-muted/40 underline-offset-2 hover:text-[#4f8cff] hover:decoration-[#4f8cff]"
                        >
                          {r.ticker}
                        </button>
                      </td>
                      <td className="max-w-[220px] truncate py-2.5 pr-4 text-text-muted" title={r.company_name ?? ""}>
                        {r.company_name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{r.sector ?? "—"}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(r.price)}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right" style={{ color: chg.color }}>
                        {chg.text}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                        {marketCapFmt(r.market_cap)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                        {num1(r.pe_ratio)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                        {pctPlain(r.dividend_yield)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedTicker && <TickerDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}
    </>
  );
}
