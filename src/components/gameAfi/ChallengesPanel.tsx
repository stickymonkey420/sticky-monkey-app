"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { cancelChallenge, fetchChallenges, respondToChallenge, sendChallenge } from "@/lib/gameAfi/challengeQueries";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import { formatChallengeWhen as formatWhen, formatMoney } from "@/lib/gameAfi/format";

const DEFAULT_STARTING_BALANCE = "10000";

// today's date as a yyyy-mm-dd string, for the expiration <input type="date"> min.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusPill({ status }: { status: ChallengeRow["status"] }) {
  const styles: Record<ChallengeRow["status"], { bg: string; label: string }> = {
    pending: { bg: "#4f8cff", label: "Pending" },
    accepted: { bg: "#3ddc97", label: "Accepted" },
    declined: { bg: "#ff5c7a", label: "Declined" },
    cancelled: { bg: "#6b7280", label: "Cancelled" },
  };
  const s = styles[status];
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

// One challenge row, shared by the Received and Sent lists -- everything
// but the action buttons on the right is identical between the two.
function ChallengeRowItem({ c, actions }: { c: ChallengeRow; actions: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.other_avatar_url || DEFAULT_AVATAR_URL}
          alt={c.other_username || c.other_name || "Member"}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">
            {c.other_username ? `@${c.other_username}` : c.other_name || "Member"}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: "#4f8cff" }}>
            {formatMoney(c.starting_balance)} starting capital
            {c.expires_at && ` · Ends ${formatWhen(c.expires_at)}`}
          </div>
          {c.message && <div className="mt-0.5 truncate text-xs text-text-muted">&ldquo;{c.message}&rdquo;</div>}
          <div className="mt-0.5 text-[11px] text-text-muted">Sent {formatWhen(c.created_at)}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

// Head-to-head challenges: a member types another member's handle, agrees
// on a starting paper capital and (optionally) an expiration date, and
// sends an invite; the recipient accepts/declines those exact terms (no
// counter-offer yet) or the sender can cancel. All reads/writes go through
// the game_afi_* SECURITY DEFINER RPCs -- see lib/gameAfi/challengeQueries.ts.
export default function ChallengesPanel() {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [startingBalance, setStartingBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [expiresAt, setExpiresAt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  async function reload() {
    const supabase = createClient();
    const rows = await fetchChallenges(supabase);
    setChallenges(rows);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const rows = await fetchChallenges(supabase);
      if (cancelled) return;
      setChallenges(rows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendSuccess(null);
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) return;

    const balance = Number(startingBalance);
    if (!Number.isFinite(balance) || balance <= 0) {
      setSendError("Enter a starting capital greater than 0.");
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
    reload();
  }

  async function handleRespond(id: string, accept: boolean) {
    setActioningId(id);
    const supabase = createClient();
    await respondToChallenge(supabase, id, accept);
    setActioningId(null);
    reload();
  }

  async function handleCancel(id: string) {
    setActioningId(id);
    const supabase = createClient();
    await cancelChallenge(supabase, id);
    setActioningId(null);
    reload();
  }

  const received = challenges.filter((c) => c.direction === "received");
  const sent = challenges.filter((c) => c.direction === "sent");

  return (
    <div className="flex flex-col gap-6">
      {/* Send a challenge */}
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
                  min={1}
                  step={100}
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

      {/* Received */}
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Received</h3>
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : received.length === 0 ? (
          <div className="text-sm text-text-muted">No challenges yet -- send one above to get things started.</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {received.map((c) => (
              <ChallengeRowItem
                key={c.id}
                c={c}
                actions={
                  c.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={actioningId === c.id}
                        onClick={() => handleRespond(c.id, true)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: "#3ddc97" }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === c.id}
                        onClick={() => handleRespond(c.id, false)}
                        className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <StatusPill status={c.status} />
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Sent */}
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Sent</h3>
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : sent.length === 0 ? (
          <div className="text-sm text-text-muted">You haven&apos;t sent any challenges yet.</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {sent.map((c) => (
              <ChallengeRowItem
                key={c.id}
                c={c}
                actions={
                  <>
                    <StatusPill status={c.status} />
                    {c.status === "pending" && (
                      <button
                        type="button"
                        disabled={actioningId === c.id}
                        onClick={() => handleCancel(c.id)}
                        className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
