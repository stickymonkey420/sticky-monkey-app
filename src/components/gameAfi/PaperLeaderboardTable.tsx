import { money } from "@/lib/options/queries";
import type { PaperLeaderboardRow } from "@/lib/gameAfi/paperTypes";

// Same shape as LeaderboardTable (Phase 1's live leaderboard) but with a
// dollar-return column -- fine to show here since it's simulated money,
// not a real account balance.
export default function PaperLeaderboardTable({
  rows,
  currentUserId,
  emptyLabel,
}: {
  rows: PaperLeaderboardRow[];
  currentUserId: string | null;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-text-muted">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
            <th className="py-2 pr-4">Rank</th>
            <th className="py-2 pr-4">Member</th>
            <th className="py-2 pr-4 text-right">$ Return</th>
            <th className="py-2 text-right">% Return</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((r) => {
            const isMe = r.user_id === currentUserId;
            const positive = r.pct_return >= 0;
            const color = positive ? "#3ddc97" : "#ff5c7a";
            return (
              <tr key={r.user_id} className={isMe ? "bg-white/5" : undefined}>
                <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">
                  {r.display_name}
                  {isMe && <span className="ml-2 text-xs text-text-muted">(you)</span>}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-right font-medium" style={{ color }}>
                  {r.dollar_return >= 0 ? "+" : ""}
                  {money(r.dollar_return)}
                </td>
                <td className="whitespace-nowrap py-2.5 text-right font-medium" style={{ color }}>
                  {positive ? "+" : ""}
                  {r.pct_return.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
