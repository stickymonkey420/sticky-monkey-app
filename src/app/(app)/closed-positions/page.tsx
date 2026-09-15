import ClosedPositionsTable from "@/components/closedPositions/ClosedPositionsTable";

// Port of the live Webflow Closed Positions page (page_id
// 6a7702a56745d0a69974f850, slug /closed-positions): a read-only history
// view of realized wheel_trades (expired/assigned/bought-to-close) and
// closed long_option_trades. No client state or auth check lives here --
// ClosedPositionsTable owns fetching, same as the pattern for Options'
// OpenPositionsTable. Server component (no "use client") since the page
// itself renders no interactivity of its own.
export default function ClosedPositionsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Closed Positions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Realized wheel trades and long option closes across your accounts.
        </p>
      </div>
      <ClosedPositionsTable />
    </>
  );
}
