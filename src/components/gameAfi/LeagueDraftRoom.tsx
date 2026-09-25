"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { makePick, startDraft, undoLastPick } from "@/lib/gameAfi/leagueQueries";
import type { DraftPickRow, DraftPoolRow, LeagueMember, LeagueSummary, OnClock } from "@/lib/gameAfi/leagueTypes";
import { money } from "@/lib/options/queries";

// Admin-run draft room: mirrors the reference site's own behavior (members
// watch a live view-only board; a commissioner enters each pick as it's
// called out). Covers both pre-draft ("setup" -- member list + Start
// Draft) and the live draft itself ("drafting" -- on-the-clock, pick
// entry, pool browser, recent picks, full board).
export default function LeagueDraftRoom({
  league,
  members,
  onClock,
  pool,
  picks,
  isAdmin,
  onChanged,
}: {
  league: LeagueSummary;
  members: LeagueMember[];
  onClock: OnClock | null;
  pool: DraftPoolRow[];
  picks: DraftPickRow[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const filteredPool = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return pool;
    return pool.filter((p) => p.ticker.includes(q) || (p.companyName ?? "").toUpperCase().includes(q));
  }, [pool, search]);

  const poolByS = useMemo(() => {
    const bySector = new Map<string, DraftPoolRow[]>();
    for (const p of filteredPool) {
      const key = p.sector ?? "Other";
      if (!bySector.has(key)) bySector.set(key, []);
      bySector.get(key)!.push(p);
    }
    return Array.from(bySector.entries());
  }, [filteredPool]);

  async function handleStart() {
    setStarting(true);
    const supabase = createClient();
    const result = await startDraft(supabase, league.id);
    setStarting(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) onChanged();
  }

  async function handlePick(ticker: string, pickSide: "long" | "short") {
    if (!onClock) return;
    setSubmitting(true);
    setMessage(null);
    const supabase = createClient();
    const result = await makePick(supabase, league.id, onClock.userId, ticker, pickSide);
    setSubmitting(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) {
      setTickerInput("");
      onChanged();
    }
  }

  async function handleUndo() {
    setSubmitting(true);
    const supabase = createClient();
    const result = await undoLastPick(supabase, league.id);
    setSubmitting(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) onChanged();
  }

  if (league.status === "setup") {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-1 text-sm font-semibold text-text-primary">{league.name}</h3>
        <p className="mb-3 text-xs text-text-muted">
          {members.length} member{members.length === 1 ? "" : "s"} · {league.rosterSize} picks each · draft order
          below
        </p>
        <ol className="mb-4 flex flex-col gap-1 text-sm text-text-primary">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <span className="text-xs text-text-muted">#{m.seed}</span>
              {m.name}
              {m.username && <span className="text-xs text-text-muted">@{m.username}</span>}
            </li>
          ))}
        </ol>
        {isAdmin && (
          <button
            type="button"
            disabled={starting || members.length < 2}
            onClick={handleStart}
            className="rounded-md bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Start Draft
          </button>
        )}
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "text-[#f5d020]" : "text-[#ff5c7a]"}`}>{message.text}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{league.name} -- Live Draft</h3>
            {onClock ? (
              <p className="mt-1 text-sm text-text-muted">
                On the clock: <span className="font-semibold text-text-primary">{onClock.name}</span> -- Round{" "}
                {onClock.round}, Pick #{onClock.pickNumber}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#f5d020]">Draft complete -- {picks.length} picks in.</p>
            )}
          </div>
          {isAdmin && picks.length > 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleUndo}
              className="shrink-0 rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-white/5 disabled:opacity-50"
            >
              Undo Last Pick
            </button>
          )}
        </div>

        {isAdmin && onClock && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Ticker"
              className="w-32 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm uppercase text-text-primary outline-none"
            />
            <div className="flex gap-1 rounded-md border border-card-border p-1">
              <button
                type="button"
                onClick={() => setSide("long")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  side === "long" ? "bg-[#f5d020] text-[#0f131c]" : "text-text-muted hover:bg-white/5"
                }`}
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => setSide("short")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  side === "short" ? "bg-[#ff5c7a] text-[#0f131c]" : "text-text-muted hover:bg-white/5"
                }`}
              >
                Short
              </button>
            </div>
            <button
              type="button"
              disabled={submitting || !tickerInput.trim()}
              onClick={() => handlePick(tickerInput, side)}
              className="rounded-md bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Draft for {onClock.name}
            </button>
          </div>
        )}
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "text-[#f5d020]" : "text-[#ff5c7a]"}`}>{message.text}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-text-primary">Draft Pool</h4>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker or company"
              className="w-48 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-1.5 text-xs text-text-primary outline-none"
            />
          </div>
          <div className="max-h-[420px] overflow-y-auto pr-1">
            {poolByS.map(([sector, rows]) => (
              <div key={sector} className="mb-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  {sector} ({rows.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((r) => (
                    <button
                      key={r.ticker}
                      type="button"
                      disabled={r.drafted || !isAdmin || !onClock}
                      onClick={() => setTickerInput(r.ticker)}
                      title={r.drafted ? `Drafted by @${r.draftedByUsername} (${r.draftedSide})` : r.companyName ?? undefined}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        r.drafted
                          ? "cursor-not-allowed border-card-border/50 text-text-muted/50 line-through"
                          : "border-card-border text-text-primary hover:border-[#4f8cff]"
                      }`}
                    >
                      {r.ticker}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h4 className="mb-3 text-sm font-semibold text-text-primary">Recent Picks</h4>
          <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1 text-sm">
            {picks.length === 0 && <p className="text-text-muted">No picks yet.</p>}
            {picks.map((p) => (
              <div key={p.pickNumber} className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                <div>
                  <span className="text-xs text-text-muted">#{p.pickNumber}</span> {p.name}
                  <div className="text-xs text-text-muted">
                    {p.ticker} · {p.side.toUpperCase()} · {money(p.priceAtPick)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
