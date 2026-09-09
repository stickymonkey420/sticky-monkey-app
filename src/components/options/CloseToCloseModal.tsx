"use client";

import { useEffect, useState } from "react";
import { computeMoneyness } from "@/lib/options/calc";
import { fmtDate, money } from "@/lib/options/queries";
import type { Quote } from "@/lib/options/priceQuotes";
import type { OpenPosition } from "@/lib/options/types";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";

type CloseToCloseModalProps = {
  position: OpenPosition; // wheel_trades row only (CSP/CC)
  onClose: () => void;
  onSaved: () => void;
  onSubmit: (costPerShare: number) => Promise<{ error: string | null }>;
  fetchQuote: (ticker: string) => Promise<Quote | null>;
};

type PriceState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; price: number };

// Standalone Buy-to-Close modal -- ported from the live Webflow page's
// dynamically-built #close-modal-overlay (project doc
// `claude/roll-positions-options-script.html`). Unlike a roll, this only
// flips the trade's status to "closed" and records the closing debit --
// no new leg is opened. See closeToClose() in lib/options/mutations.ts.
export default function CloseToCloseModal({ position, onClose, onSaved, onSubmit, fetchQuote }: CloseToCloseModalProps) {
  const [cost, setCost] = useState("0");
  const [priceState, setPriceState] = useState<PriceState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuote(position.ticker).then((q) => {
      if (cancelled) return;
      setPriceState(q ? { status: "ready", price: q.price } : { status: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const costNum = Number.isNaN(parseFloat(cost)) ? 0 : parseFloat(cost);
  const contracts = Number(position.contracts) || 0;
  const pnl = contracts >= 1 ? (Number(position.premium) - costNum) * contracts * 100 : null;
  const moneyness =
    priceState.status === "ready"
      ? computeMoneyness(position.type as "CSP" | "CC", Number(position.strike) || 0, priceState.price)
      : null;

  async function handleSubmit() {
    const costPerShare = parseFloat(cost);
    if (Number.isNaN(costPerShare) || costPerShare < 0) {
      setErrorMsg("Enter a valid buy-to-close cost (0 or more).");
      return;
    }
    setErrorMsg(null);
    setSaving(true);
    const { error } = await onSubmit(costPerShare);
    setSaving(false);
    if (error) {
      setErrorMsg("Could not close this position. Try again.");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">
            Buy to Close {position.ticker} {position.type}
          </h3>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-2 text-xs text-text-muted">
          Current: {money(Number(position.strike))} strike, exp {fmtDate(position.expiration)}, {position.contracts} ctr,{" "}
          {money(position.premium)}/sh collected
        </div>

        <div className="mb-4 text-xs">
          {priceState.status === "loading" && <span className="text-text-muted">Fetching live price for {position.ticker}…</span>}
          {priceState.status === "unavailable" && <span className="text-text-muted">Live price unavailable.</span>}
          {priceState.status === "ready" && moneyness && (
            <span>
              Live: {money(priceState.price)} &nbsp;·&nbsp;{" "}
              <span
                style={{
                  color: moneyness.tone === "safe" ? "#3ddc97" : moneyness.tone === "risk-put" ? "#ff5c7a" : "#ffb648",
                  fontWeight: 600,
                }}
              >
                {moneyness.label}
              </span>
            </span>
          )}
        </div>

        <div className="mb-4">
          <label className={LABEL_CLASS}>Buy-to-Close Cost / Sh</label>
          <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={INPUT_CLASS} />
        </div>

        {pnl !== null && (
          <div className="mb-4 text-sm font-semibold" style={{ color: pnl >= 0 ? "#3ddc97" : "#ff5c7a" }}>
            {pnl >= 0 ? "▲ Closing now: +" : "▼ Closing now: -"}
            {money(Math.abs(pnl))} {pnl >= 0 ? "profit" : "underwater"} at this cost
          </div>
        )}

        {errorMsg && <div className="mb-3 text-xs text-[#ff5c7a]">{errorMsg}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {saving ? "Closing…" : "Close Position"}
          </button>
        </div>
      </div>
    </div>
  );
}
