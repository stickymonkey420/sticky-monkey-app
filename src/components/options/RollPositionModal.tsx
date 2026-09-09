"use client";

import { useEffect, useState } from "react";
import { computeMoneyness } from "@/lib/options/calc";
import { computeRollChainPnl, fmtDate, money } from "@/lib/options/queries";
import type { RollChainHistoryRow } from "@/lib/options/queries";
import type { Quote } from "@/lib/options/priceQuotes";
import type { RollInput } from "@/lib/options/mutations";
import type { OpenPosition } from "@/lib/options/types";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";

type RollPositionModalProps = {
  position: OpenPosition; // wheel_trades row only (CSP/CC)
  onClose: () => void;
  onSaved: () => void;
  onSubmit: (input: RollInput) => Promise<{ error: string | null }>;
  fetchQuote: (ticker: string) => Promise<Quote | null>;
  fetchChainHistory: (originId: string) => Promise<RollChainHistoryRow[]>;
};

type PriceState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; price: number };

type ChainState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; total: number; legCount: number };

// Roll to new strike/expiration modal -- ported from the live Webflow
// page's dynamically-built #roll-modal-overlay (project doc
// `claude/roll-positions-options-script.html`). Closes the current leg
// and opens a new one in the same roll chain; see rollTrade() in
// lib/options/mutations.ts for the exact chaining logic this submits to.
export default function RollPositionModal({
  position,
  onClose,
  onSaved,
  onSubmit,
  fetchQuote,
  fetchChainHistory,
}: RollPositionModalProps) {
  const [contracts, setContracts] = useState(String(position.contracts));
  const [closeCost, setCloseCost] = useState("0");
  const [newStrike, setNewStrike] = useState(String(position.strike));
  const [newExpiration, setNewExpiration] = useState("");
  const [newPremium, setNewPremium] = useState("");
  const [priceState, setPriceState] = useState<PriceState>({ status: "loading" });
  const [chainState, setChainState] = useState<ChainState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuote(position.ticker).then((q) => {
      if (cancelled) return;
      setPriceState(q ? { status: "ready", price: q.price } : { status: "unavailable" });
    });
    const originId = position.originTradeId || position.id;
    fetchChainHistory(originId)
      .then((rows) => {
        if (cancelled) return;
        const { total, legCount } = computeRollChainPnl(rows, position.id);
        setChainState({ status: "ready", total, legCount });
      })
      .catch(() => {
        if (!cancelled) setChainState({ status: "unavailable" });
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

  const oldStrike = Number(position.strike) || 0;
  const newStrikeNum = parseFloat(newStrike);
  const newPremiumNum = parseFloat(newPremium);
  const closeCostNum = Number.isNaN(parseFloat(closeCost)) ? 0 : parseFloat(closeCost);
  const contractsNum = parseInt(contracts, 10);

  const strikeDelta =
    !Number.isNaN(newStrikeNum) && oldStrike > 0
      ? {
          delta: newStrikeNum - oldStrike,
          pct: ((newStrikeNum - oldStrike) / oldStrike) * 100,
        }
      : null;

  const netCredit =
    !Number.isNaN(newPremiumNum) && contractsNum >= 1
      ? (newPremiumNum - closeCostNum) * contractsNum * 100
      : null;

  const legPnl =
    contractsNum >= 1 ? (Number(position.premium) - closeCostNum) * contractsNum * 100 : null;

  const moneyness =
    priceState.status === "ready" ? computeMoneyness(position.type as "CSP" | "CC", oldStrike, priceState.price) : null;

  async function handleSubmit() {
    if (!(contractsNum >= 1)) return setErrorMsg("Enter at least 1 contract.");
    if (!(newStrikeNum > 0)) return setErrorMsg("Enter a valid new strike.");
    if (!newExpiration) return setErrorMsg("New expiration is required.");
    if (Number.isNaN(newPremiumNum) || newPremiumNum < 0) return setErrorMsg("Enter a valid new premium / sh.");

    setErrorMsg(null);
    setSaving(true);
    const { error } = await onSubmit({
      contracts: contractsNum,
      closeCost: closeCostNum,
      newStrike: newStrikeNum,
      newExpiration,
      newPremium: newPremiumNum,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Could not roll this position. Try again.");
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
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">
            Roll {position.ticker} {position.type}
          </h3>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-2 text-xs text-text-muted">
          Current: {money(oldStrike)} strike, exp {fmtDate(position.expiration)}, {position.contracts} ctr,{" "}
          {money(position.premium)}/sh collected
        </div>

        <div className="mb-3 text-xs">
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

        <div className="mb-4 rounded-lg bg-white/5 p-2.5 text-xs">
          {chainState.status === "loading" && <span className="text-text-muted">Loading roll history…</span>}
          {chainState.status === "unavailable" && <span className="text-text-muted">Could not load roll history.</span>}
          {chainState.status === "ready" && chainState.legCount === 0 && (
            <span className="text-text-muted">Original position — no prior rolls yet.</span>
          )}
          {chainState.status === "ready" && chainState.legCount > 0 && (
            <span style={{ color: chainState.total >= 0 ? "#3ddc97" : "#ff5c7a", fontWeight: 600 }}>
              {chainState.total >= 0 ? "▲ " : "▼ "}
              {money(Math.abs(chainState.total))} {chainState.total >= 0 ? "net credit" : "net debit"}{" "}
              <span className="font-normal text-text-muted">
                since origination ({chainState.legCount} prior leg{chainState.legCount === 1 ? "" : "s"})
              </span>
            </span>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Contracts</label>
            <input type="number" min="1" step="1" value={contracts} onChange={(e) => setContracts(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Buy-to-Close Cost / Sh</label>
            <input type="number" min="0" step="0.01" value={closeCost} onChange={(e) => setCloseCost(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>New Strike</label>
            <input type="number" min="0" step="0.01" value={newStrike} onChange={(e) => setNewStrike(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>New Expiration</label>
            <input type="date" value={newExpiration} onChange={(e) => setNewExpiration(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        <div className="mb-3">
          <label className={LABEL_CLASS}>New Premium Received / Sh</label>
          <input type="number" min="0" step="0.01" value={newPremium} onChange={(e) => setNewPremium(e.target.value)} className={INPUT_CLASS} />
        </div>

        {strikeDelta && (
          <div className="mb-1.5 text-sm text-text-primary">
            Strike: {strikeDelta.delta > 0 ? "▲" : strikeDelta.delta < 0 ? "▼" : "—"} {money(Math.abs(strikeDelta.delta))} (
            {Math.abs(strikeDelta.pct).toFixed(2)}%) {strikeDelta.delta > 0 ? "higher" : strikeDelta.delta < 0 ? "lower" : "unchanged"}{" "}
            <span className="text-text-muted">
              (rolling {strikeDelta.delta > 0 ? "up" : strikeDelta.delta < 0 ? "down" : "sideways"})
            </span>
          </div>
        )}
        {netCredit !== null && (
          <div className="mb-1.5 text-sm font-semibold" style={{ color: netCredit >= 0 ? "#3ddc97" : "#ff5c7a" }}>
            {netCredit >= 0 ? "Net Credit: " : "Net Debit: "}
            {money(Math.abs(netCredit))} ({money(newPremiumNum - closeCostNum)}/sh × {contractsNum} ctr)
          </div>
        )}
        {legPnl !== null && (
          <div className="mb-4 text-sm font-semibold" style={{ color: legPnl >= 0 ? "#3ddc97" : "#ff5c7a" }}>
            {legPnl >= 0 ? "▲ This leg: +" : "▼ This leg: -"}
            {money(Math.abs(legPnl))} {legPnl >= 0 ? "profit" : "underwater"} closing at this cost
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
            {saving ? "Rolling…" : "Roll Position"}
          </button>
        </div>
      </div>
    </div>
  );
}
