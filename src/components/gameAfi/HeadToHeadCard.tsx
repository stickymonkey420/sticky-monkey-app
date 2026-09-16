"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { formatMoney } from "@/lib/gameAfi/format";
import { xIntentUrl, xShareLabel } from "@/lib/profile/xHandle";
import type { MatchSummary } from "@/lib/gameAfi/challengeTypes";
import type { PaperHolding } from "@/lib/gameAfi/paperTypes";

// Middle card of the Overview page's row (Allocation / Head to Head /
// Industry Concentration), spanning double width -- an "Arena Jumbotron"
// scoreboard, picked from 3 mocked-up directions (poker table w/ cash
// stacks and this jumbotron -- see the published Scoreboard Draft
// artifact) after the first two cuts read as too cartoonish. Black LED
// panel, amber glow, a chasing marquee border, a blinking game-clock colon
// counting down to the match's expiration -- all decoration layered ON TOP
// of the real $ and % figures, never a replacement for them (a purely
// visual "who's bigger" signal would fail colorblind/low-vision readers).
// Keyframes (htohGlow/htohBulbChase/htohColonBlink) live in
// src/app/globals.css; the VT323/Chakra Petch display fonts are loaded
// once in app/layout.tsx (next/font/google, same pattern as Geist) and
// referenced here only via their CSS variables.
//
// Below the scoreboard itself: a "Top Performers" strip -- your 5
// best-returning open positions in THIS match, ranked by % unrealized
// gain (not position size), like the stat leaders ticker a real jumbotron
// runs under the score. Added per your call to give the card more height
// and put it to use rather than leaving empty space.
//
// Reuses PortfolioDonutCard's own card chrome (rounded-2xl border
// border-card-border bg-card-bg p-5, h-full) so it still lines up with its
// two donut siblings, just wider (see the Overview page's grid: this card
// spans 2 of 4 columns, the donuts 1 each).

const AMBER = "#ffb648";
const VT323 = "var(--font-vt323)";
const CHAKRA = "var(--font-chakra-petch)";
const MARQUEE_BULBS = 12;
const TOP_PERFORMER_LIMIT = 5;

type Performer = { ticker: string; pctReturn: number; dollarPl: number };

// Ranked by % unrealized gain since acquired ("to date"), not by position
// size -- a small position that's up big still outranks a large one that's
// flat. Holdings with no live price (ticker's since dropped out of
// stock_universe, so unrealizedPl is null) can't have a return computed
// and are left out rather than shown as a false zero.
function topPerformers(holdings: PaperHolding[], limit: number): Performer[] {
  return holdings
    .filter((h): h is PaperHolding & { unrealizedPl: number } => h.unrealizedPl !== null && h.avgCost * h.shares > 0)
    .map((h) => ({
      ticker: h.ticker,
      dollarPl: h.unrealizedPl,
      pctReturn: (h.unrealizedPl / (h.avgCost * h.shares)) * 100,
    }))
    .sort((a, b) => b.pctReturn - a.pctReturn)
    .slice(0, limit);
}

// Live days:hours countdown to the match's expiration -- ticks on a 60s
// interval (minute-level precision is plenty for a days:hours readout, no
// need to re-render every second). Null expiresAt (no end date agreed) and
// an already-elapsed one are both distinct, clearly-labeled states rather
// than silently showing 00:00.
function useCountdown(expiresAt: string | null): { days: number; hours: number; ended: boolean } | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return { days: 0, hours: 0, ended: true };
  const days = Math.floor(msLeft / 86_400_000);
  const hours = Math.floor((msLeft % 86_400_000) / 3_600_000);
  return { days, hours, ended: false };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Composes the "Share to X" tweet text from the same score data already
