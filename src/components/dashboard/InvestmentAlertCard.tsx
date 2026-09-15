"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { descLine, relTime, titleLine } from "@/lib/dashboard/investmentAlerts";
import type { InvestmentAlert } from "@/lib/types/dashboard";
import NotificationsModal from "./NotificationsModal";

const ALERT_COLUMNS = "id,title,description,ticker,action,price,message,triggered_at";
const POLL_MS = 60000;

// Dashboard summary card -- shows the latest unread alert as a preview and
// opens the shared Notifications popup (same one TopBar's bell opens) on
// click. The popup itself (list, dismiss/delete, webhook setup) lives in
// NotificationsModal now, so both entry points stay in sync.
export default function InvestmentAlertCard() {
  const [alerts, setAlerts] = useState<InvestmentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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

      const { data, error } = await supabase
        .from("investment_alerts")
        .select(ALERT_COLUMNS)
        .eq("user_id", user.id)
        .eq("dismissed", false)
        .order("triggered_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      setAlerts(error ? [] : (data as InvestmentAlert[]) || []);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, POLL_MS);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const latest = alerts[0];
  const dotColor = latest ? "#3ddc97" : "hsla(224.62, 17.97%, 42.55%, 0.35)";
  const summaryText = latest ? titleLine(latest) : "No alerts yet.";
  const descText = latest ? descLine(latest).slice(0, 80) + (descLine(latest).length > 80 ? "…" : "") : "";
  const metaText = latest
    ? relTime(latest.triggered_at) + (alerts.length > 1 ? `  ·  +${alerts.length - 1} more` : "")
    : "";

  return (
    <>
      <button
        type="button"
        id="ia-alert-card"
        onClick={() => setModalOpen(true)}
        className="w-full rounded-[30px] bg-[rgb(32,40,56)] p-[30px] text-left"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Investment Alert</h3>
          <span
            id="ia-alert-dot"
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        </div>
        <div id="ia-alert-summary" className="text-sm font-medium text-text-primary">
          {loading ? "Loading…" : summaryText}
        </div>
        {descText && (
          <div id="ia-alert-desc" className="mt-1 text-sm text-text-muted">
            {descText}
          </div>
        )}
        {metaText && (
          <div id="ia-alert-meta" className="mt-2 text-xs text-text-muted">
            {metaText}
          </div>
        )}
        {alerts.length > 0 && <div className="mt-2 text-xs text-text-muted/70">Click to view recent alerts</div>}
      </button>

      {modalOpen && <NotificationsModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
