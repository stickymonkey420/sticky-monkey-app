"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dashboard/netWorth";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import {
  cancelChallenge,
  deleteChallenge,
  fetchChallenges,
  fetchMatchSummary,
  respondToChallenge,
} from "@/lib/gameAfi/challengeQueries";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import { formatChallengeWhen, formatMoney } from "@/lib/gameAfi/format";

const WINNING_COLOR = "#3ddc97";
const LOSING_COLOR = "#ff5c7a";

type ScoreRow = {
  key: string;
  opponentLabel: string;
  meTotal: number;
  opponentTotal: number;
  startingBalance: number;
};

// "Scoreboard" (formerly "Funny Money") -- a real head-to-head score (your
// total paper portfolio value -- cash + holdings, via game_afi_match_summary
// -- vs your opponent's) for every accepted Head to Head match this member
// is in, PLUS pending invite status (sent or received). Per your call, this
// replaced a plain "your cash balance next to their handle" list, which
// wasn't actually a comparison at all. The free-standing "Monkey Monkey"
// practice account is intentionally NOT shown here (per the user: "I don't
// think I need monkey monkey").
//
// The received-invite rows are the same Accept/Decline card that used to
// live only in the Notifications bell (NotificationsModal.tsx) -- per your
// call to surface it here too instead of a plain summary line. Accepting or
// declining refreshes both the invite list AND the scores below (a newly
// accepted match gets its own row). Sent invites get their own Cancel
// action here too -- that had no home since the old Head to Head tab's
// Sent list was removed. Each accepted match also gets a Delete action
// (game_afi_delete_challenge) -- per your call to let people get out of a
// competition entirely for now; it's a hard delete (with a confirm), not
// just hiding the row, since there was previously no way to end an already-
// accepted match at all (Cancel only ever applied to a still-pending sent
// invite).

export default function ScoreboardCard() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [pendingReceived, setPendingReceived] = useState<ChallengeRow[]>([]);
  const [pendingSent, setPendingSent] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const challenges = await fetchChallenges(supabase);
    const accepted = challenges.filter((c) => c.status === "accepted");
    const summaries = await Promise.all(accepted.map((c) => fetchMatchSummary(supabase, c.id)));

    setRows(
      summaries
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .map((s) => ({
          key: s.challengeId,
          opponentLabel: s.opponent.username ? `@${s.opponent.username}` : s.opponent.name || "Member",
          meTotal: s.me.totalValue,
          opponentTotal: s.opponent.totalValue,
          startingBalance: s.startingBalance,
        }))
    );
    setPendingReceived(challenges.filter((c) => c.direction === "received" && c.status === "pending"));
    setPendingSent(challenges.filter((c) => c.direction === "sent" && c.status === "pending"));
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRespond(id: string, accept: boolean) {
    setActioningId(id);
    const supabase = createClient();
    await respondToChallenge(supabase, id, accept);
    setActioningId(null);
    load();
  }

  async function handleCancel(id: string) {
    setActioningId(id);
    const supabase = createClient();
    await cancelChallenge(supabase, id);
    setActioningId(null);
    load();
  }

  // Ends an accepted competition outright -- per your call to give people
  // a way to get out of one "for now" (there was no way to end one once
  // accepted; the existing Cancel button only ever applied to a still-
  // pending sent invite). Confirms first since this permanently deletes
  // the match's paper trade history along with it (see
  // game_afi_delete_challenge's cascade).
  async function handleDelete(id: string, opponentLabel: string) {
    if (!(await confirm({ message: `Delete this competition against ${opponentLabel}? This can't be undone.`, danger: true })))
      return;
    setActioningId(id);
    const supabase = createClient();
    await deleteChallenge(supabase, id);
    setActioningId(null);
    load();
  }

  const total = rows.reduce((sum, r) => sum + r.meTotal, 0);

  return (
    <div className="rounded-[30px] bg-[rgb(32,40,56)] p-[30px]">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">Scoreboard</h3>

      {!loading && pendingReceived.length > 0 && (
        <div className="mb-3 flex flex-col divide-y divide-white/10 border-b border-white/10 pb-1">
          {pendingReceived.map((c) => (
            <div key={c.id} className="flex items-start gap-3 py-3 first:pt-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.other_avatar_url || DEFAULT_AVATAR_URL}
                alt={c.other_username || c.other_name || "Member"}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  {c.other_username ? `@${c.other_username}` : c.other_name || "Member"} challenged you
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "#4f8cff" }}>
                  {formatMoney(c.starting_balance)} starting capital
                  {c.expires_at && ` · Ends ${formatChallengeWhen(c.expires_at)}`}
                </div>
                {c.message && (
                  <div className="mt-0.5 truncate text-xs text-text-muted">&ldquo;{c.message}&rdquo;</div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={actioningId === c.id}
                    onClick={() => handleRespond(c.id, true)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: "#3ddc97" }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={actioningId === c.id}
                    onClick={() => handleRespond(c.id, false)}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && pendingSent.length > 0 && (
        <div className="mb-3 flex flex-col divide-y divide-white/10 border-b border-white/10 pb-1">
          {pendingSent.map((c) => (
            <div key={c.id} className="flex items-start gap-3 py-3 first:pt-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.other_avatar_url || DEFAULT_AVATAR_URL}
                alt={c.other_username || c.other_name || "Member"}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  You challenged {c.other_username ? `@${c.other_username}` : c.other_name || "Member"}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "#4f8cff" }}>
                  {formatMoney(c.starting_balance)} starting capital
                  {c.expires_at && ` · Ends ${formatChallengeWhen(c.expires_at)}`}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: "#4f8cff" }}
                  >
                    Pending
                  </span>
                  <button
                    type="button"
                    disabled={actioningId === c.id}
                    onClick={() => handleCancel(c.id)}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-text-muted">No active Trade Off matches yet.</div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-white/10">
            {rows.map((r) => {
              const meAhead = r.meTotal > r.opponentTotal;
              const oppAhead = r.opponentTotal > r.meTotal;
              const meColor = meAhead ? WINNING_COLOR : oppAhead ? LOSING_COLOR : undefined;
              const oppColor = oppAhead ? WINNING_COLOR : meAhead ? LOSING_COLOR : undefined;
              const pct = r.startingBalance > 0 ? ((r.meTotal - r.opponentTotal) / r.startingBalance) * 100 : 0;
              return (
                <div key={r.key} className="flex flex-col gap-0.5 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary" style={{ color: meColor }}>
                      You
                    </span>
                    <span className="font-medium text-text-primary" style={{ color: meColor }}>
                      {money(r.meTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-primary" style={{ color: oppColor }}>
                      {r.opponentLabel}
                    </span>
                    <span className="text-text-primary" style={{ color: oppColor }}>
                      {money(r.opponentTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs text-text-muted"
                      style={{ color: meAhead ? WINNING_COLOR : oppAhead ? LOSING_COLOR : undefined }}
                    >
                      {meAhead || oppAhead ? `${Math.abs(pct).toFixed(1)}% ${meAhead ? "ahead" : "behind"}` : "Tied"}
                    </span>
                    <button
                      type="button"
                      disabled={actioningId === r.key}
                      onClick={() => handleDelete(r.key, r.opponentLabel)}
                      className="text-xs text-text-muted underline decoration-dotted hover:text-[#ff5c7a] disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2.5 text-sm font-semibold text-text-primary">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
