"use client";

import { useEffect, useState } from "react";
import ChallengesPanel from "@/components/gameAfi/ChallengesPanel";
import LeaguePanel from "@/components/gameAfi/LeaguePanel";
import MyProfileModal from "@/components/profile/MyProfileModal";
import { createClient } from "@/lib/supabase/client";

// Game-a-Fi: head-to-head member challenges, with league play coming next.
// The weekly-standings "Live Portfolio" leaderboard and "Paper Trading"
// sandbox are shelved for now (their code -- lib/gameAfi/queries.ts,
// lib/gameAfi/paperQueries.ts, components/gameAfi/LeaderboardTable.tsx,
// components/gameAfi/PaperTradingPanel.tsx, and the game_afi_*leaderboard*/
// game_afi_paper_* SQL functions -- is untouched, just not linked from this
// page) in favor of Head to Head and League.
export default function GameAFiPage() {
  const [tab, setTab] = useState<"headtohead" | "league">("headtohead");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Whether the signed-in member has a Game-a-Fi handle set yet. Starts
  // `true` (rather than `false`) so the "set your handle" banner never
  // flashes on screen for the common case while the profile is still
  // loading -- it only appears once we've actually confirmed one is
  // missing.
  const [hasHandle, setHasHandle] = useState(true);
  const [handleModalOpen, setHandleModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);

      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setHasHandle(!!data?.username);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleHandleModalClose() {
    setHandleModalOpen(false);
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    setHasHandle(!!data?.username);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-a-Fi</h1>
      </div>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-text-muted">
          Challenge another member head-to-head, or join a league once your Head to Head is configured.
        </p>

        {!loading && !hasHandle && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-border bg-card-bg p-4">
            <p className="text-sm text-text-muted">
              Set a handle to challenge or be challenged -- it&apos;s how Head to Head and League identify you.
            </p>
            <button
              type="button"
              onClick={() => setHandleModalOpen(true)}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: "#4f8cff" }}
            >
              Set Handle
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setTab("headtohead")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === "headtohead" ? "bg-white/10 text-text-primary" : "bg-white/5 text-text-muted hover:bg-white/10"
            }`}
          >
            Head to Head
          </button>
          <button
            onClick={() => setTab("league")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === "league" ? "bg-white/10 text-text-primary" : "bg-white/5 text-text-muted hover:bg-white/10"
            }`}
          >
            League
          </button>
        </div>

        {tab === "league" ? <LeaguePanel /> : <ChallengesPanel />}
      </div>

      {handleModalOpen && <MyProfileModal onClose={handleHandleModalClose} />}
    </>
  );
}
