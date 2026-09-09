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

export default function DashboardPage() {
  return (
    <AppShell>
      <OnboardingModal />
      <h1 className="mb-6 text-xl font-semibold text-text-primary">Dashboard</h1>
      <div className="flex flex-col gap-6">
        <QuickAccessCard />
        <NetWorthCard />
        <InvestmentAlertCard />
        <IncomeCard />
        <ExpenseCategoriesCard />
        <IncomeHistoryChart />
        <NetWorthHistoryChart />
        <LastTransactionsCard />
      </div>
    </AppShell>
  );
}
