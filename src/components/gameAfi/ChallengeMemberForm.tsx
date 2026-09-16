"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendChallenge } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";

const DEFAULT_STARTING_BALANCE = "10000";
const MIN_STARTING_BALANCE = 10000;
const MAX_STARTING_BALANCE = 1000000;

// today's date as a yyyy-mm-dd string, for the expiration <input type="date"> min.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The "Challenge a Member" form -- extracted out of ChallengesPanel so it
// can be shown two places with one implementation: inline on the Game-a-Fi
// Head to Head tab (ChallengesPanel.tsx) and in a popup from the Dashboard's
// Quick Access panel (ChallengeMemberModal.tsx). onSent fires after a
// successful send (ChallengeMemberModal uses it to auto-close). Sending an
// invite; the recipient accepts/declines it via the Notifications bell
// (NotificationsModal.tsx already surfaces pending received invites there)
// -- this form only ever creates one.
export default function ChallengeMemberForm({ onSent }: { onSent?: () => void } = {}) {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [startingBalance, setStartingBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [expiresAt, setExpiresAt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendSuccess(null);
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) return;

    const balance = Number(startingBalance);
    if (!Number.isFinite(balance) || balance < MIN_STARTING_BALANCE || balance > MAX_STARTING_BALANCE) {
      setSendError(
        `Enter a starting capital between ${formatMoney(MIN_STARTING_BALANCE)} and ${formatMoney(MAX_STARTING_BALANCE)}.`
      );
      return;
    }

    setSending(true);
    const supabase = createClient();
    const { error } = await sendChallenge(
      supabase,
      trimmedHandle,
      message,
      balance,
      expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null
    );
    setSending(false);

    if (error) {
      setSendError(error);
      return;
    }
    setSendSuccess(`Challenge sent to @${trimmedHandle}.`);
    setHandle("");
    setMessage("");
    setStartingBalance(DEFAULT_STARTING_BALANCE);
    setExpiresAt("");
    onSent?.();
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">Challenge a Member</h3>
      <form onSubmit={handleSend} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-text-muted">Handle</label>
            <div className="flex items-center gap-1.5 rounded-md border border-card-border bg-[#0f131c] px-3 py-2">
              <span className="text-sm text-text-muted">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="their_handle"
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-text-muted">Starting Capital</label>
            <div className="flex items-center gap-1.5 rounded-md border border-card-border bg-[#0f131c] px-3 py-2">
              <span className="text-sm text-text-muted">$</span>
              <input
                type="number"
                min={MIN_STARTING_BALANCE}
                max={MAX_STARTING_BALANCE}
                step={1000}
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-text-muted">Expires (optional)</label>
            <input
              type="date"
              min={todayIso()}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none [color-scheme:dark]"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-text-muted">Message (optional)</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Trash talk goes here..."
            maxLength={200}
            className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <p className="text-[11px] text-text-muted">
          Whoever accepts is agreeing to these exact terms -- holdings during the match are expected to be bought
          with this starting capital.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending || !handle.trim()}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {sending ? "Sending…" : "Send Challenge"}
          </button>
          {sendError && <span className="text-xs text-[#ff5c7a]">{sendError}</span>}
          {sendSuccess && <span className="text-xs text-[#3ddc97]">{sendSuccess}</span>}
        </div>
      </form>
    </div>
  );
}
