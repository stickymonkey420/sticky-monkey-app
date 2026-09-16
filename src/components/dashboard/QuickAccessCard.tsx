"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ChallengeMemberModal from "@/components/gameAfi/ChallengeMemberModal";

// Ported from the live Webflow Dashboard's "Add Option Trade" and "Connect
// Finance" Quick Access buttons (dashboard-quick-actions-js edge function).

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
  const [connectLabel, setConnectLabel] = useState("Connect Finance");
  const [challengeOpen, setChallengeOpen] = useState(false);
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
      setTimeout(() => setConnectLabel("Connect Finance"), 1800);
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
          } catch {
            setConnectLabel("Try again");
            setTimeout(() => setConnectLabel("Connect Finance"), 1800);
          }
        },
        onExit: () => {
          setConnectLabel("Connect Finance");
          connectingRef.current = false;
        },
      });
      handler.open();
      setConnectLabel("Connect Finance");
    } catch {
      setConnectLabel("Try again");
      setTimeout(() => setConnectLabel("Connect Finance"), 1800);
    } finally {
      connectingRef.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
        data-quick-action="connect-finance"
        onClick={handleConnectFinance}
        className="flex items-center gap-3 rounded-[10px] bg-[rgb(32,40,56)] px-5 py-[18px] text-left text-sm font-medium text-text-primary hover:bg-white/[0.06]"
      >
        <Repeat size={16} className="shrink-0 text-text-muted" strokeWidth={1.75} />
        <span className="quick-access-text-block">{connectLabel}</span>
      </button>
    </div>
  );
}
