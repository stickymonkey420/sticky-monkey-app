"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { LOGO_HEAD_URL } from "@/lib/brand/logo";
import { createClient } from "@/lib/supabase/client";

// Self-serve demo data.
//  - DemoBanner (bottom of every app page): shown only to members who loaded
//    the demo themselves (is_demo + demo_restore_role; not admin demo
//    accounts like jdoe), with a
//    one-click "Clear demo data" (clear_demo_data RPC: wipes the sample data
//    and restores the account's original plan).
//  - DemoLoadCard (Dashboard): offered only to an account with no data of
//    its own yet (can_load_demo_data RPC); load_demo_data seeds the full
//    sample set (banking, investments, options, businesses, rentals, W-2 +
//    paystub, taxes). The server refuses if any real data exists.

export function DemoBanner() {
  const confirm = useConfirm();
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("is_demo,demo_restore_role")
        .eq("id", user.id)
        .maybeSingle();
      const p = data as {
        is_demo?: boolean;
        demo_restore_role?: string | null;
      } | null;
      // Only members who loaded the demo themselves (demo_restore_role set).
      // Admin-assigned demo accounts (e.g. jdoe) never see it.
      if (!cancelled) setIsDemo(!!p?.is_demo && !!p?.demo_restore_role);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function clear() {
    if (busy) return;
    const ok = await confirm({
      title: "Clear demo data?",
      message:
        "This removes all the sample data (accounts, investments, options, businesses, rentals, W-2 and taxes) so you can start fresh with your own. Anything you added while the demo was loaded is removed too. This can't be undone.",
      confirmLabel: "Clear demo data",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    const { error } = await createClient().rpc("clear_demo_data");
    if (error) {
      setBusy(false);
      setErr("Couldn't clear demo data. Please try again.");
      return;
    }
    // Full reload: every page holds state read from the tables just emptied.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  }

  if (!isDemo) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f5d020]/30 bg-[#f5d020]/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2.5 text-text-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_HEAD_URL}
          alt="Sticky Monkey"
          className="h-7 w-auto shrink-0"
        />
        <span>
          <b className="text-[#f5d020]">You&apos;re exploring demo data.</b>{" "}
          <span className="text-text-muted">
            Nothing here is real. Look around every feature, then clear it when
            you&apos;re ready to add your own.
          </span>
          {err && <span className="ml-2 text-[#ff5c7a]">{err}</span>}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={clear}
        className="shrink-0 rounded-lg bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
      >
        {busy ? "Clearing…" : "Clear demo data & start fresh"}
      </button>
    </div>
  );
}

export function DemoLoadCard() {
  const confirm = useConfirm();
  const [canLoad, setCanLoad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await createClient().rpc("can_load_demo_data");
      if (!cancelled && !error) setCanLoad(data === true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDemo() {
    if (busy) return;
    const ok = await confirm({
      title: "Load demo data?",
      message:
        "We'll fill your account with realistic sample data so you can try every feature: banking, investments, options, businesses, rentals, W-2 income and taxes. A banner will let you clear it all when you're ready to use your own.",
      confirmLabel: "Load demo data",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    const { error } = await createClient().rpc("load_demo_data");
    if (error) {
      setBusy(false);
      setErr(
        /new account/i.test(error.message)
          ? "Demo data can only be loaded into an account that has no data yet."
          : "Couldn't load demo data. Please try again.",
      );
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  }

  if (!canLoad) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4f8cff]/30 bg-[#4f8cff]/10 p-5">
      <div className="min-w-0">
        <div className="text-base font-semibold text-text-primary">
          Want to look around first?
        </div>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Load sample data to see the full app in action (net worth,
          investments, options income, side businesses, rentals and a tax
          estimate) without entering anything personal. Clear it with one click
          whenever you&apos;re ready.
        </p>
        {err && <p className="mt-1 text-sm text-[#ff5c7a]">{err}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={loadDemo}
        className="shrink-0 rounded-xl bg-[#4f8cff] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Loading demo…" : "Load demo data"}
      </button>
    </div>
  );
}
