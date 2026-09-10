import { fmtPct } from "@/lib/investors/calc";
import type { OwnerRow } from "@/lib/investors/calc";

// App Director-only. One row per distinct non-owner investor (aggregated
// across their entries), matching the live page's "Owners" section
// (First Name / Last Name / Ownership %).
export default function OwnersTable({ owners }: { owners: OwnerRow[] }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Owners</h3>
      {owners.length === 0 ? (
        <div className="text-sm text-text-muted">No confirmed investor equity yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-4">First Name</th>
                <th className="py-2 pr-4">Last Name</th>
                <th className="py-2 text-right">Ownership %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {owners.map((o) => (
                <tr key={o.email}>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">{o.firstName || "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">{o.lastName || "—"}</td>
                  <td className="whitespace-nowrap py-2.5 text-right text-text-primary">{fmtPct(o.ownershipPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
