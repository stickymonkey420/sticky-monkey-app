"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import type { PaperHolding } from "@/lib/gameAfi/paperTypes";

// The "Holdings" table for the Monkey Monkey (paper trading) account --
// extracted out of PaperTradeWidget so it can also stand alone on its own
// nav page (Fantasy Finance > Holdings), for anyone who just wants to check
// their paper positions without the tiles/trade form.
//
// onEdit (optional): when passed, each row gets Edit / Delete actions.
// Only the Overview page's PRACTICE account passes it -- Trade Off match
// holdings stay read-only. shares = 0 means delete.
type EditResult = { ok: boolean; message: string };

const inputClass =
  "w-24 rounded-md border border-card-border bg-[#0f131c] px-2 py-1 text-right text-sm text-text-primary outline-none focus:border-[#f5d020]/60";

export default function PaperHoldingsTable({
  holdings,
  onEdit,
}: {
  holdings: PaperHolding[];
  onEdit?: (ticker: string, shares: number, avgCost: number | null) => Promise<EditResult>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function startEdit(h: PaperHolding) {
    setConfirmDelete(null);
    setEditing(h.ticker);
    setShares(String(h.shares));
    setCost(String(Number(h.avgCost.toFixed(4))));
    setMessage(null);
  }

  async function run(ticker: string, s: number, c: number | null) {
    if (!onEdit || busy) return;
    setBusy(true);
    setMessage(null);
    const res = await onEdit(ticker, s, c);
    setBusy(false);
    setMessage({ text: res.message, ok: res.ok });
    if (res.ok) {
      setEditing(null);
      setConfirmDelete(null);
    }
  }

  const sharesNum = Number(shares);
  const costNum = Number(cost);
  const editValid =
    shares.trim() !== "" && cost.trim() !== "" && Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(costNum) && costNum > 0;

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Holdings</h3>
      {message && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-[#3ddc97]/10 text-[#3ddc97]" : "bg-[#ff5c7a]/10 text-[#ff5c7a]"}`}
        >
          {message.text}
        </div>
      )}
      {holdings.length === 0 ? (
        <div className="text-sm text-text-muted">No open positions yet -- place your first trade to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full ${onEdit ? "min-w-[680px]" : "min-w-[520px]"} border-collapse text-sm`}>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="py-2 pr-4">Ticker</th>
                <th className="py-2 pr-4 text-right">Shares</th>
                <th className="py-2 pr-4 text-right">Avg Cost</th>
                <th className="py-2 pr-4 text-right">Price</th>
                <th className="py-2 pr-4 text-right">Value</th>
                <th className="py-2 text-right">Unrealized</th>
                {onEdit && <th className="py-2 pl-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {holdings.map((h) => {
                const isEditing = editing === h.ticker;
                const isDeleting = confirmDelete === h.ticker;
                return (
                  <tr key={h.ticker}>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">{h.ticker}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {isEditing ? (
                        <input
                          aria-label={`${h.ticker} shares`}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={shares}
                          onChange={(e) => setShares(e.target.value)}
                          className={inputClass}
                        />
                      ) : (
                        h.shares
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {isEditing ? (
                        <input
                          aria-label={`${h.ticker} average cost`}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={cost}
                          onChange={(e) => setCost(e.target.value)}
                          className={inputClass}
                        />
                      ) : (
                        money(h.avgCost)
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {h.currentPrice === null ? "—" : money(h.currentPrice)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {h.marketValue === null ? "—" : money(h.marketValue)}
                    </td>
                    <td
                      className="whitespace-nowrap py-2.5 text-right font-medium"
                      style={{ color: (h.unrealizedPl ?? 0) >= 0 ? "#3ddc97" : "#ff5c7a" }}
                    >
                      {h.unrealizedPl === null ? "—" : `${h.unrealizedPl >= 0 ? "+" : ""}${money(h.unrealizedPl)}`}
                    </td>
                    {onEdit && (
                      <td className="whitespace-nowrap py-2.5 pl-4 text-right text-xs">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              disabled={!editValid || busy}
                              onClick={() => run(h.ticker, sharesNum, costNum)}
                              className="rounded-md bg-[#f5d020] px-2.5 py-1 font-semibold text-[#0f131c] disabled:opacity-60"
                            >
                              {busy ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="text-text-muted hover:text-text-primary">
                              Cancel
                            </button>
                          </span>
                        ) : isDeleting ? (
                          <span className="inline-flex items-center gap-3">
                            <span className="text-text-primary">Delete {h.ticker}?</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => run(h.ticker, 0, null)}
                              className="rounded-md bg-[#ff5c7a] px-2.5 py-1 font-semibold text-white disabled:opacity-60"
                            >
                              {busy ? "Working…" : "Yes, delete"}
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="text-text-muted hover:text-text-primary">
                              Keep
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-3">
                            <button type="button" onClick={() => startEdit(h)} className="font-semibold text-[#f5d020] hover:underline">
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(null);
                                setMessage(null);
                                setConfirmDelete(h.ticker);
                              }}
                              className="font-semibold text-[#ff5c7a] hover:underline"
                            >
                              Delete
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {onEdit && (
        <p className="mt-3 text-xs text-text-muted">
          Edits and deletes adjust practice cash as if the trades had been placed at the new values. Deleting refunds the position&apos;s cost.
        </p>
      )}
    </div>
  );
}
