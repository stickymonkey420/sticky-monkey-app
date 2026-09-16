import NetWorthCard from "@/components/dashboard/NetWorthCard";
import ExpenseCategoriesCard from "@/components/dashboard/ExpenseCategoriesCard";
import IncomeHistoryChart from "@/components/dashboard/IncomeHistoryChart";
import NetWorthHistoryChart from "@/components/dashboard/NetWorthHistoryChart";
import LastTransactionsCard from "@/components/dashboard/LastTransactionsCard";
import GameAfiMirrorCard from "@/components/dashboard/GameAfiMirrorCard";
import OnboardingFlow from "@/components/dashboard/OnboardingFlow";

// Layout matches the live Webflow Dashboard page exactly: Asset Allocation
// + Net Worth (Net Worth now also embeds the Income week/month/YTD/
// collateral table, same as the live site) then Expense Categories
// full-width below. The profile panel (avatar, Current Balance,
// Investment Alert, Quick Access) is no longer part of this page -- it now
// lives in AppShell itself, same as the left sidebar, so it's present on
// every page instead of just Dashboard. The old standalone "Options
// Income" total/realized card (IncomeCard) doesn't exist on the live site
// either -- dropped so the page matches; that data is still visible via
// the new Income table's Month/YTD columns.
//
// Every card below now hides itself once loaded with nothing to show
// (returns null, or a chart stays `hidden`) per your call to drop
// zero/not-applicable cards instead of an all-$0 shell -- see each
// component's own comment for its specific "no data" definition. That
// means an established member sees their real Net Worth/Income/Expense/
// History/Transactions cards, while a brand-new member (or one who's only
// used Game-a-Fi) sees a much shorter page instead of five empty widgets.
//
// GameAfiMirrorCard is new: the Game-a-Fi Overview page's holdings +
// scoreboard row (Allocation donut, Head to Head jumbotron, opponent
// Holdings donut), mirrored here per your call so a member doesn't have to
// leave the Dashboard to check their match. Same self-hiding rule -- it
// renders nothing if there's no accepted Head to Head match yet.
export default function DashboardPage() {
  return (
    <>
      <OnboardingFlow />
      <h1 className="mb-6 text-xl font-semibold text-text-primary">Dashboard</h1>
      <div className="flex min-w-0 w-full flex-col gap-6">
        <NetWorthCard />
        <ExpenseCategoriesCard />
        <IncomeHistoryChart />
        <NetWorthHistoryChart />
        <LastTransactionsCard />
        <GameAfiMirrorCard />
      </div>
    </>
  );
}
