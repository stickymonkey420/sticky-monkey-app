"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/options/queries";
import type { HoldingFormInput } from "@/lib/holdings/mutations";
import { ASSET_CLASS_OPTIONS, type AccountTypeOption, type HoldingWithDerived } from "@/lib/holdings/types";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";

type EditHoldingModalProps = {
  holding: HoldingWithDerived;
  accountOptions: AccountTypeOption[];
  onClose: () => void;
  onSaved: () => void;
  onSubmit: (input: HoldingFormInput) => Promise<{ error: string | null }>;
};

// Edit Holding modal -- same overlay/field styling as Options'
// AddEditTradeModal. Holdings has no Add flow in this increment (rows are
// created elsewhere, e.g. when an option assignment adds shares via
// src/lib/options/holdingsSync.ts), so this only ever edits an existing
// `positions` row.
export default function EditHoldingModal({ holding, accountOptions, onClose, onSaved, onSubmit }: EditHoldingModalProps) {
  const [ticker, setTicker] = useState(holding.ticker);
  const [assetClass, setAssetClass] = useState<string>(holding.asset_class || "equity");
  const [shares, setShares] = useState(String(holding.shares));
  const [costBasis, setCostBasis] = useState(
    holding.cost_basis === null || holding.cost_basis === undefined ? "" : String(holding.cost_basis)
  );
  const [accountType, setAccountType] = useState(holding.account_type);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave() {
    const t = ticker.trim().toUpperCase();
    const sharesNum = parseFloat(shares);
    const costBasisTrimmed = costBasis.trim();
    const costBasisNum = costBasisTrimmed === "" ? null : parseFloat(costBasisTrimmed);

    if (!t) return setErrorMsg("Ticker is required.");
    if (!(sharesNum > 0)) return setErrorMsg("Enter a valid share count.");
    if (costBasisNum !== null && (Number.isNaN(costBasisNum) || costBasisNum < 0)) {
      return setErrorMsg("Enter a valid cost basis.");
    }
    if (!accountType) return setErrorMsg("Select an account.");

    setErrorMsg(null);
    setSaving(true);
    const { error } = await onSubmit({
      ticker: t,
      asset_class: assetClass,
      shares: sharesNum,
      cost_basis: costBasisNum,
      account_type: accountType,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Could not update holding. Try again.");
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
          <h3 className="text-base font-semibold text-text-primary">Edit Holding</h3>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className={INPUT_CLASS}
              placeholder="e.g. AAPL"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Asset Class</label>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className={INPUT_CLASS}>
              {ASSET_CLASS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "equity" ? "Equity" : "Crypto"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Shares</label>
            <input
              type="number"
              min="0"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Cost Basis / Sh</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              className={INPUT_CLASS}
              placeholder="—"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className={LABEL_CLASS}>Account</label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className={INPUT_CLASS}>
            <option value="">Select…</option>
            {accountOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 text-xs text-text-muted">
          Current price on file: {holding.price === null ? "—" : `${money(Number(holding.price))}/sh`} (not
          editable here -- prices sync separately)
        </div>

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
            {saving ? "Updating…" : "Update Holding"}
          </button>
        </div>
      </div>
    </div>
  );
}
