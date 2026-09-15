import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { formatMoney, formatChallengeWhen } from "@/lib/gameAfi/format";
import type { MatchSummary } from "@/lib/gameAfi/challengeTypes";

// Middle card of the Overview page's row (Allocation / Head to Head /
// Industry Concentration), spanning double width -- an animated "poker
// table" so the two sides of a match read as a visual, not just a number:
// each player sits at a felt table facing the camera with a stack of cash
// in front of them, the stack's height/count scaled to their current total
// value (cash + holdings) relative to the bigger of the two sides. Winner
// gets a glowing avatar ring + a bobbing crown -- pure decoration layered
// ON TOP of the real $ and % figures printed under each stack, never a
// replacement for them (a purely visual "who's bigger" signal would fail
// colorblind/low-vision readers). Keyframes (htohRise/htohFloat/htohGlow/
// htohCrownBob) live in src/app/globals.css, referenced here via Tailwind's
// arbitrary animate-[name_duration_timing_fill] utility.
//
// Reuses PortfolioDonutCard's own card chrome (rounded-2xl border
// border-card-border bg-card-bg p-5, h-full) so it still lines up with its
// two donut siblings, just wider (see the Overview page's grid: this card
// spans 2 of 4 columns, the donuts 1 each).

const MAX_BARS = 8;
const MIN_BARS = 1;
const BAR_HEIGHT = 8;
const BAR_OVERLAP = 5;
// Small fixed rotation pattern (not random) so each bill in the stack sits
// at a slightly different angle like a real loose pile, without a
// hydration-mismatch risk from Math.random() during SSR.
const BAR_ROTATIONS = [-4, 3, -2, 4, -3, 2, -1, 1];

function barsFor(value: number, maxRef: number): number {
  if (maxRef <= 0) return MIN_BARS;
  const raw = Math.round((value / maxRef) * MAX_BARS);
  return Math.min(MAX_BARS, Math.max(MIN_BARS, raw));
}

function CashStack({ bars }: { bars: number }) {
  const stackHeight = BAR_HEIGHT + (bars - 1) * BAR_OVERLAP;
  return (
    <div className="relative w-14 shrink-0" style={{ height: `${stackHeight + 4}px` }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 h-2 w-12 rounded-[3px] border border-emerald-900/60 bg-gradient-to-b from-emerald-400 to-emerald-600 animate-[htohRise_0.35s_ease-out_backwards]"
          style={{
            bottom: `${i * BAR_OVERLAP}px`,
            transform: `translateX(-50%) rotate(${BAR_ROTATIONS[i % BAR_ROTATIONS.length]}deg)`,
            animationDelay: `${i * 55}ms`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}

function Player({
  avatarUrl,
  name,
  username,
  totalValue,
  startingBalance,
  bars,
  winning,
}: {
  avatarUrl: string | null;
  name: string | null;
  username: string | null;
  totalValue: number;
  startingBalance: number;
  bars: number;
  winning: boolean;
}) {
  const pl = totalValue - startingBalance;
  const plPct = startingBalance > 0 ? (pl / startingBalance) * 100 : 0;
  const positive = pl >= 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <div className="flex h-5 items-center justify-center">
        {winning && (
          <span aria-hidden className="text-base leading-none animate-[htohCrownBob_1.2s_ease-in-out_infinite]">
            👑
          </span>
        )}
      </div>
      <div
        className={`h-11 w-11 shrink-0 rounded-full ${winning ? "animate-[htohGlow_1.8s_ease-in-out_infinite]" : "ring-2 ring-white/10"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl || DEFAULT_AVATAR_URL}
          alt={name || username || "Player"}
          className="h-full w-full rounded-full object-cover"
        />
      </div>
      <span className="max-w-[92px] truncate text-xs text-text-muted">{username ? `@${username}` : name || "Member"}</span>
      <div className="mt-1">
        <CashStack bars={bars} />
      </div>
      <span className="mt-1.5 text-sm font-bold text-text-primary">{formatMoney(totalValue)}</span>
      <span className="text-xs font-medium" style={{ color: positive ? "#3ddc97" : "#ff5c7a" }}>
        {positive ? "+" : ""}
        {formatMoney(pl)} ({positive ? "+" : ""}
        {plPct.toFixed(1)}%)
      </span>
    </div>
  );
}

export default function HeadToHeadCard({ loading, summary }: { loading: boolean; summary: MatchSummary | null }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-2 text-sm font-semibold text-text-primary">Head to Head</h3>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Loading…</div>
      ) : !summary ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Match details unavailable.</div>
      ) : (
        (() => {
          const maxRef = Math.max(summary.me.totalValue, summary.opponent.totalValue, summary.startingBalance, 1);
          const meBars = barsFor(summary.me.totalValue, maxRef);
          const oppBars = barsFor(summary.opponent.totalValue, maxRef);
          const meWinning = summary.me.totalValue > summary.opponent.totalValue;
          const oppWinning = summary.opponent.totalValue > summary.me.totalValue;
          return (
            <div className="flex flex-1 flex-col">
              {/* Felt table -- a wide ellipse (border-radius 50% on a
                  non-square box renders an ellipse) sitting behind both
                  players' cash stacks, like a poker table viewed head-on. */}
              <div className="relative flex-1 min-h-[190px]">
                <div
                  className="absolute inset-x-2 top-14 bottom-2 rounded-[50%]"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(16,94,63,0.9) 0%, rgba(9,58,41,0.95) 65%, rgba(6,38,27,1) 100%)",
                    boxShadow: "inset 0 0 0 6px rgba(133,92,43,0.5), inset 0 0 30px rgba(0,0,0,0.5)",
                  }}
                />
                <div className="relative flex h-full items-start justify-between gap-2 px-1">
                  <Player
                    avatarUrl={summary.me.avatarUrl}
                    name={summary.me.name}
                    username={summary.me.username}
                    totalValue={summary.me.totalValue}
                    startingBalance={summary.startingBalance}
                    bars={meBars}
                    winning={meWinning}
                  />
                  <div className="flex shrink-0 flex-col items-center pt-5">
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      vs
                    </span>
                  </div>
                  <Player
                    avatarUrl={summary.opponent.avatarUrl}
                    name={summary.opponent.name}
                    username={summary.opponent.username}
                    totalValue={summary.opponent.totalValue}
                    startingBalance={summary.startingBalance}
                    bars={oppBars}
                    winning={oppWinning}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-text-muted">
                <span>Starting Capital {formatMoney(summary.startingBalance)}</span>
                {summary.expiresAt && <span>Ends {formatChallengeWhen(summary.expiresAt)}</span>}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
