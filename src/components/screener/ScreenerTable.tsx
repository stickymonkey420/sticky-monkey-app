import { marketCapFmt, money, num1, pctColored, pctPlain } from "@/lib/screener/calc";
import type { StockUniverseRow } from "@/lib/screener/types";

export default function ScreenerTable({ rows, total }: { rows: StockUniverseRow[]; total: number }) {
  return (
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
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Ticker
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Company
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Sector
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Price
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Day %
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Market Cap
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  P/E
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Div Yield
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((r) => {
                const chg = pctColored(r.day_change_pct);
                return (
                  <tr key={r.ticker}>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">{r.ticker}</td>
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
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{num1(r.pe_ratio)}</td>
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
  );
}
