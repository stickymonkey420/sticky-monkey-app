"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { descLine, formatPrice, relTime, titleLine } from "@/lib/dashboard/investmentAlerts";
import type { InvestmentAlert } from "@/lib/types/dashboard";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/constants";
import { fetchChallenges, respondToChallenge } from "@/lib/gameAfi/challengeQueries";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import { formatChallengeWhen, formatMoney } from "@/lib/gameAfi/format";

const ALERT_COLUMNS = "id,title,description,ticker,action,price,message,triggered_at";

// The "Notifications" popup -- shared by the Investment Alert card (Dashboard
// profile pane) and the TopBar bell icon, so both open the exact same
// window instead of two divergent alert UIs. Self-contained: fetches its
// own alert list AND its own pending Head to Head invites on mount (i.e.
// each time it's opened, since the parent conditionally mounts it),
// independent of whatever preview data the Investment Alert card is
// already polling for its own summary line.
//
// onChange fires after any action here that could change the bell's badge
// count (dismissing/deleting an alert, accepting/declining an invite) so
// TopBar can re-fetch its counts -- this component has no way to update
// that badge itself.
export default function NotificationsModal({ onClose, onChange }: { onClose: () => void; onChange?: () => void }) {
  const [alerts, setAlerts] = useState<InvestmentAlert[]>([]);
  const [invites, setInvites] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const userIdRef = useRef<string | null>(null);

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
      userIdRef.current = user.id;

      const [alertsRes, challengeRows] = await Promise.all([
        supabase
          .from("investment_alerts")
          .select(ALERT_COLUMNS)
          .eq("user_id", user.id)
          .eq("dismissed", false)
          .order("triggered_at", { ascending: false })
          .limit(100),
        fetchChallenges(supabase),
      ]);

      if (cancelled) return;
      setAlerts(alertsRes.error ? [] : (alertsRes.data as InvestmentAlert[]) || []);
      setInvites(challengeRows.filter((c) => c.direction === "received" && c.status === "pending"));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function dismissAlert(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("investment_alerts")
      .update({ dismissed: true, dismissed_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      onChange?.();
    }
  }

  async function deleteAlert(id: string) {
    if (!window.confirm("Delete this alert? This cannot be undone.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("investment_alerts").delete().eq("id", id);
    if (!error) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      onChange?.();
    }
  }

  async function respondToInvite(id: string, accept: boolean) {
    setRespondingId(id);
    const supabase = createClient();
    const { error } = await respondToChallenge(supabase, id, accept);
    setRespondingId(null);
    if (!error) {
      setInvites((prev) => prev.filter((c) => c.id !== id));
      onChange?.();
    }
  }

  async function toggleWebhook() {
    const opening = !webhookOpen;
    setWebhookOpen(opening);
    if (!opening || webhookUrl || webhookLoading) return;

    setWebhookLoading(true);
    setWebhookError(null);
    const supabase = createClient();
    const uid = userIdRef.current;
    if (!uid) {
      setWebhookError("Could not load your webhook URL. Try again.");
      setWebhookLoading(false);
      return;
    }
    const { data, error } = await supabase.from("profiles").select("alert_webhook_token").eq("id", uid).single();

    const token = data?.alert_webhook_token as string | undefined;
    if (error || !token) {
      setWebhookError("Could not load your webhook URL. Try again.");
      setWebhookLoading(false);
      return;
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    setWebhookUrl(`${base}/functions/v1/tradingview-webhook?token=${token}`);
    setWebhookLoading(false);
  }

  return (
    <div
      id="ia-alert-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">Notifications</h3>
          <button
            id="ia-alert-close"
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!loading && invites.length > 0 && (
          <div className="mb-3 border-b border-white/10 pb-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Head to Head Invites
            </div>
            {invites.map((c) => (
              <div key={c.id} className="flex items-start gap-3 border-b border-white/10 py-3 last:border-b-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.other_avatar_url || DEFAULT_AVATAR_URL}
                  alt={c.other_username || c.other_name || "Member"}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {c.other_username ? `@${c.other_username}` : c.other_name || "Member"} challenged you
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "#4f8cff" }}>
                    {formatMoney(c.starting_balance)} starting capital
                    {c.expires_at && ` · Ends ${formatChallengeWhen(c.expires_at)}`}
                  </div>
                  {c.message && (
                    <div className="mt-0.5 truncate text-xs text-text-muted">&ldquo;{c.message}&rdquo;</div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={respondingId === c.id}
                      onClick={() => respondToInvite(c.id, true)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: "#3ddc97" }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={respondingId === c.id}
                      onClick={() => respondToInvite(c.id, false)}
                      className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div id="ia-alert-list">
          {loading ? (
            <div className="py-2.5 text-sm text-text-muted">Loading…</div>
          ) : alerts.length === 0 ? (
            <div className="py-2.5 text-sm text-text-muted">
              No alerts yet. Alerts triggered from TradingView will show up here, and stay listed until you dismiss
              or delete them.
            </div>
          ) : (
            alerts.map((a) => {
              const priceText = formatPrice(a.price);
              const desc = descLine(a);
              return (
                <div key={a.id} data-alert-row={a.id} className="border-b border-white/10 py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-sm font-semibold text-text-primary">{titleLine(a)}</span>
                    <span className="shrink-0 text-xs text-text-muted">{relTime(a.triggered_at)}</span>
                  </div>
                  {a.ticker && (
                    <div className="mt-0.5 text-xs text-text-muted">
                      {a.ticker}
                      {a.action ? ` · ${a.action}` : ""}
                    </div>
                  )}
                  {priceText && (
                    <div className="mt-0.5 text-sm" style={{ color: "#3ddc97" }}>
                      {priceText}
                    </div>
                  )}
                  {desc && <div className="mt-1 text-sm text-text-muted">{desc}</div>}
                  <div className="mt-2 flex gap-3.5">
                    <button
                      type="button"
                      onClick={() => dismissAlert(a.id)}
                      className="p-0 text-xs"
                      style={{ color: "#4f8cff" }}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAlert(a.id)}
                      className="p-0 text-xs"
                      style={{ color: "#e05656" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 border-t border-card-border pt-3">
          <button
            id="ia-webhook-toggle"
            type="button"
            onClick={toggleWebhook}
            className="text-xs font-medium text-text-muted hover:text-text-primary"
          >
            {webhookOpen ? "Hide" : "Show"} TradingView webhook setup
          </button>
          {webhookOpen && (
            <div id="ia-webhook-details" className="mt-2.5 text-xs text-text-muted">
              {webhookLoading && "Loading…"}
              {!webhookLoading && webhookError && webhookError}
              {!webhookLoading && !webhookError && webhookUrl && (
                <>
                  <div className="mb-1.5">Paste this as the Webhook URL in your TradingView alert:</div>
                  <div className="select-all rounded-md border border-[#2a2f3f] bg-[#0d0f17] px-2.5 py-2 font-mono text-[11px] text-[#e7e9f5]">
                    {webhookUrl}
                  </div>
                  <div className="mb-1.5 mt-2.5">
                    Example alert Message (JSON — set this as the alert&apos;s Message so the title/description show
                    up here):
                  </div>
                  <div className="select-all rounded-md border border-[#2a2f3f] bg-[#0d0f17] px-2.5 py-2 font-mono text-[11px] text-[#e7e9f5]">
                    {
                      '{"title":"SELL COVERED CALLS","description":"Alert to sell CC on this stock.","ticker":"{{ticker}}","price":{{close}}}'
                    }
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
