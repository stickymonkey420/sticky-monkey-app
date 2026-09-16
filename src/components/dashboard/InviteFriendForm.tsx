"use client";

import { useState } from "react";
import { sendFriendInvite } from "@/lib/invite/queries";

// "Invite Friend or Family" form -- popped up from the Dashboard's Quick
// Access panel (see InviteFriendModal.tsx). Sends a real Supabase Auth
// invite (via /api/invite -> auth.admin.inviteUserByEmail) using the
// existing "Invite user" email template (claude/invite-user-email-template.html),
// not a separate marketing email -- so it's still $0/month and goes out
// through the same custom SMTP domain (noreply@stickymonkey.net) as every
// other auth email this app already sends.
export default function InviteFriendForm({ onSent }: { onSent?: () => void } = {}) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendSuccess(null);
    const trimmedName = firstName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;

    setSending(true);
    const { error } = await sendFriendInvite(trimmedName, trimmedEmail);
    setSending(false);

    if (error) {
      setSendError(error);
      return;
    }
    setSendSuccess(`Invitation sent to ${trimmedEmail}.`);
    setFirstName("");
    setEmail("");
    onSent?.();
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Invite Friend or Family</h3>
      <p className="mb-3 text-xs text-text-muted">
        Send an invite to track investments, challenge friends to a Trade Off, and learn alongside you on Sticky
        Monkey.
      </p>
      <form onSubmit={handleSend} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-text-muted">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending || !firstName.trim() || !email.trim()}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {sending ? "Sending…" : "Send Invite"}
          </button>
          {sendError && <span className="text-xs text-[#ff5c7a]">{sendError}</span>}
          {sendSuccess && <span className="text-xs text-[#3ddc97]">{sendSuccess}</span>}
        </div>
      </form>
    </div>
  );
}
