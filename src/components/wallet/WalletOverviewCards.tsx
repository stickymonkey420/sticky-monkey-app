import { money } from "@/lib/options/queries";
import type { WalletOverview } from "@/lib/wallet/calc";

type WalletOverviewCardsProps = {
  overview: WalletOverview;
  loading: boolean;
};

// Mirrors the live Webflow page's "wb-balance-value" / "wb-delta-wrapper" /
// "wb-income-value" / "wb-expense-value" elements: a prominent balance +
// this-month delta, plus all-time income/expense stat tiles below --
// same stat-tile layout PremiumSummaryCards uses for Options.
export default function WalletOverviewCards({ overview, loading }: WalletOverviewCardsProps) {
  const netUp = overview.netThisMonth >= 0;

  return (
    <div id="wallet-balance-card" className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Wallet Overview</h3>
      <div className="mb-1 text-3xl font-semibold text-text-primary">
        {loading ? "…" : money(overview.balance)}
      </div>
      <div className={`mb-4 text-sm ${netUp ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>
        {loading ? "" : `${netUp ? "▲" : "▼"} ${money(Math.abs(overview.netThisMonth))} this month`}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Income (all time)</div>
          <div className="text-lg font-semibold text-text-primary">
            {loading ? "…" : money(overview.totalIncome)}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Expenses (all time)</div>
          <div className="text-lg font-semibold text-text-primary">
            {loading ? "…" : money(overview.totalExpense)}
          </div>
        </div>
      </div>
    </div>
  );
}
