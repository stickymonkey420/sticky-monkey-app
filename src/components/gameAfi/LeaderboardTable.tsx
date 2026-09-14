import type { LeaderboardRow } from "@/lib/gameAfi/types";

// Shared table for both the weekly and season leaderboards -- rank,
// display name, and % return only (no dollar amounts, ever: see
// game_afi_weekly_leaderboard/game_afi_season_leaderboard, which never
// select a raw balance in the first place). currentUserId highlights the
// signed-in member's own row.
export default function LeaderboardTable({
  rows,
  currentUserId,
  emptyLabel,
}: {
  rows: LeaderboardRow[];
  currentUserId: string | null;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-text-muted">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
            <th className="py-2 pr-4">Rank</th>
            <th className="py-2 pr-4">Member</th>
            <th className="py-2 text-right">Return</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((r) => {
            const isMe = r.user_id === currentUserId;
            const positive = r.pct_return >= 0;
            return (
              <tr key={r.user_id} className={isMe ? "bg-white/5" : undefined}>
                <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-text-primary">
                  {r.display_name}
                  {isMe && <span className="ml-2 text-xs text-text-muted">(you)</span>}
                </td>
                <td
                  className={`whitespace-nowrap py-2.5 text-right font-medium ${
                    positive ? "text-[#3ddc97]" : "text-[#ff5c7a]"
                  }`}
                >
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
