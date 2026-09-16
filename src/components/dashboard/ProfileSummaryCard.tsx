"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dashboard/netWorth";
import { fetchManualAccounts, fetchPlaidTransactions } from "@/lib/wallet/queries";
import { computeWalletOverview, type WalletOverview } from "@/lib/wallet/calc";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import InvestmentAlertCard from "./InvestmentAlertCard";
import ScoreboardCard from "./ScoreboardCard";
import QuickAccessCard from "./QuickAccessCard";

const EMPTY_OVERVIEW: WalletOverview = {
  balance: 0,
  totalIncome: 0,
  totalExpense: 0,
  netThisMonth: 0,
  monthIncome: 0,
  monthExpense: 0,
};

// Right-side profile panel for the Dashboard -- ported to match the live
// Webflow site's actual chrome (solid rgb(21,27,40) outer card, 30px
// radius, no border; a darker rgb(32,40,56) nested "Current Balance" box;
// Investment Alert and Quick Access nested inside the same panel) rather
// than the earlier pass's invented green-border treatment.
export default function ProfileSummaryCard() {
  const { profile } = useProfile();
  const [overview, setOverview] = useState<WalletOverview>(EMPTY_OVERVIEW);
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

      const [accounts, txs] = await Promise.all([
        fetchManualAccounts(supabase, user.id),
        fetchPlaidTransactions(supabase, user.id),
      ]);

      if (cancelled) return;
      setOverview(computeWalletOverview(accounts, txs));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.name || "Account";
  const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR_URL;

  return (
    // Sticky + h-[calc(100vh-2rem)] mirrors the left sidebar (AppShell's
    // <aside>) exactly, so the two side panels always match height instead
    // of the profile card's height following its own (shorter) content.
    <div
      className="sticky top-4 flex w-full flex-col gap-6 overflow-y-auto rounded-[30px] p-[30px] md:h-[calc(100vh-2rem)] md:w-80 md:shrink-0"
      style={{ backgroundColor: "#151b28" }}
    >
      {/* Avatar / name / handle (falls back to email if no handle is set yet) */}
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={displayName} className="h-24 w-24 rounded-full object-cover" />
        <div className="mt-4 text-base font-semibold text-text-primary">{displayName}</div>
        {profile?.username ? (
          <div className="mt-1 text-sm" style={{ color: "#4f8cff" }}>
            @{profile.username}
          </div>
        ) : (
          profile?.email && (
            <a href={`mailto:${profile.email}`} className="mt-1 text-sm" style={{ color: "#4f8cff" }}>
              {profile.email}
            </a>
          )
        )}
      </div>

      {/* Current Balance */}
      <div className="rounded-[30px] px-6 py-[30px] text-center" style={{ backgroundColor: "rgb(32,40,56)" }}>
        <div className="text-sm text-text-muted">Current Balance</div>
        <div className="mt-1 text-2xl font-bold text-text-primary">{loading ? "…" : money(overview.balance)}</div>
        <div className="mt-4 flex items-center justify-center gap-10 border-t border-white/[0.06] pt-4 text-sm">
          <div className="flex flex-col items-center gap-1">
            <span className="text-text-muted">Income</span>
            <span className="flex items-center gap-1.5 font-medium text-text-primary">
              <ArrowUpCircle size={16} style={{ color: "#4f8cff" }} />
              {loading ? "…" : money(overview.monthIncome)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-text-muted">Expense</span>
            <span className="flex items-center gap-1.5 font-medium text-text-primary">
              <ArrowDownCircle size={16} style={{ color: "#4f8cff" }} />
              {loading ? "…" : money(overview.monthExpense)}
            </span>
          </div>
        </div>
      </div>

      {/* Funny Money -- Game-a-Fi paper cash across the practice account
          and every accepted Head to Head match. */}
      <ScoreboardCard />

      {/* Investment Alert -- same component used elsewhere, restyled as a
          nested panel box rather than a full-width standalone card. */}
      <InvestmentAlertCard />

      {/* Quick Access */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-text-primary">Quick Access</h4>
        <QuickAccessCard />
      </div>
    </div>
  );
}
