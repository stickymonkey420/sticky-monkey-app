"use client";

import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import PaperTradeWidget from "./PaperTradeWidget";

// Popup opened by the "Buy" button in the Stock Screener ticker card's
// green action box -- the same Monkey Monkey (paper trading) account/trade
// form/holdings widget Game-a-Fi's own page uses, just in a modal instead
// of inline, and pre-filled with whichever ticker the card was for. Follows
// the same overlay pattern as EntryFormModal/RollPositionModal (click the
// backdrop to close).
export default function BuyPaperTradeModal({
  userId,
  ticker,
  onClose,
}: {
  userId: string;
  ticker: string;
  onClose: () => void;
}) {
  const { loading, account, holdings, trade } = usePaperTradingAccount(userId);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Monkey Monkey -- Buy {ticker}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
        <p className="mb-5 text-xs text-text-muted">
          Practice trading with simulated money -- no real cash is ever at risk. Priced at the current tracked price
          for tickers in the Stock Screener universe (updated every 10 minutes).
        </p>
        <PaperTradeWidget loading={loading} account={account} holdings={holdings} trade={trade} initialTicker={ticker} />
      </div>
    </div>
  );
}