// on screen -- @mentions the opponent's own X handle when they've set one
// (My Profile > X (Twitter) Handle), otherwise falls back to their in-app
// Handle/name as plain text. This is a share-intent link (opens X's own
// compose UI, pre-filled, for the member to review and send themselves) --
// nothing is posted automatically and no X account/API access is needed.
function buildShareText(summary: MatchSummary): string {
  const oppLabel = xShareLabel(summary.opponent.xHandle, summary.opponent.username, summary.opponent.name);
  const meTotal = formatMoney(summary.me.totalValue);
  const oppTotal = formatMoney(summary.opponent.totalValue);
  const pct =
    summary.startingBalance > 0
      ? Math.abs(((summary.me.totalValue - summary.opponent.totalValue) / summary.startingBalance) * 100)
      : 0;
  if (summary.me.totalValue > summary.opponent.totalValue) {
    return `Leading ${oppLabel} ${pct.toFixed(1)}% in our Head to Head (${meTotal} to ${oppTotal}) on Sticky Monkey Investments.`;
  }
  if (summary.opponent.totalValue > summary.me.totalValue) {
    return `Down ${pct.toFixed(1)}% to ${oppLabel} in our Head to Head (${meTotal} to ${oppTotal}) on Sticky Monkey Investments. Comeback loading.`;
  }
  return `Tied with ${oppLabel} at ${meTotal} in our Head to Head on Sticky Monkey Investments.`;
}

