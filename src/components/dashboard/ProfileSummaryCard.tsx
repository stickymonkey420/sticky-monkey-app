"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, summarizeNetWorth } from "@/lib/dashboard/netWorth";
import { fetchManualAccounts } from "@/lib/wallet/queries";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import type { NetWorthSummary } from "@/lib/types/dashboard";
import InvestmentAlertCard from "./InvestmentAlertCard";
import ScoreboardCard from "./ScoreboardCard";
import QuickAccessCard from "./QuickAccessCard";

const EMPTY_SUMMARY: NetWorthSummary = {
  categories: [],
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
};

// Right-side profile panel for the Dashboard -- ported to match the live
// Webflow site's actual chrome (solid rgb(21,27,40) outer card, 30px
// radius, no border; a darker rgb(32,40,56) nested "Net Worth" box;
// Investment Alert and Quick Access nested inside the same panel) rather
// than the earlier pass's invented green-border treatment.
//
// The Net Worth/Total Assets/Total Liabilities block below is the same
// one the Dashboard's own NetWorthCard used to show inline in the main
// column -- moved here per your call, so it sits under the profile
// handle instead. The Income/Expense (Plaid transactions) row that used
// to live in this box moved the other way, into NetWorthCard above its
// Income table -- see that component.
export default function ProfileSummaryCard() {
  const { profile } = useProfile();
  const [summary, setSummary] = useState<NetWorthSummary>(EMPTY_SUMMARY);
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

      const accounts = await fetchManualAccounts(supabase, user.id);

      if (cancelled) return;
      setSummary(summarizeNetWorth(accounts));
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

      {/* Net Worth -- same figure and definition as the Dashboard's own
          Net Worth card (Cash & Bank + the few named investment buckets,
          minus credit card balances), not a sum of every manual account. */}
      <div className="rounded-[30px] p-[30px]" style={{ backgroundColor: "rgb(32,40,56)" }}>
        <div className="text-sm text-text-muted">Net Worth</div>
        <div className="mt-1 text-4xl font-bold text-text-primary">{loading ? "…" : money(summary.netWorth)}</div>
        <div className="mt-4 flex items-center gap-10 text-sm">
          <div>
            <div className="text-text-muted">Total Assets</div>
            <div className="mt-1 font-semibold" style={{ color: "#3ddc97" }}>
              {loading ? "…" : money(summary.totalAssets)}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Total Liabilities</div>
            <div className="mt-1 font-semibold" style={{ color: "#eb5757" }}>
              {loading ? "…" : money(summary.totalLiabilities)}
            </div>
          </div>
        </div>
      </div>

      {/* Funny Money -- Game-a-Fi paper cash across the practice account
          and every accepted Head to Head match. */}
      <ScoreboardCard />

      {/* Investment Alert -- same component used elsewhere, restyled as a
          nested panel box rather than a full-width standalone card. */}
      <InvestmentAlertCard />

      {/* Quick Access -- id is a stable highlight target for the Abu chat
          widget (see AbuChatWidget.tsx's GLOBAL_CARDS): this whole panel is
          mounted once in the app layout and visible on every page, so it's
          registered as a global highlight key rather than a per-page one. */}
      <div id="quick-access-section">
        <h4 className="mb-3 text-sm font-semibold text-text-primary">Quick Access</h4>
        <QuickAccessCard />
      </div>
    </div>
  );
}
