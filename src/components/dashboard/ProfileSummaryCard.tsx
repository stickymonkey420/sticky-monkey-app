"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dashboard/netWorth";
import { descLine, relTime, titleLine } from "@/lib/dashboard/investmentAlerts";
import { fetchManualAccounts, fetchPlaidTransactions } from "@/lib/wallet/queries";
import { computeWalletOverview, type WalletOverview } from "@/lib/wallet/calc";
import type { InvestmentAlert } from "@/lib/types/dashboard";

// Fallback avatar -- same asset TopBar falls back to when profiles.avatar_url
// is unset.
const DEFAULT_AVATAR_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a973826f57d905329bc6275_abu-avatar-p-500.jpg";

const ALERT_COLUMNS = "id,title,description,ticker,action,price,message,triggered_at";

const EMPTY_OVERVIEW: WalletOverview = {
  balance: 0,
  totalIncome: 0,
  totalExpense: 0,
  netThisMonth: 0,
  monthIncome: 0,
  monthExpense: 0,
};

type ProfileLite = { name: string | null; email: string | null; avatar_url: string | null; role: string | null };

// Right-side "profile summary" panel for the Dashboard, per the reference
// mockup: avatar/name/email, Current Balance, this-month Income/Expense,
// the latest Investment Alert, and a Quick Access section. New component --
// nothing like this existed in the app before this pass. Follows the same
// self-contained per-component data-fetching convention as the other
// dashboard cards rather than lifting state to the page.
export default function ProfileSummaryCard() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [overview, setOverview] = useState<WalletOverview>(EMPTY_OVERVIEW);
  const [latestAlert, setLatestAlert] = useState<InvestmentAlert | null>(null);
  const [alertCount, setAlertCount] = useState(0);
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

      const [{ data: profileData }, accounts, txs, { data: alerts }] = await Promise.all([
        supabase.from("profiles").select("name,email,avatar_url,role").eq("id", user.id).maybeSingle(),
        fetchManualAccounts(supabase, user.id),
        fetchPlaidTransactions(supabase, user.id),
        supabase
          .from("investment_alerts")
          .select(ALERT_COLUMNS)
          .eq("user_id", user.id)
          .eq("dismissed", false)
          .order("triggered_at", { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;
      if (profileData) setProfile(profileData as ProfileLite);
      setOverview(computeWalletOverview(accounts, txs));
      const alertRows = (alerts as InvestmentAlert[]) || [];
      setLatestAlert(alertRows[0] || null);
      setAlertCount(alertRows.length);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.name || "Account";
  const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR_URL;
  const showAddTrade = profile?.role !== "free";

  return (
    <div className="featured-border flex w-full flex-col gap-5 rounded-2xl bg-card-bg p-5 md:w-80 md:shrink-0">
      {/* Avatar / name / email */}
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={displayName} className="h-14 w-14 rounded-full object-cover" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary">{displayName}</div>
          {profile?.email && <div className="truncate text-xs text-text-muted">{profile.email}</div>}
        </div>
      </div>

      {/* Current Balance */}
      <div className="border-t border-card-border pt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Current Balance</div>
        <div className="mt-1 text-2xl font-semibold text-text-primary">{loading ? "…" : money(overview.balance)}</div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <div>
            <div className="text-text-muted">Income</div>
            <div className="font-medium" style={{ color: "#3ddc97" }}>
              {loading ? "…" : money(overview.monthIncome)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">Expense</div>
            <div className="font-medium" style={{ color: "#ff5c7a" }}>
              {loading ? "…" : money(overview.monthExpense)}
            </div>
          </div>
        </div>
      </div>

      {/* Investment Alert summary */}
      <button
        type="button"
        onClick={() => router.push("/dashboard#ia-alert-card")}
        className="rounded-xl border border-card-border bg-white/[0.03] p-3 text-left"
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: latestAlert ? "#3ddc97" : "hsla(224.62, 17.97%, 42.55%, 0.35)" }}
          />
          <span className="text-xs font-semibold text-text-primary">Investment Alert</span>
        </div>
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : latestAlert ? (
          <>
            <div className="text-sm font-medium text-text-primary">{titleLine(latestAlert)}</div>
            {descLine(latestAlert) && (
              <div className="mt-0.5 truncate text-xs text-text-muted">{descLine(latestAlert)}</div>
            )}
            <div className="mt-1 text-[11px] text-text-muted">
              {relTime(latestAlert.triggered_at)}
              {alertCount > 1 ? `  ·  +${alertCount - 1} more` : ""}
            </div>
          </>
        ) : (
          <div className="text-sm text-text-muted">No alerts yet.</div>
        )}
      </button>

      {/* Quick Access */}
      <div className="border-t border-card-border pt-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Quick Access</h4>
        <div className="flex flex-wrap gap-2">
          {showAddTrade && (
            <button
              type="button"
              onClick={() => router.push("/options?openTrade=1")}
              className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-white/10"
            >
              + Add Option Trade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
