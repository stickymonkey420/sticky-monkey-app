"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dashboard/netWorth";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";

type BalanceRow = { key: string; label: string; cashBalance: number };

// "Funny Money" -- Game-a-Fi paper cash across every accepted Head to Head
// match this member is in (each its own isolated cash balance -- see the
// paper-account-scoping migration). The free-standing "Monkey Monkey"
// practice account is intentionally NOT shown here (per the user: "I
// don't think I need monkey monkey"). Read-only: reads paper_accounts
// directly rather than provisioning missing rows via ensurePaperAccount,
// since an accepted match with no trades yet simply hasn't been
// provisioned -- its balance is just its agreed starting capital, shown
// here without writing anything on a dashboard view.
export default function PaperBalancesCard() {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

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

      const [{ data: accounts }, challenges] = await Promise.all([
        supabase.from("paper_accounts").select("challenge_id,cash_balance").eq("user_id", user.id),
        fetchChallenges(supabase),
      ]);
      if (cancelled) return;

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
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = rows.reduce((sum, r) => sum + r.cashBalance, 0);

  return (
    <div className="rounded-[30px] bg-[rgb(32,40,56)] p-[30px]">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">Funny Money</h3>
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
