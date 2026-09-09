import { money } from "@/lib/options/queries";
import type { MetalHolding } from "@/lib/invest/types";

type VaultSummaryProps = {
  holdings: MetalHolding[];
  loading: boolean;
};

// Read-only list of every metal_holdings row (across both the "metals" and
// "sdira" account types -- see fetchMetalHoldings()), plus a one-line
// summary. Purely presentational, same fetch-once-in-the-parent split as
// PortfolioDonutCard: invest/page.tsx already fetches this same list for
// the Metals donut card, so this reuses it instead of querying twice.
//
// Add/Edit/Delete for vault holdings are a later (write) increment -- this
// is display only, mirroring how HoldingsTable/PremiumSummaryCards started
// read-only before Options/Holdings grew mutations.
export default function VaultSummary({ holdings, loading }: VaultSummaryProps) {
  const itemCount = holdings.length;
  const totalCurrentValue = holdings.reduce((sum, h) => sum + (Number(h.current_value) || 0), 0);
  const totalAcquisitionCost = holdings.reduce((sum, h) => sum + (Number(h.acquisition_cost) || 0), 0);

  return (
    <div id="vault-section" className="rounded-2xl border border-card-border bg-card-bg p-5 scroll-mt-6">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Vault</h3>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-card-border pb-4 text-sm">
        <span className="text-text-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <span className="text-text-muted">
          Total Value <span className="font-medium text-text-primary">{money(totalCurrentValue)}</span>
        </span>
        <span className="text-text-muted">
          Total Cost <span className="font-medium text-text-primary">{money(totalAcquisitionCost)}</span>
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : holdings.length === 0 ? (
        <div className="text-sm text-text-muted">No metal holdings in the vault yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Product
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Metal
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Quantity
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Ounces
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Current Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td className="py-2.5 pr-4 font-medium text-text-primary">{h.product_name}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{h.metal ?? "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {Number(h.quantity)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.ounces === null || h.ounces === undefined ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      Number(h.ounces)
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {money(Number(h.current_value) || 0)}
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
