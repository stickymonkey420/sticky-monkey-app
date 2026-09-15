import { formatMoney, formatChallengeWhen } from "@/lib/gameAfi/format";
import type { MatchSummary } from "@/lib/gameAfi/challengeTypes";

// Middle card of the Overview page's 3-card row (Allocation / Head to Head /
// Industry Concentration) -- shows both sides of the currently-selected
// match, not just your own numbers, since a head-to-head match is the one
// place in Game-a-Fi where showing an opponent's dollar figures is fine
// (both sides explicitly agreed to the match -- see game_afi_match_summary).
// Reuses PortfolioDonutCard's own card chrome (rounded-2xl border
// border-card-border bg-card-bg p-5, h-full) so all three cards in the row
// line up exactly.
function Side({
  label,
  name,
  username,
  totalValue,
  startingBalance,
  emphasize,
}: {
  label: string;
  name: string | null;
  username: string | null;
  totalValue: number;
  startingBalance: number;
  emphasize: boolean;
}) {
  const pl = totalValue - startingBalance;
  const plPct = startingBalance > 0 ? (pl / startingBalance) * 100 : 0;
  const positive = pl >= 0;
  return (
    <div className={`rounded-xl p-3 ${emphasize ? "bg-white/[0.04]" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <span className="min-w-0 truncate text-xs text-text-muted">
          {username ? `@${username}` : name || "Member"}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-lg font-bold text-text-primary">{formatMoney(totalValue)}</span>
        <span className="text-sm font-medium" style={{ color: positive ? "#3ddc97" : "#ff5c7a" }}>
          {positive ? "+" : ""}
          {formatMoney(pl)} ({positive ? "+" : ""}
          {plPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

export default function HeadToHeadCard({ loading, summary }: { loading: boolean; summary: MatchSummary | null }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Head to Head</h3>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !summary ? (
        <div className="text-sm text-text-muted">Match details unavailable.</div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2">
          <Side
            label="You"
            name={summary.me.name}
            username={summary.me.username}
            totalValue={summary.me.totalValue}
            startingBalance={summary.startingBalance}
            emphasize={summary.me.totalValue >= summary.opponent.totalValue}
          />
          <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-text-muted">vs</div>
          <Side
            label="Opponent"
            name={summary.opponent.name}
            username={summary.opponent.username}
            totalValue={summary.opponent.totalValue}
            startingBalance={summary.startingBalance}
            emphasize={summary.opponent.totalValue > summary.me.totalValue}
          />
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-text-muted">
            <span>Starting Capital {formatMoney(summary.startingBalance)}</span>
            {summary.expiresAt && <span>Ends {formatChallengeWhen(summary.expiresAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
