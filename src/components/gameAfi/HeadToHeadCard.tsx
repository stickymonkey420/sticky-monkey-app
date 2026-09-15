import { Crown } from "lucide-react";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { formatMoney, formatChallengeWhen } from "@/lib/gameAfi/format";
import type { MatchSummary } from "@/lib/gameAfi/challengeTypes";

// Middle card of the Overview page's row (Allocation / Head to Head /
// Industry Concentration), spanning double width -- an animated "high
// roller table" so the two sides of a match read as a visual, not just a
// number: each player faces the camera with a bundled-cash stack in front
// of them, one bundle per $20,000 of their current total value (cash +
// holdings) -- a concrete, literal denomination rather than an arbitrary
// relative bar, per your call after the first cut read as too cartoonish.
// A stack over 6 bundles caps its visual height and shows a "x{count}"
// count tag instead of rendering dozens of bricks. Winner gets a soft gold
// glow ring + a gently breathing crown -- pure decoration layered ON TOP of
// the real $ and % figures printed under each stack, never a replacement
// for them (a purely visual "who's bigger" signal would fail colorblind/
// low-vision readers). Keyframes (htohRise/htohGlow/htohBreathe) live in
// src/app/globals.css, referenced here via Tailwind's arbitrary
// animate-[name_duration_timing_fill] utility -- kept deliberately subtle
// (small offsets, soft glow) rather than the bouncy/rotated first pass.
//
// Reuses PortfolioDonutCard's own card chrome (rounded-2xl border
// border-card-border bg-card-bg p-5, h-full) so it still lines up with its
// two donut siblings, just wider (see the Overview page's grid: this card
// spans 2 of 4 columns, the donuts 1 each).

const GOLD = "#d9b56a";
const BUNDLE_VALUE = 20000; // one cash bundle = $20K of total value
const MAX_VISIBLE_BUNDLES = 6;
const BUNDLE_HEIGHT = 9;
const BUNDLE_OVERLAP = 6;
// Layered gradient (not a solid fill) so each brick reads as paper bills
// with a currency strap through the middle, without a second DOM element.
const BUNDLE_GRADIENT =
  "linear-gradient(90deg, #1c5b46 0%, #2f9d74 42%, #d9b56a 48%, #d9b56a 52%, #2f9d74 58%, #1c5b46 100%)";

function bundlesFor(value: number): number {
  return Math.max(1, Math.round(value / BUNDLE_VALUE));
}

function BundleStack({ value }: { value: number }) {
  const count = bundlesFor(value);
  const visible = Math.min(count, MAX_VISIBLE_BUNDLES);
  const overflow = count > MAX_VISIBLE_BUNDLES;
  const stackHeight = BUNDLE_HEIGHT + (visible - 1) * BUNDLE_OVERLAP;
  return (
    <div className="relative w-12 shrink-0" style={{ height: `${stackHeight + 4}px` }}>
      {overflow && (
        <span
          className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[9px] font-semibold"
          style={{ borderColor: `${GOLD}80`, backgroundColor: "rgba(0,0,0,0.4)", color: GOLD }}
        >
          ×{count}
        </span>
      )}
      {Array.from({ length: visible }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 h-[9px] w-11 -translate-x-1/2 rounded-[2px] border animate-[htohRise_0.3s_ease-out_backwards]"
          style={{
            bottom: `${i * BUNDLE_OVERLAP}px`,
            background: BUNDLE_GRADIENT,
            borderColor: "rgba(10,40,30,0.6)",
            boxShadow: "0 1px 1px rgba(0,0,0,0.35)",
            animationDelay: `${i * 45}ms`,
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
  winning,
}: {
  avatarUrl: string | null;
  name: string | null;
  username: string | null;
  totalValue: number;
  startingBalance: number;
  winning: boolean;
}) {
  const pl = totalValue - startingBalance;
  const plPct = startingBalance > 0 ? (pl / startingBalance) * 100 : 0;
  const positive = pl >= 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <div className="flex h-5 items-center justify-center">
        {winning && (
          <Crown
            size={16}
            strokeWidth={1.5}
            fill={GOLD}
            style={{ color: GOLD }}
            className="animate-[htohBreathe_1.6s_ease-in-out_infinite]"
          />
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
      <div className="mt-2">
        <BundleStack value={totalValue} />
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Head to Head</h3>
        <span className="text-[10px] text-text-muted">1 bundle = $20K</span>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Loading…</div>
      ) : !summary ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Match details unavailable.</div>
      ) : (
        (() => {
          const meWinning = summary.me.totalValue > summary.opponent.totalValue;
          const oppWinning = summary.opponent.totalValue > summary.me.totalValue;
          return (
            <div className="flex flex-1 flex-col">
              {/* Table -- a wide ellipse (border-radius 50% on a non-square
                  box renders an ellipse) sitting behind both players' cash
                  stacks, with a thin gold rim rather than a literal green
                  felt, to read as a premium finance-app widget rather than
                  a casino graphic. */}
              <div className="relative flex-1 min-h-[190px]">
                <div
                  className="absolute inset-x-2 top-14 bottom-2 rounded-[50%]"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(32,44,68,0.9) 0%, rgba(19,26,42,0.95) 65%, rgba(10,14,23,1) 100%)",
                    boxShadow: `inset 0 0 0 1.5px ${GOLD}59, inset 0 0 30px rgba(0,0,0,0.55)`,
                  }}
                />
                <div className="relative flex h-full items-start justify-between gap-2 px-1">
                  <Player
                    avatarUrl={summary.me.avatarUrl}
                    name={summary.me.name}
                    username={summary.me.username}
                    totalValue={summary.me.totalValue}
                    startingBalance={summary.startingBalance}
                    winning={meWinning}
                  />
                  <div className="flex shrink-0 flex-col items-center pt-5">
                    <span
                      className="rounded-full border bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted"
                      style={{ borderColor: `${GOLD}4d` }}
                    >
                      vs
                    </span>
                  </div>
                  <Player
                    avatarUrl={summary.opponent.avatarUrl}
                    name={summary.opponent.name}
                    username={summary.opponent.username}
                    totalValue={summary.opponent.totalValue}
                    startingBalance={summary.startingBalance}
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
