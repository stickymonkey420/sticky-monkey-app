"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dashboard/netWorth";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { cancelChallenge, fetchChallenges, respondToChallenge } from "@/lib/gameAfi/challengeQueries";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import { formatChallengeWhen, formatMoney } from "@/lib/gameAfi/format";

type BalanceRow = { key: string; label: string; cashBalance: number };

// "Scoreboard" (formerly "Funny Money") -- Game-a-Fi paper cash across every
// accepted Head to Head match this member is in (each its own isolated cash
// balance -- see the paper-account-scoping migration), PLUS pending invite
// status (sent or received). The free-standing "Monkey Monkey" practice
// account is intentionally NOT shown here (per the user: "I don't think I
// need monkey monkey"). Balances are read-only: reads paper_accounts
// directly rather than provisioning missing rows via ensurePaperAccount,
// since an accepted match with no trades yet simply hasn't been
// provisioned -- its balance is just its agreed starting capital, shown
// here without writing anything on a dashboard view.
//
// The received-invite rows are the same Accept/Decline card that used to
// live only in the Notifications bell (NotificationsModal.tsx) -- per your
// call to surface it here too instead of a plain summary line. Accepting or
// declining refreshes both the invite list AND the balances below (a newly
// accepted match gets its own row). Sent invites get their own Cancel
// action here too -- that had no home since the old Head to Head tab's
// Sent list was removed.
export default function ScoreboardCard() {
  const [rows, setRows] = useState<BalanceRow[]>([]);
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

    const [{ data: accounts }, challenges] = await Promise.all([
      supabase.from("paper_accounts").select("challenge_id,cash_balance").eq("user_id", user.id),
      fetchChallenges(supabase),
    ]);

    const cashByChallenge = new Map<string, number>();
    for (const a of (accounts ?? []) as { challenge_id: string | null; cash_balance: number }[]) {
      if (a.challenge_id) cashByChallenge.set(a.challenge_id, Number(a.cash_balance));
    }

    const accepted = challenges.filter((c) => c.status === "accepted");
    setRows(
      accepted.map((c) => ({
        key: c.id,
        label: c.other_username ? `@${c.other_username}` : c.other_name || "Member",
        cashBalance: cashByChallenge.get(c.id) ?? c.starting_balance,
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

  const total = rows.reduce((sum, r) => sum + r.cashBalance, 0);

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
        <div className="text-sm text-text-muted">No active Head to Head matches yet.</div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 text-text-muted">{r.label}</td>
                <td className="py-2 text-right font-medium text-text-primary">{money(r.cashBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td className="pt-2.5 text-sm font-semibold text-text-primary">Total</td>
              <td className="pt-2.5 text-right text-sm font-semibold text-text-primary">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
