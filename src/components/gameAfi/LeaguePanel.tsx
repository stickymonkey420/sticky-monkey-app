"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  canManageLeague,
  fetchDraftPicks,
  fetchDraftPool,
  fetchLeagueMembers,
  fetchLeaguePositions,
  fetchLeagueSeasonSeries,
  fetchLeagues,
  fetchOnClock,
} from "@/lib/gameAfi/leagueQueries";
import { computeSectorBattle, computeStandings, computeTopMovers } from "@/lib/gameAfi/leagueCalc";
import type {
  DraftPickRow,
  DraftPoolRow,
  LeagueMember,
  LeaguePositionRow,
  LeagueSnapshotRow,
  LeagueSummary,
  OnClock,
} from "@/lib/gameAfi/leagueTypes";
import LeagueSetupForm from "./LeagueSetupForm";
import LeagueDraftRoom from "./LeagueDraftRoom";
import LeagueStandings from "./LeagueStandings";
import LeagueHeatmap from "./LeagueHeatmap";
import LeagueSectorBattle from "./LeagueSectorBattle";
import LeagueTopMovers from "./LeagueTopMovers";
import LeagueSeasonChart from "./LeagueSeasonChart";
import LeagueEditModal from "./LeagueEditModal";

// League: season-long snake-draft fantasy stock league (see
// lib/gameAfi/leagueTypes.ts and migration add_game_afi_league). Setup and
// live-draft entry are admin-only (game_afi_league_is_admin on the
// server); everyone else gets a live, view-only board -- same split the
// reference product itself uses.
export default function LeaguePanel() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [onClock, setOnClock] = useState<OnClock | null>(null);
  const [pool, setPool] = useState<DraftPoolRow[]>([]);
  const [picks, setPicks] = useState<DraftPickRow[]>([]);
  const [positions, setPositions] = useState<LeaguePositionRow[]>([]);
  const [snapshots, setSnapshots] = useState<LeagueSnapshotRow[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState(false);

  // Newest league by default; a picker appears when there's more than one.
  const league = leagues.find((l) => l.id === selectedId) ?? leagues[0] ?? null;

  const loadLeagueDetail = useCallback(async (l: LeagueSummary) => {
    const supabase = createClient();
    canManageLeague(supabase, l.id).then(setCanManage);
    if (l.status === "setup" || l.status === "drafting") {
      const [m, oc, p, pk] = await Promise.all([
        fetchLeagueMembers(supabase, l.id),
        fetchOnClock(supabase, l.id),
        fetchDraftPool(supabase, l.id),
        fetchDraftPicks(supabase, l.id),
      ]);
      setMembers(m);
      setOnClock(oc);
      setPool(p);
      setPicks(pk);
    } else {
      const [pos, series] = await Promise.all([
        fetchLeaguePositions(supabase, l.id),
        fetchLeagueSeasonSeries(supabase, l.id),
      ]);
      setPositions(pos);
      setSnapshots(series);
    }
  }, []);

  async function loadAll() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = (data as { role?: string } | null)?.role;
      setIsAdmin(role === "app_director" || role === "support" || role === "developer");
    }
    const ls = await fetchLeagues(supabase);
    setLeagues(ls);
    const current = ls.find((l) => l.id === selectedId) ?? ls[0];
    if (!current) setSelectedId(null);
    if (current) await loadLeagueDetail(current);
    setLoading(false);
  }

  useEffect(() => {
    // The react-hooks/set-state-in-effect lint rule only recognizes an
    // async function declared (and immediately invoked) directly inside
    // the effect body as a safe "load on mount" idiom -- same pattern
    // holdings/page.tsx and WeeklyIncomeSimulator use -- so this thin
    // wrapper exists purely to satisfy that shape; loadAll itself lives
    // at component scope since it's also reused by the "New League
    // created" callbacks below.
    async function load() {
      await loadAll();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChanged() {
    if (league) await loadLeagueDetail(league);
    // Re-list too -- a completed draft flips league.status, which changes
    // which detail queries we need on the next load.
    const supabase = createClient();
    const ls = await fetchLeagues(supabase);
    setLeagues(ls);
  }

  async function selectLeague(id: string) {
    setSelectedId(id);
    const l = leagues.find((x) => x.id === id);
    if (l) await loadLeagueDetail(l);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
    );
  }

  if (!league) {
    if (!isAdmin) {
      return (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">League</h3>
          <p className="text-sm text-text-muted">No league has been set up yet -- check back once one starts.</p>
        </div>
      );
    }
    return <LeagueSetupForm onCreated={loadAll} />;
  }

  const standings = computeStandings(positions);
  const sectorBattle = computeSectorBattle(positions);
  const { gainers, losers } = computeTopMovers(positions);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {leagues.length > 1 && (
          <select
            aria-label="League"
            value={league.id}
            onChange={(e) => selectLeague(e.target.value)}
            className="mr-auto rounded-md border border-card-border bg-[#0f131c] px-2.5 py-1.5 text-xs text-text-primary outline-none"
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {canManage && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[#4f8cff] hover:underline">
            ✎ Edit / delete league
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="text-xs text-[#4f8cff] hover:underline"
          >
            {showCreate ? "Cancel" : "+ New League"}
          </button>
        )}
      </div>
      {editing && (
        <LeagueEditModal
          league={league}
          members={members}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await loadAll();
          }}
          onDeleted={async () => {
            setEditing(false);
            setSelectedId(null);
            await loadAll();
          }}
        />
      )}
      {showCreate && (
        <LeagueSetupForm
          onCreated={() => {
            setShowCreate(false);
            loadAll();
          }}
        />
      )}

      {(league.status === "setup" || league.status === "drafting") && (
        <LeagueDraftRoom
          league={league}
          members={members}
          onClock={onClock}
          pool={pool}
          picks={picks}
          isAdmin={isAdmin}
          onChanged={handleChanged}
        />
      )}

      {(league.status === "active" || league.status === "completed") && (
        <>
          <LeagueStandings standings={standings} />
          <LeagueHeatmap standings={standings} rosterSize={league.rosterSize} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeagueSectorBattle rows={sectorBattle} />
            <LeagueSeasonChart snapshots={snapshots} />
          </div>
          <LeagueTopMovers gainers={gainers} losers={losers} />
        </>
      )}
    </div>
  );
}
