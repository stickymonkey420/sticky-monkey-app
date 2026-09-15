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
        {/* items-start is the fix here: without it, flexbox's default
            align-items:stretch makes the shorter NetWorthCard column
            stretch to match ProfileSummaryCard's taller height, leaving a
            dead empty gap below its actual card content before
            ExpenseCategoriesCard begins. items-start lets each column be
            only as tall as its own content. */}
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="min-w-0 w-full flex-1">
            <NetWorthCard />
          </div>
          <ProfileSummaryCard />
        </div>
        {/* The center column below must stop at the same right edge as
            NetWorthCard above -- it must not spill into the width reserved
            for ProfileSummaryCard's column. Re-declaring the same two-column
            row (content + an invisible md:w-80 spacer matching
            ProfileSummaryCard's width) keeps that right-hand gutter reserved
            all the way down the page, even though ProfileSummaryCard itself
            only renders once, in the row above. */}
        <div className="flex w-full flex-col items-start gap-6 lg:flex-row">
          <div className="flex min-w-0 w-full flex-1 flex-col gap-6">
            <ExpenseCategoriesCard />
            <IncomeHistoryChart />
            <NetWorthHistoryChart />
            <LastTransactionsCard />
          </div>
          <div aria-hidden="true" className="hidden md:block md:w-80 md:shrink-0" />
        </div>
      </div>
    </AppShell>
  );
}
