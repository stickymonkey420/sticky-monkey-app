import WeeklyIncomeSimulator from "@/components/simulator/WeeklyIncomeSimulator";

// Port of the live Webflow "Simulator" page (page id 6a8cd798d6044b9cc6fbe79f).
// The page's own body is essentially just an anchor element the footer
// script injects the widget in front of -- all of the real content lives in
// that script (ported to WeeklyIncomeSimulator).
export default function SimulatorPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Simulator</h1>
      </div>
      <WeeklyIncomeSimulator />
    </>
  );
}
