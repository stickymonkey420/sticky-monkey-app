import { fmtDate, fmtPct, money } from "@/lib/investors/calc";
import { ENTRY_TYPE_LABELS, STATUS_LABELS, type CapTableEntry } from "@/lib/investors/types";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#3ddc97",
  pending: "hsla(223.9,28.67%,71.96%,1)",
  cancelled: "#ff5c5c",
};

// "Your Equity" -- visible to every signed-in user, scoped to their own
// rows by cap_table_select_own_or_director RLS. Columns match the live
// static page exactly: Type, Equity, Price Paid, Acquired, Lockup
// Expires, Status.
export default function YourEquityTable({ entries }: { entries: CapTableEntry[] }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Your Equity</h3>
      <p className="mb-4 text-xs text-text-muted">
        Equity in Sticky Monkey Finance is currently reserved for a small group of hand-picked board members, subject
        to a 5-year lockup and an 8% individual holding cap.
      </p>
      {entries.length === 0 ? (
        <div className="text-sm text-text-muted">You don&apos;t currently hold any equity.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4 text-right">Equity</th>
                <th className="py-2 pr-4 text-right">Price Paid</th>
                <th className="py-2 pr-4">Acquired</th>
                <th className="py-2 pr-4">Lockup Expires</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">{ENTRY_TYPE_LABELS[e.entry_type]}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{fmtPct(Number(e.equity_pct))}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {money(e.price_paid, e.currency)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{fmtDate(e.acquired_on)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{fmtDate(e.lockup_expires_on)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4" style={{ color: STATUS_COLORS[e.status] }}>
                    {STATUS_LABELS[e.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
