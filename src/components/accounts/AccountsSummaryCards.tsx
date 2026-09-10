import { money } from "@/lib/options/queries";
import type { AccountsSummary } from "@/lib/accounts/calc";

type AccountsSummaryCardsProps = {
  summary: AccountsSummary;
  loading: boolean;
};

export default function AccountsSummaryCards({ summary, loading }: AccountsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-2 text-xs font-medium text-text-muted">Total Assets</div>
        <div className="text-2xl font-semibold text-text-primary">
          {loading ? "…" : money(summary.totalAssets)}
        </div>
      </div>
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-2 text-xs font-medium text-text-muted">Credit Card Balance</div>
        <div className="text-2xl font-semibold text-text-primary">
          {loading ? "…" : money(summary.totalCreditCardBalance)}
        </div>
      </div>
    </div>
  );
}
