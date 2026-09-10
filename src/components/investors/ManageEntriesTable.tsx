import { ENTRY_TYPE_LABELS, STATUS_LABELS, type CapTableEntry } from "@/lib/investors/types";
import { fmtDate, fmtPct, money } from "@/lib/investors/calc";

// App Director-only. Every cap_table_entries row (RLS already scopes
// fetchAllEntries to "all rows" for a director), with Edit/Delete --
// the actual insert/update/delete constraints are enforced server-side by
// check_cap_table_limits(), this table just lists + dispatches to the
// modal / delete confirm.
export default function ManageEntriesTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: CapTableEntry[];
  onEdit: (entry: CapTableEntry) => void;
  onDelete: (entry: CapTableEntry) => void;
}) {
  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Manage Entries</h3>
      {entries.length === 0 ? (
        <div className="text-sm text-text-muted">No cap table entries yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Equity</th>
                <th className="py-2 pr-3 text-right">Price Paid</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Board</th>
                <th className="py-2 pr-3">Acquired</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-primary">
                    {[e.first_name, e.last_name].filter(Boolean).join(" ") || e.email}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">{ENTRY_TYPE_LABELS[e.entry_type]}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right text-text-primary">{fmtPct(Number(e.equity_pct))}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right text-text-primary">
                    {money(e.price_paid, e.currency)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">{STATUS_LABELS[e.status]}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">{e.is_board_seat ? "Yes" : "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">{fmtDate(e.acquired_on)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      className="mr-3 text-xs font-semibold text-[#4f8cff]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(e)}
                      className="text-xs font-semibold text-[#e05656]"
                    >
                      Delete
                    </button>
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
