"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/options/queries";
import { TAXABLE_HOLDING_ACCOUNTS, type SellInput } from "@/lib/holdings/mutations";
import type { HoldingWithDerived } from "@/lib/holdings/types";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-[rgba(148,158,189,0.5)] bg-[#0d0f17] px-3 py-2.5 text-[13px] text-text-primary";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Sell (part of) a holding at a price you enter. Follows the button-only
// popup rule: no backdrop close; Cancel / × / Escape only.
export default function SellHoldingModal({
  holding,
  onClose,
  onSubmit,
}: {
  holding: HoldingWithDerived;
  onClose: () => void;
  onSubmit: (input: SellInput) => Promise<{ error: string | null; gain?: number }>;
}) {
  const held = Number(holding.shares) || 0;
  const [shares, setShares] = useState(String(held));
  const [price, setPrice] = useState(holding.price == null ? "" : String(Number(holding.price)));
  const [fees, setFees] = useState("");
  const [dateSold, setDateSold] = useState(todayIso());
  const [dateAcquired, setDateAcquired] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const qty = parseFloat(shares);
  const px = parseFloat(price);
  const fee = parseFloat(fees) || 0;
  const validQty = Number.isFinite(qty) && qty > 0 && qty <= held + 1e-9;
  const validPx = Number.isFinite(px) && px >= 0;
  const costPer = holding.cost_basis == null ? null : Number(holding.cost_basis);
  const proceeds = validQty && validPx ? qty * px - fee : null;
  const gain = proceeds != null && costPer != null ? proceeds - qty * costPer : null;
  const taxable = TAXABLE_HOLDING_ACCOUNTS.includes(holding.account_type);
  const sellsAll = validQty && Math.abs(qty - held) < 1e-9;

  async function submit() {
    if (!validQty) return setError(`Enter between 0 and ${held} shares.`);
    if (!validPx) return setError("Enter the sell price per share.");
    if (!dateSold) return setError("Enter the sale date.");
    setSaving(true);
    setError(null);
    const r = await onSubmit({ shares: qty, price: px, fees: fee, dateSold, dateAcquired: dateAcquired || null });
    setSaving(false);
    if (r.error) return setError(r.error);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-10">
      <div className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Sell {holding.ticker}</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              You hold {held} share{held === 1 ? "" : "s"}
              {costPer != null ? ` · cost ${money(costPer)} / share` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-text-muted hover:text-text-primary">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="sell-shares">
              Shares to sell
            </label>
            <input id="sell-shares" type="number" step="any" min="0" max={held} className={INPUT_CLASS} value={shares} onChange={(e) => setShares(e.target.value)} />
            <button type="button" onClick={() => setShares(String(held))} className="mt-1 text-[11px] text-[#4f8cff] hover:underline">
              Sell all
            </button>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="sell-price">
              Sell price / share
            </label>
            <input id="sell-price" type="number" step="any" min="0" className={INPUT_CLASS} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="sell-date">
              Sale date
            </label>
            <input id="sell-date" type="date" className={INPUT_CLASS} value={dateSold} onChange={(e) => setDateSold(e.target.value)} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="sell-fees">
              Fees (optional)
            </label>
            <input id="sell-fees" type="number" step="any" min="0" className={INPUT_CLASS} value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0.00" />
          </div>
          {taxable && (
            <div className="col-span-2">
              <label className={LABEL_CLASS} htmlFor="sell-acquired">
                Date bought (optional, decides short vs long term)
              </label>
              <input id="sell-acquired" type="date" className={INPUT_CLASS} value={dateAcquired} onChange={(e) => setDateAcquired(e.target.value)} />
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3 text-sm">
          <div>
            <div className="text-[11px] text-text-muted">Proceeds</div>
            <div className="font-semibold text-text-primary">{proceeds == null ? "—" : money(proceeds)}</div>
          </div>
          <div>
            <div className="text-[11px] text-text-muted">Gain / loss</div>
            <div className="font-semibold" style={{ color: gain == null ? undefined : gain >= 0 ? "#3ddc97" : "#ff5c7a" }}>
              {gain == null ? "—" : `${gain >= 0 ? "+" : "-"}${money(Math.abs(gain))}`}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {sellsAll ? "This closes the position." : validQty ? `${+(held - qty).toFixed(6)} shares stay in Holdings.` : ""}{" "}
          {taxable
            ? "The gain is saved to Taxes → Imported Gains and counted in your tax estimate."
            : "Retirement-account sales aren't taxable, so nothing is added to Taxes."}
        </p>

        {error && <p className="mt-3 text-sm text-[#ff5c7a]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !validQty || !validPx}
            onClick={submit}
            className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            {saving ? "Selling…" : `Sell ${validQty ? qty : ""} ${holding.ticker}`}
          </button>
        </div>
      </div>
    </div>
  );
}
