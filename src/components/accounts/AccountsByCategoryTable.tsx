import { money } from "@/lib/options/queries";
import type { AccountCategoryGroup } from "@/lib/accounts/calc";

import type { ManualAccount } from "@/lib/accounts/types";

type AccountsByCategoryTableProps = {
  groups: AccountCategoryGroup[];
  loading: boolean;
  // Omitted (free tier) = read-only rows, no Edit button.
  onEdit?: (a: ManualAccount) => void;
};

// Read-only account list grouped by category (bank/brokerage/retirement/
// metals/business/credit card), matching the fixed category order the
// live "Banking" page (Webflow slug invest-accounts, page id
// 6a858f3b38fe00bf9eef4550) manages accounts under. Add/Connect/Edit are
// a later write increment -- both require `paid`/`app_director` per RLS
// (manual_accounts INSERT/UPDATE/DELETE policies), so this first slice is
// read-only the same way Options/Holdings started.
export default function AccountsByCategoryTable({ groups, loading, onEdit }: AccountsByCategoryTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        Loading accounts…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        No accounts yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.category} className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <h3 className="text-sm font-semibold text-text-primary">{group.label}</h3>
            </div>
            <div className="text-sm font-medium text-text-muted">{money(group.subtotal)}</div>
          </div>
          <div className="flex flex-col divide-y divide-card-border">
            {group.accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-text-primary">{a.account_name}</div>
                  <div className="truncate text-xs text-text-muted">
                    {a.institution_name}
                    {a.mask ? ` ···${a.mask}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-sm text-text-primary">{money(Number(a.balance))}</div>
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(a)} className="text-xs font-semibold text-[#4f8cff] hover:underline">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
