"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { computeHoldings, ensurePaperAccount, fetchPaperTrades } from "@/lib/gameAfi/paperQueries";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { LITERACY_KEY } from "@/lib/dashboard/onboarding";
import { ABU_AVATAR_URL, ABU_TIPS, LEARNING_TIERS, tierForLevel } from "@/lib/dashboard/starterContent";

// Starter dashboard for free members (whose other dashboard cards hide
// themselves when there's no linked-account data): Getting Started
// checklist, a learning path from their survey literacy score, Abu's daily
// tip, and a Game-O-Fi practice snapshot. All reads are owner-scoped; no
// paid APIs.

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Snapshot = {
  value: number;
  starting: number;
  positions: number;
  trades: number;
};

type State = {
  loading: boolean;
  show: boolean;
  firstName: string;
  hasSurvey: boolean;
  hasPhoto: boolean;
  hasHandle: boolean;
  literacy: number | null;
  snapshot: Snapshot | null;
  challenges: number;
};

const INITIAL: State = {
  loading: true,
  show: false,
  firstName: "",
  hasSurvey: false,
  hasPhoto: false,
  hasHandle: false,
  literacy: null,
  snapshot: null,
  challenges: 0,
};

export default function StarterDashboard() {
  const [s, setS] = useState<State>(INITIAL);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Abu's tip rotates daily (computed here, not during render).
      const now = new Date();
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
      setTipIndex(dayOfYear % ABU_TIPS.length);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setS((p) => ({ ...p, loading: false }));
      const { data: prof } = await supabase
        .from("profiles")
        .select("role,name,username,avatar_url,onboarding_survey")
        .eq("id", user.id)
        .maybeSingle();
      const p = (prof ?? {}) as {
        role?: string;
        name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
        onboarding_survey?: Record<string, unknown> | null;
      };
      if (p.role !== "free") {
        if (!cancelled) setS((x) => ({ ...x, loading: false, show: false }));
        return;
      }

      const [account, trades, challenges] = await Promise.all([
        ensurePaperAccount(supabase),
        fetchPaperTrades(supabase, user.id),
        fetchChallenges(supabase),
      ]);
      const holdings = trades.length ? await computeHoldings(supabase, trades) : [];
      if (cancelled) return;

      const invested = holdings.reduce((sum, h) => sum + (h.marketValue ?? h.shares * h.avgCost), 0);
      const lit = p.onboarding_survey?.[LITERACY_KEY];
      setS({
        loading: false,
        show: true,
        firstName: (p.name ?? "").split(" ")[0] ?? "",
        hasSurvey: !!p.onboarding_survey,
        hasPhoto: !!p.avatar_url && p.avatar_url !== DEFAULT_AVATAR_URL,
        hasHandle: !!p.username,
        literacy: typeof lit === "number" ? lit : null,
        snapshot: account
          ? { value: account.cashBalance + invested, starting: account.startingBalance, positions: holdings.filter((h) => h.shares > 0).length, trades: trades.length }
          : null,
        challenges: challenges.length,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (s.loading || !s.show) return null;

  return (
    <div className="flex flex-col gap-6">
      <WelcomeHeader firstName={s.firstName} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <GettingStarted s={s} />
        <LearningPath level={s.literacy} />
        <AbuTip tip={ABU_TIPS[tipIndex]} />
      </div>
      <GameSnapshot s={s} />
    </div>
  );
}

function WelcomeHeader({ firstName }: { firstName: string }) {
  return (
    <div className="rounded-2xl border border-[#4f8cff]/25 bg-gradient-to-r from-[#4f8cff]/15 via-[#a855f7]/10 to-transparent p-5">
      <div className="text-lg font-semibold text-text-primary">Welcome{firstName ? `, ${firstName}` : ""} 👋</div>
      <p className="mt-1 text-sm text-text-muted">
        Learn how money really works, practice with fake money, and challenge friends. No ads, and we never sell your data.
      </p>
    </div>
  );
}

function GettingStarted({ s }: { s: State }) {
  const steps = [
    { done: s.hasSurvey, label: "Tell us about yourself", hint: "Onboarding survey", href: null },
    { done: s.hasHandle, label: "Pick your handle", hint: "Shown on leaderboards", href: null },
    { done: s.hasPhoto, label: "Add a profile photo", hint: "Click your avatar, top right", href: null },
    { done: (s.snapshot?.trades ?? 0) > 0, label: "Make your first practice trade", hint: "Game-O-Fi · $0 at risk", href: "/game-a-fi-overview" },
    { done: s.challenges > 0, label: "Challenge a member", hint: "Head to Head match", href: "/game-a-fi-overview" },
  ];
  const tracked = steps;
  const doneCount = tracked.filter((x) => x.done).length;
  const pct = Math.round((doneCount / tracked.length) * 100);

  return (
    <div className={CARD}>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Getting started</h3>
        <span className="text-xs text-text-muted">
          {doneCount}/{tracked.length} done
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#3ddc97] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex flex-col gap-2.5">
        {steps.map((x) => {
          const body = (
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${
                  x.done ? "border-[#3ddc97] bg-[#3ddc97] text-[#0f131c]" : "border-white/25 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${x.done ? "text-text-muted line-through" : "text-text-primary"}`}>{x.label}</span>
                <span className="block text-xs text-text-muted">{x.hint}</span>
              </span>
            </div>
          );
          return (
            <li key={x.label}>
              {x.href && !x.done ? (
                <Link href={x.href} className="block rounded-lg hover:bg-white/[0.03]">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LearningPath({ level }: { level: number | null }) {
  const tier = tierForLevel(level);
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={CARD}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Your learning path</h3>
        {level != null && <span className="text-xs text-text-muted">You rated yourself {level}/10</span>}
      </div>
      <div className="mb-3 flex gap-1">
        {LEARNING_TIERS.map((t) => (
          <span
            key={t.id}
            className={`flex-1 rounded-full px-2 py-1 text-center text-[11px] font-semibold ${
              t.id === tier.id ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted"
            }`}
          >
            {t.label}
          </span>
        ))}
      </div>
      <p className="mb-3 text-xs text-text-muted">{tier.blurb}</p>
      <div className="flex flex-col gap-1.5">
        {tier.topics.map((t, i) => (
          <div key={t.title} className="rounded-xl bg-white/5">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-text-primary"
            >
              <span>
                <span className="mr-2 text-xs text-text-muted">{i + 1}</span>
                {t.title}
              </span>
              <span className="text-xs text-text-muted">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-3 pb-3 text-xs leading-relaxed text-text-muted">
                {t.summary}
                {t.action && (
                  <Link href={t.action.href} className="mt-2 block font-semibold text-[#4f8cff] hover:underline">
                    {t.action.label} →
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Link href="/smu" className="mt-3 block text-xs font-semibold text-[#4f8cff] hover:underline">
        More at Sticky Monkey University →
      </Link>
    </div>
  );
}

function AbuTip({ tip }: { tip: string }) {
  return (
    <div className={`${CARD} flex flex-col`}>
      <h3 className="mb-3 text-sm font-semibold text-text-primary">Abu&apos;s money tip of the day</h3>
      <div className="flex flex-1 items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ABU_AVATAR_URL} alt="Abu" className="h-14 w-14 shrink-0 rounded-full border-2 border-[#f5d020] bg-[#0f131c] object-cover" />
        <div className="relative rounded-2xl rounded-tl-sm bg-[#f5d020]/10 p-3.5 text-sm leading-relaxed text-text-primary">{tip}</div>
      </div>
      <p className="mt-3 text-[11px] text-text-muted">A new tip every day. Ask Abu anything with the chat button, bottom right.</p>
    </div>
  );
}

function GameSnapshot({ s }: { s: State }) {
  const snap = s.snapshot;
  const change = snap ? snap.value - snap.starting : 0;
  const changePct = snap && snap.starting ? (change / snap.starting) * 100 : 0;
  const up = change >= 0;
  return (
    <div className={CARD}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Game-O-Fi · Monkey Money practice</h3>
        <Link href="/game-a-fi-overview" className="rounded-lg bg-[#4f8cff] px-3 py-1.5 text-xs font-semibold text-white">
          {snap && snap.trades > 0 ? "Open Game-O-Fi" : "Make your first trade"}
        </Link>
      </div>
      <div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Portfolio value" value={snap ? usd(snap.value) : "—"} />
          <Stat
            label="Since start"
            value={snap ? `${up ? "+" : "−"}${changePct === 0 ? "0.00" : Math.abs(changePct).toFixed(2)}%` : "—"}
            color={snap && change !== 0 ? (up ? "#3ddc97" : "#ff5c7a") : undefined}
            sub={snap ? `${up ? "+" : "−"}${usd(Math.abs(change))}` : undefined}
          />
          <Stat label="Positions" value={snap ? String(snap.positions) : "—"} sub={snap ? `${snap.trades} trades` : undefined} />
          {snap && snap.trades === 0 && (
            <p className="col-span-3 text-xs text-text-muted">
              You have {usd(snap.starting)} in practice money. Buy a few stocks and watch how they move. Nothing real is at risk.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 text-[11px] text-text-muted">{label}</div>
      <div className="text-base font-semibold text-text-primary" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}
