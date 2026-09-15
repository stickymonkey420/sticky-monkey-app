import AppShell from "@/components/layout/AppShell";
import NetWorthCard from "@/components/dashboard/NetWorthCard";
import ExpenseCategoriesCard from "@/components/dashboard/ExpenseCategoriesCard";
import IncomeHistoryChart from "@/components/dashboard/IncomeHistoryChart";
import NetWorthHistoryChart from "@/components/dashboard/NetWorthHistoryChart";
import LastTransactionsCard from "@/components/dashboard/LastTransactionsCard";
import OnboardingModal from "@/components/dashboard/OnboardingModal";
import ProfileSummaryCard from "@/components/dashboard/ProfileSummaryCard";

// Layout matches the live Webflow Dashboard page exactly: Asset Allocation
// + Net Worth (Net Worth now also embeds the Income week/month/YTD/
// collateral table, same as the live site) alongside the profile panel,
// then Expense Categories full-width below. Investment Alert and Quick
// Access are no longer separate full-width cards -- the live site only
// shows them nested inside the profile panel, so InvestmentAlertCard/
// QuickAccessCard now render there (see ProfileSummaryCard) instead of
// here. The old standalone "Options Income" total/realized card
// (IncomeCard) doesn't exist on the live site either -- dropped so the
// page matches; that data is still visible via the new Income table's
// Month/YTD columns.
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
        <IncomeHistoryChart />
        <NetWorthHistoryChart />
        <LastTransactionsCard />
      </div>
    </AppShell>
  );
}
