"use client";

import { useEffect, useRef, useState } from "react";
import { computeIfAssignedProfit, computeReturnPct } from "@/lib/options/calc";
import { money } from "@/lib/options/queries";
import type { CostBasisLookup } from "@/lib/options/queries";
import type { TradeFormInput, TradeLeg } from "@/lib/options/mutations";
import type { AccountTypeOption, OpenPosition } from "@/lib/options/types";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";
const LEG_BTN_BASE =
  "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide";
const LEG_BTN_ACTIVE = "border-[#4f8cff] bg-[#4f8cff]/15 text-[#4f8cff]";
const LEG_BTN_INACTIVE = "border-[rgba(148,158,189,0.35)] text-text-muted";

type AddEditTradeModalProps = {
  mode: "add" | "edit";
  position?: OpenPosition | null; // required for mode === "edit"
  accountOptions: AccountTypeOption[];
  defaultAccountType: string | null;
  onClose: () => void;
  onSaved: () => void;
  onSubmit: (input: TradeFormInput) => Promise<{ error: string | null }>;
  lookupCostBasis: (ticker: string, accountType: string) => Promise<CostBasisLookup>;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Add/Edit Trade modal -- ported from the live Webflow page's single
// #ot-add-trade-overlay modal (project doc
// `claude/roll-positions-options-script.html`), which the script reuses
// for CSP/CC/LEAP entries and toggles between Add/Edit via `editingId`.
// Mirrors InvestmentAlertCard's modal styling/overlay pattern.
export default function AddEditTradeModal({
  mode,
  position,
  accountOptions,
  defaultAccountType,
  onClose,
  onSaved,
  onSubmit,
  lookupCostBasis,
}: AddEditTradeModalProps) {
  const isEdit = mode === "edit" && !!position;

  const [leg, setLeg] = useState<TradeLeg>(isEdit ? (position!.type as TradeLeg) : "CSP");
  const [ticker, setTicker] = useState(isEdit ? position!.ticker : "");
  const [strike, setStrike] = useState(isEdit ? String(position!.strike) : "");
  const [premium, setPremium] = useState(isEdit ? String(position!.premium) : "");
  const [contracts, setContracts] = useState(isEdit ? String(position!.contracts) : "1");
  const [expiration, setExpiration] = useState(isEdit ? (position!.expiration || "").slice(0, 10) : "");
  const [entryDate, setEntryDate] = useState(
    isEdit ? (position!.entryDate || "").slice(0, 10) : todayStr()
  );
  const [accountType, setAccountType] = useState(
    isEdit ? position!.accountType : defaultAccountType || accountOptions[0]?.id || ""
  );
  const [notes, setNotes] = useState(isEdit ? position!.notes || "" : "");

  const [costHint, setCostHint] = useState("");
  const [costHintWarn, setCostHintWarn] = useState(false);
  const [lastCostBasis, setLastCostBasis] = useState<number | null>(null);
  const costHintToken = useRef(0);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function refreshCostHint(nextTicker: string, nextAccountType: string, nextStrike: string) {
    const t = nextTicker.trim().toUpperCase();
    if (!t || !nextAccountType) {
      setCostHint("");
      setLastCostBasis(null);
      return;
    }
    const myToken = ++costHintToken.current;
    setCostHint(`Checking cost basis for ${t}…`);
    setCostHintWarn(false);
    const row = await lookupCostBasis(t, nextAccountType);
    if (myToken !== costHintToken.current) return;
    if (!row) {
      setCostHint(`No ${t} holding on file for this account.`);
      setLastCostBasis(null);
      return;
    }
    if (row.costBasis === null) {
      setCostHint(`${t}: holding on file (${row.shares} sh) but no cost basis saved yet.`);
      setLastCostBasis(null);
      return;
    }
    const strikeNum = parseFloat(nextStrike);
    const warn = leg === "CC" && strikeNum > 0 && strikeNum < row.costBasis;
    setCostHint(
      `Your cost basis on ${t}: ${money(row.costBasis)} / sh (${row.shares} sh on file)` +
        (warn ? " — strike is BELOW cost basis." : "")
    );
    setCostHintWarn(warn);
    setLastCostBasis(row.costBasis);
  }

  const returnPct = leg === "LEAP" ? null : computeReturnPct(parseFloat(strike), parseFloat(premium));
  const assignProfit =
    leg === "CC" && lastCostBasis
      ? computeIfAssignedProfit({
          strike: parseFloat(strike),
          premium: parseFloat(premium),
          contracts: parseInt(contracts, 10),
          costBasis: lastCostBasis,
        })
      : null;

  function handleLegChange(nextLeg: TradeLeg) {
    if (isEdit) return; // leg is locked once a trade exists, matches the script
    setLeg(nextLeg);
  }

  async function handleSave() {
    const t = ticker.trim().toUpperCase();
    const strikeNum = parseFloat(strike);
    const premiumNum = parseFloat(premium);
    const contractsNum = parseInt(contracts, 10);

    if (!t) return setErrorMsg("Ticker is required.");
    if (!(strikeNum > 0)) return setErrorMsg("Enter a valid strike.");
    if (Number.isNaN(premiumNum) || premiumNum < 0) {
      return setErrorMsg(leg === "LEAP" ? "Enter a valid cost / sh." : "Enter a valid premium / sh.");
    }
    if (!(contractsNum >= 1)) return setErrorMsg("Enter at least 1 contract.");
    if (!expiration) return setErrorMsg("Expiration is required.");
    if (!entryDate) return setErrorMsg(leg === "LEAP" ? "Date bought is required." : "Entry date is required.");
    if (!accountType) return setErrorMsg("Select an account.");

    setErrorMsg(null);
    setSaving(true);
    const { error } = await onSubmit({
      leg,
      accountType,
      ticker: t,
      strike: strikeNum,
      premium: premiumNum,
      contracts: contractsNum,
      entryDate,
      expiration,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErrorMsg(isEdit ? "Could not update trade. Try again." : "Could not save trade. Try again.");
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">
            {isEdit ? "Edit Option Trade" : "New Option Trade"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {(["CSP", "CC", "LEAP"] as TradeLeg[]).map((legOption) => (
            <button
              key={legOption}
              type="button"
              disabled={isEdit}
              onClick={() => handleLegChange(legOption)}
              className={`${LEG_BTN_BASE} ${leg === legOption ? LEG_BTN_ACTIVE : LEG_BTN_INACTIVE} ${
                isEdit ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              {legOption}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onBlur={() => refreshCostHint(ticker, accountType, strike)}
              className={INPUT_CLASS}
              placeholder="e.g. AAPL"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Account</label>
            <select
              value={accountType}
              onChange={(e) => {
                setAccountType(e.target.value);
                refreshCostHint(ticker, e.target.value, strike);
              }}
              className={INPUT_CLASS}
            >
              <option value="">Select…</option>
              {accountOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Strike</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              onBlur={() => refreshCostHint(ticker, accountType, strike)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>{leg === "LEAP" ? "Cost / Sh" : "Premium / Sh"}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Contracts</label>
            <input
              type="number"
              min="1"
              step="1"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Return %</label>
            <input
              type="text"
              readOnly
              value={returnPct === null ? "" : `${returnPct.toFixed(2)}%`}
              placeholder="—"
              className={`${INPUT_CLASS} text-[#3ddc97]`}
            />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Expiration</label>
            <input
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>{leg === "LEAP" ? "Date Bought" : "Entry Date"}</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="mb-3">
          <label className={LABEL_CLASS}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={INPUT_CLASS}
          />
        </div>

        {costHint && (
          <div className={`mb-1 text-xs ${costHintWarn ? "text-[#ff5c7a]" : "text-text-muted"}`}>
            {costHint}
          </div>
        )}
        {assignProfit && (
          <div
            className="mb-3 text-xs"
            style={{ color: assignProfit.totalProfit >= 0 ? "#3ddc97" : "#ff5c7a" }}
          >
            If assigned: {assignProfit.totalProfit >= 0 ? "+" : "-"}
            {money(Math.abs(assignProfit.totalProfit))} total profit
            {assignProfit.pct !== null &&
              ` (${assignProfit.totalProfit >= 0 ? "+" : "-"}${Math.abs(assignProfit.pct).toFixed(2)}% on cost basis)`}{" "}
            — {assignProfit.shares} sh @ {money(parseFloat(strike))} vs. {money(lastCostBasis)}/sh cost basis, plus
            premium collected.
          </div>
        )}

        {errorMsg && <div className="mb-3 text-xs text-[#ff5c7a]">{errorMsg}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#4f8cff" }}
          >
            {saving ? (isEdit ? "Updating…" : "Saving…") : isEdit ? "Update Trade" : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
