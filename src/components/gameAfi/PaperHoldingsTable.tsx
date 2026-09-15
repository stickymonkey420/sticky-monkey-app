import { money } from "@/lib/options/queries";
import type { PaperHolding } from "@/lib/gameAfi/paperTypes";

// The "Holdings" table for the Monkey Monkey (paper trading) account --
// extracted out of PaperTradeWidget so it can also stand alone on its own
// nav page (Game-a-Fi > Holdings), for anyone who just wants to check
// their paper positions without the tiles/trade form.
export default function PaperHoldingsTable({ holdings }: { holdings: PaperHolding[] }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Holdings</h3>
      {holdings.length === 0 ? (
        <div className="text-sm text-text-muted">No open positions yet -- place your first trade to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-4">Ticker</th>
                <th className="py-2 pr-4 text-right">Shares</th>
                <th className="py-2 pr-4 text-right">Avg Cost</th>
                <th className="py-2 pr-4 text-right">Price</th>
                <th className="py-2 pr-4 text-right">Value</th>
                <th className="py-2 text-right">Unrealized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {holdings.map((h) => (
                <tr key={h.ticker}>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">{h.ticker}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{h.shares}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(h.avgCost)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.currentPrice === null ? "—" : money(h.currentPrice)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.marketValue === null ? "—" : money(h.marketValue)}
                  </td>
                  <td
                    className="whitespace-nowrap py-2.5 text-right font-medium"
                    style={{ color: (h.unrealizedPl ?? 0) >= 0 ? "#3ddc97" : "#ff5c7a" }}
                  >
                    {h.unrealizedPl === null ? "—" : `${h.unrealizedPl >= 0 ? "+" : ""}${money(h.unrealizedPl)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