function Player({
  avatarUrl,
  name,
  username,
  totalValue,
  startingBalance,
  winning,
  dimmed,
}: {
  avatarUrl: string | null;
  name: string | null;
  username: string | null;
  totalValue: number;
  startingBalance: number;
  winning: boolean;
  dimmed: boolean;
}) {
  const pl = totalValue - startingBalance;
  const plPct = startingBalance > 0 ? (pl / startingBalance) * 100 : 0;
  const positive = pl >= 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5" style={{ opacity: dimmed ? 0.62 : 1 }}>
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
      <span className="max-w-[110px] truncate text-[11px] tracking-wide text-[#aab2c4]" style={{ fontFamily: CHAKRA, fontWeight: 600 }}>
        {username ? `@${username}` : name || "Member"}
      </span>
      <span
        className="text-[34px] leading-none"
        style={{ fontFamily: VT323, color: AMBER, textShadow: `0 0 10px ${AMBER}a6, 0 0 2px ${AMBER}e6` }}
      >
        {formatMoney(totalValue)}
      </span>
      <span
        className="text-xs"
        style={{ fontFamily: CHAKRA, fontWeight: 600, color: positive ? "#39ff8a" : "#ff4d5e" }}
      >
        {positive ? "▲" : "▼"} {positive ? "+" : ""}
        {plPct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function HeadToHeadCard({
  loading,
  summary,
  holdings,
}: {
  loading: boolean;
  summary: MatchSummary | null;
  holdings: PaperHolding[];
}) {
  const countdown = useCountdown(summary?.expiresAt ?? null);
  const performers = summary ? topPerformers(holdings, TOP_PERFORMER_LIMIT) : [];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Head to Head</h3>
        {summary && (
          <a
            href={xIntentUrl(buildShareText(summary))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-card-border px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-primary"
          >
            <Share2 size={13} />
            Share to X
          </a>
        )}
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Loading…</div>
      ) : !summary ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Match details unavailable.</div>
      ) : (
        (() => {
          const meWinning = summary.me.totalValue > summary.opponent.totalValue;
          const oppWinning = summary.opponent.totalValue > summary.me.totalValue;
          const leader = meWinning ? summary.me : oppWinning ? summary.opponent : null;
          return (
            <div className="relative flex-1 overflow-hidden rounded-[10px] border border-[#1a1d24] bg-[#050608] px-4 pb-3.5 pt-3">
              {/* Chasing marquee lights along the top edge -- an idle
                  "screen's on" ambient loop, not tied to any real data. */}
              <div className="mb-3.5 flex justify-between px-0.5">
                {Array.from({ length: MARQUEE_BULBS }).map((_, i) => (
                  <span
                    key={i}
                    className="h-[5px] w-[5px] rounded-full bg-[#3a2a10] animate-[htohBulbChase_1.6s_linear_infinite]"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>

              <div className="flex items-start justify-between gap-2">
                <Player
                  avatarUrl={summary.me.avatarUrl}
                  name={summary.me.name}
                  username={summary.me.username}
                  totalValue={summary.me.totalValue}
                  startingBalance={summary.startingBalance}
                  winning={meWinning}
                  dimmed={oppWinning}
                />
                <div className="flex shrink-0 flex-col items-center gap-2 px-1 pt-1">
                  <span
                    className="rounded-full border border-[#262c3a] px-2.5 py-[3px] text-[11px] tracking-[0.18em] text-[#565f74]"
                    style={{ fontFamily: CHAKRA, fontWeight: 700 }}
                  >
                    VS
                  </span>
                  {countdown === null ? (
                    <div className="flex flex-col items-center">
                      <span className="text-lg" style={{ fontFamily: VT323, color: "#6b7488" }}>
                        &mdash;
                      </span>
                      <span className="text-[9px] tracking-widest text-[#6b7488]" style={{ fontFamily: CHAKRA }}>
                        NO END DATE
                      </span>
                    </div>
                  ) : countdown.ended ? (
                    <div className="flex flex-col items-center">
                      <span className="text-lg" style={{ fontFamily: VT323, color: "#ff4d5e" }}>
                        00:00
                      </span>
                      <span className="text-[9px] tracking-widest text-[#ff4d5e]" style={{ fontFamily: CHAKRA }}>
                        MATCH ENDED
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span
                        className="flex items-baseline gap-[2px] text-[26px] leading-none"
                        style={{ fontFamily: VT323, color: AMBER, textShadow: `0 0 8px ${AMBER}8c` }}
                      >
                        {pad2(countdown.days)}
                        <span className="animate-[htohColonBlink_1s_steps(1)_infinite]">:</span>
                        {pad2(countdown.hours)}
                      </span>
                      <span className="text-[9px] tracking-widest text-[#6b7488]" style={{ fontFamily: CHAKRA }}>
                        DAYS LEFT
                      </span>
                    </div>
                  )}
                </div>
                <Player
                  avatarUrl={summary.opponent.avatarUrl}
                  name={summary.opponent.name}
                  username={summary.opponent.username}
                  totalValue={summary.opponent.totalValue}
                  startingBalance={summary.startingBalance}
                  winning={oppWinning}
                  dimmed={meWinning}
                />
              </div>

              <div
                className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1 border-t border-[#1a1d24] pt-3 text-[10.5px] uppercase tracking-wide text-[#6b7488]"
                style={{ fontFamily: CHAKRA }}
              >
                <span>Starting Capital {formatMoney(summary.startingBalance)}</span>
                {leader && (
                  <span style={{ color: AMBER }}>
                    Leading: {leader.username ? `@${leader.username}` : leader.name || "Member"}
                  </span>
                )}
              </div>

              {/* Top Performers -- like the stat-leaders strip a real
                  jumbotron runs under the score. Your own open positions
                  only (the opponent's per-ticker holdings aren't exposed by
                  game_afi_match_summary, just their totals). */}
              <div className="mt-3 border-t border-dashed border-[#1a1d24] pt-3">
                <div
                  className="mb-2 text-[10px] tracking-[0.18em] text-[#6b7488]"
                  style={{ fontFamily: CHAKRA, fontWeight: 700 }}
                >
                  TOP PERFORMERS TO DATE
                </div>
                {performers.length === 0 ? (
                  <div className="text-xs text-[#565f74]" style={{ fontFamily: CHAKRA }}>
                    No open positions yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {performers.map((p, i) => {
                      const positive = p.pctReturn >= 0;
                      return (
                        <div key={p.ticker} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-[#565f74]" style={{ fontFamily: CHAKRA, fontWeight: 700 }}>
                              {i + 1}
                            </span>
                            <span className="truncate text-[13px] text-[#e9ecf4]" style={{ fontFamily: CHAKRA, fontWeight: 600 }}>
                              {p.ticker}
                            </span>
                          </span>
                          <span
                            className="shrink-0 text-[13px]"
                            style={{ fontFamily: VT323, color: positive ? "#39ff8a" : "#ff4d5e" }}
                          >
                            {positive ? "+" : ""}
                            {p.pctReturn.toFixed(1)}% ({positive ? "+" : ""}
                            {formatMoney(p.dollarPl)})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
