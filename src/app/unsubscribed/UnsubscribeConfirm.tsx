"use client";

import { useState } from "react";

export default function UnsubscribeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("busy");
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }

  if (!token) return <p className="text-sm text-[#8a93a6]">This unsubscribe link isn&apos;t valid. You can turn off email updates in your profile.</p>;
  if (state === "done")
    return (
      <p className="text-sm text-[#e6e8ee]">
        You&apos;re unsubscribed. You won&apos;t get any more update emails. You can turn them back on anytime in your profile.
      </p>
    );
  return (
    <>
      <p className="mb-4 text-sm text-[#e6e8ee]">Stop getting news and feature emails from Sticky Monkey?</p>
      <button
        type="button"
        onClick={unsubscribe}
        disabled={state === "busy"}
        className="rounded-xl bg-[#f5d020] px-5 py-2.5 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
      >
        {state === "busy" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      {state === "error" && <p className="mt-3 text-sm text-[#ff5c7a]">Couldn&apos;t unsubscribe. Please try again.</p>}
    </>
  );
}
