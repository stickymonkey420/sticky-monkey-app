import { money } from "@/lib/options/queries";
import type { ManualAccount } from "@/lib/accounts/types";

// Shared read+edit list for a single `manual_accounts` category (or a
// small set of related categories), used by Card Center (credit_card) and
// Invest Accounts (brokerage_account/retirement_account/precious_metal).
// Banking's own AccountsByCategoryTable stays separate and read-only --
// it spans every category at once for the net-worth-style overview, while
// this component is for a page that manages one category's accounts
// directly (edit/delete included).
export type ManualAccountListProps = {
  accounts: ManualAccount[];
  loading: boolean;
  emptyLabel: string;
  canEdit: boolean;
  editingId: string | null;
  deletingId: string | null;
  onStartEdit: (account: ManualAccount) => void;
  onCancelEdit: () => void;
  onDelete: (account: ManualAccount) => void;
  renderEditForm: (account: ManualAccount) => React.ReactNode;
  renderSubtext?: (account: ManualAccount) => string | null;
};

export default function ManualAccountList({
  accounts,
  loading,
  emptyLabel,
  canEdit,
  editingId,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onDelete,
  renderEditForm,
  renderSubtext,
}: ManualAccountListProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">{emptyLabel}</div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {accounts.map((a) => (
        <div key={a.id} className="rounded-xl bg-white/5 px-3.5 py-3">
          {editingId === a.id ? (
            renderEditForm(a)
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{a.account_name}</div>
                <div className="truncate text-xs text-text-muted">
                  {a.institution_name}
                  {renderSubtext?.(a) ? ` · ${renderSubtext(a)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-sm text-text-primary">{money(Number(a.balance))}</div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartEdit(a)}
                      className="text-xs text-[#4f8cff] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === a.id}
                      onClick={() => onDelete(a)}
                      className="text-xs text-[#ff5c7a] hover:underline disabled:opacity-50"
                    >
                      {deletingId === a.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {editingId === a.id && (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={onCancelEdit} className="text-xs text-text-muted hover:underline">
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
