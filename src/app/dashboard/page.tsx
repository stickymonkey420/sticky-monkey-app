import AppShell from "@/components/layout/AppShell";
import NetWorthCard from "@/components/dashboard/NetWorthCard";
import InvestmentAlertCard from "@/components/dashboard/InvestmentAlertCard";
import IncomeCard from "@/components/dashboard/IncomeCard";
import ExpenseCategoriesCard from "@/components/dashboard/ExpenseCategoriesCard";
import IncomeHistoryChart from "@/components/dashboard/IncomeHistoryChart";
import NetWorthHistoryChart from "@/components/dashboard/NetWorthHistoryChart";
import QuickAccessCard from "@/components/dashboard/QuickAccessCard";
import LastTransactionsCard from "@/components/dashboard/LastTransactionsCard";
import OnboardingModal from "@/components/dashboard/OnboardingModal";
import ProfileSummaryCard from "@/components/dashboard/ProfileSummaryCard";

// Top row matches the reference mockup: Asset Allocation + Net Worth
// (already a paired flex-row inside NetWorthCard) alongside the new
// profile summary panel, with Expense Categories full-width below (left
// unbordered per the mockup, which doesn't highlight that card). The
// profile panel's Quick Access only surfaces "Add Option Trade" (matching
// the mockup); the original QuickAccessCard (which also has "Connect
// Finance") and the full InvestmentAlertCard (dismiss/delete + webhook
// setup) stay further down the page rather than being replaced, so none of
// that functionality is lost.
export default function DashboardPage() {
  return (
    <AppShell>
      <OnboardingModal />
      <h1 className="mb-6 text-xl font-semibold text-text-primary">Dashboard</h1>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            <NetWorthCard />
          </div>
          <ProfileSummaryCard />
        </div>
        <ExpenseCategoriesCard />
        <QuickAccessCard />
        <InvestmentAlertCard />
        <IncomeCard />
        <IncomeHistoryChart />
        <NetWorthHistoryChart />
        <LastTransactionsCard />
      </div>
    </AppShell>
  );
}
