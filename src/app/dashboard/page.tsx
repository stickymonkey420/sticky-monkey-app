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
      {/* Single row, two columns: the left/center column stacks NetWorthCard
          (Asset Allocation + Net Worth) directly above Expense Categories
          and the charts below it, all in one flex-col with one gap -- so
          those lower cards start immediately after Net Worth/Asset
          Allocation with no dead space, regardless of how tall
          ProfileSummaryCard's column ends up being. items-start keeps
          either column from stretching to match the other's height. */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex min-w-0 w-full flex-1 flex-col gap-6">
          <NetWorthCard />
          <ExpenseCategoriesCard />
          <IncomeHistoryChart />
          <NetWorthHistoryChart />
          <LastTransactionsCard />
        </div>
        <ProfileSummaryCard />
      </div>
    </AppShell>
  );
}
