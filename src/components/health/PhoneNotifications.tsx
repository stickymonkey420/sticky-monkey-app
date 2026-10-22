"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "@/lib/pwa/push";

// Turns real phone/desktop notifications on or off for this device. What
// gets sent: weigh-in and measurement reminders (at the times set above),
// fasting goal reached, and a weekly Monday digest of medical follow-ups.
export default function PhoneNotifications({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const s = await pushState().catch(() => "unsupported" as const);
      if (!cancelled) setState(s);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const on = () =>
    run(async () => {
      const supabase = createClient();
      const s = await enablePush(supabase, userId);
      setState(s);
      if (s === "on") {
        const n = await sendTestPush(supabase);
        setMsg(n ? "Done. A test notification is on its way." : "Turned on. If no test arrives, check this device's notification settings.");
      }
    });
  const off = () => run(async () => setState(await disablePush(createClient())));
  const test = () =>
    run(async () => {
      const n = await sendTestPush(createClient());
      setMsg(n ? "Test sent." : "No devices found. Turn notifications off and on again.");
    });

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <BellRing size={16} className="text-[#f5d020]" />
        <span className="text-sm font-semibold text-text-primary">Phone notifications</span>
        {state === "on" && <span className="ml-auto rounded-full bg-[#3ddc97]/15 px-2 py-0.5 text-[11px] font-semibold text-[#3ddc97]">On</span>}
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        Get these reminders on this device, plus fasting goals, a Monday summary of medical follow-ups, and passport/visa expiry alerts from Travel.
      </p>
      {state === "loading" && <p className="mt-2 text-xs text-text-muted">Checking…</p>}
      {state === "ios-install" && (
        <p className="mt-2 text-xs text-[#f5d020]">
          On iPhone, add Sticky Monkey to your Home Screen first (Safari ••• › Share › Add to Home Screen), then open it from there and turn this on.
        </p>
      )}
      {state === "unsupported" && <p className="mt-2 text-xs text-text-muted">This browser doesn&apos;t support notifications.</p>}
      {state === "denied" && (
        <p className="mt-2 text-xs text-[#ff5c7a]">Notifications are blocked for this site. Allow them in your device or browser settings, then come back.</p>
      )}
      {state === "off" && (
        <button type="button" disabled={busy} onClick={on} className="mt-3 rounded-md bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-50">
          {busy ? "Turning on…" : "Turn on for this device"}
        </button>
      )}
      {state === "on" && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={test} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 disabled:opacity-50">
            Send a test
          </button>
          <button type="button" disabled={busy} onClick={off} className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50">
            Turn off
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-text-muted">{msg}</p>}
    </div>
  );
}
