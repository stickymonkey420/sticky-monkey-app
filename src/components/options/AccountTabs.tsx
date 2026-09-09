import type { AccountTypeOption } from "@/lib/options/types";

type AccountTabsProps = {
  options: AccountTypeOption[];
  selected: string | null;
  onSelect: (accountType: string) => void;
  loading: boolean;
};

// Tab switcher over `account_type_options` (filtered to wheel_eligible),
// the same source used by the live Webflow page's Add Trade modal account
// dropdown -- reused here so the tabs always match whichever accounts are
// actually wheel-eligible instead of a hardcoded brokerage/traditional/roth
// list. Purely presentational: the parent (options/page.tsx) owns fetching
// the option list and which account_type is currently selected, the same
// way it owns every other piece of this page's shared state.
export default function AccountTabs({ options, selected, onSelect, loading }: AccountTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-card-border bg-card-bg p-2">
      {loading && options.length === 0 ? (
        <div className="px-3 py-2 text-sm text-text-muted">Loading accounts…</div>
      ) : options.length === 0 ? (
        <div className="px-3 py-2 text-sm text-text-muted">
          No wheel-eligible accounts configured.
        </div>
      ) : (
        options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={
                "rounded-xl px-4 py-2 text-sm font-medium " +
                (active
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:bg-white/5 hover:text-text-primary")
              }
            >
              {opt.label}
            </button>
          );
        })
      )}
    </div>
  );
}
