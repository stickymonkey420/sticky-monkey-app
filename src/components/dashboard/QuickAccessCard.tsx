"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, Trophy, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ChallengeMemberModal from "@/components/gameAfi/ChallengeMemberModal";
import InviteFriendModal from "@/components/dashboard/InviteFriendModal";

// Ported from the live Webflow Dashboard's "Add Option Trade" and "Connect
// Accounts" (formerly "Connect Finance") Quick Access buttons
// (dashboard-quick-actions-js edge function).

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
        onExit: () => void;
      }) => { open: () => void };
    };
  }
}

function loadPlaidScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("plaid_sdk_failed"));
    document.head.appendChild(s);
  });
}

export default function QuickAccessCard() {
  const router = useRouter();
  const [showAddTrade, setShowAddTrade] = useState(true);
  const [connectLabel, setConnectLabel] = useState("Connect Accounts");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const connectingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // fail open -- keep the button visible/usable
      const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (cancelled || error) return;
      const role = (data?.role || "").toString().trim().toLowerCase();
      if (role === "free") setShowAddTrade(false);
    }

    checkRole();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddTrade() {
    router.push("/options?openTrade=1");
  }

  async function handleConnectFinance() {
    if (connectingRef.current) return;
    connectingRef.current = true;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setConnectLabel("Sign in first");
      setTimeout(() => setConnectLabel("Connect Accounts"), 1800);
      connectingRef.current = false;
      return;
    }

    setConnectLabel("Loading…");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    try {
      const [, tokenRes] = await Promise.all([
        loadPlaidScript(),
        fetch(`${base}/functions/v1/plaid-create-link-token`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok || !tokenBody?.link_token) {
        throw new Error(tokenBody?.error || "link_token_failed");
      }

      const handler = window.Plaid!.create({
        token: tokenBody.link_token,
        onSuccess: async (publicToken, metadata) => {
          setConnectLabel("Connecting…");
          try {
            const {
              data: { session: freshSession },
            } = await supabase.auth.getSession();
            const res2 = await fetch(`${base}/functions/v1/plaid-exchange-public-token`, {
              method: "POST",
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${freshSession?.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                public_token: publicToken,
                institution_name: metadata?.institution?.name,
              }),
            });
            if (!res2.ok) throw new Error("exchange_failed");
            setConnectLabel("Connected!");
            setTimeout(() => window.location.reload(), 900);
          } catch (err) {
            // No "Try again" flash here -- Plaid Link itself can take a moment
            // to pop up, and a label that changes mid-wait reads as a failure
            // even when nothing has gone wrong yet. Reset straight back to
            // the resting label; the real error still lands in the console
            // for debugging.
            console.error("[Connect Accounts] token exchange failed", err);
            setConnectLabel("Connect Accounts");
          }
        },
        onExit: () => {
          setConnectLabel("Connect Accounts");
          connectingRef.current = false;
        },
      });
      handler.open();
      setConnectLabel("Connect Accounts");
    } catch (err) {
      console.error("[Connect Accounts] failed to start Plaid Link", err);
      setConnectLabel("Connect Accounts");
    } finally {
      connectingRef.current = false;
    }
  }

  // Order per your call: Connect Accounts first (the one action most worth
  // surfacing up top), then Add Option Trade, Challenge a Member, Invite
  // Friend or Family last. Add Option Trade stays conditionally rendered
  // (paid/admin only, per showAddTrade above) -- it just drops out of this
  // fixed order for a free-tier viewer rather than leaving a gap.
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        data-quick-action="connect-finance"
        onClick={handleConnectFinance}
        className="flex items-center gap-3 rounded-[10px] bg-[rgb(32,40,56)] px-5 py-[18px] text-left text-sm font-medium text-text-primary hover:bg-white/[0.06]"
      >
        <Repeat size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
        <span className="quick-access-text-block">{connectLabel}</span>
      </button>
      {showAddTrade && (
        <button
          type="button"
          data-quick-action="add-option-trade-modal"
          onClick={handleAddTrade}
          className="flex items-center gap-3 rounded-[10px] bg-[rgb(32,40,56)] px-5 py-[18px] text-left text-sm font-medium text-text-primary hover:bg-white/[0.06]"
        >
          <Repeat size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
          Add Option Trade
        </button>
      )}
      <button
        type="button"
        data-quick-action="challenge-member-modal"
        onClick={() => setChallengeOpen(true)}
        className="flex items-center gap-3 rounded-[10px] bg-[rgb(32,40,56)] px-5 py-[18px] text-left text-sm font-medium text-text-primary hover:bg-white/[0.06]"
      >
        <Trophy size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
        Challenge a Member
      </button>
      {challengeOpen && <ChallengeMemberModal onClose={() => setChallengeOpen(false)} />}
      <button
        type="button"
        data-quick-action="invite-friend-modal"
        onClick={() => setInviteOpen(true)}
        className="flex items-center gap-3 rounded-[10px] bg-[rgb(32,40,56)] px-5 py-[18px] text-left text-sm font-medium text-text-primary hover:bg-white/[0.06]"
      >
        <UserPlus size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
        Invite Friend or Family
      </button>
      {inviteOpen && <InviteFriendModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
