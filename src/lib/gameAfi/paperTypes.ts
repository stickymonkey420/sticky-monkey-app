// Game-a-Fi Phase 2: paper trading competition. Simulated money (starts at
// $10,000), priced off the real `stock_universe` table -- so unlike Phase
// 1's live leaderboard, dollar amounts are fine to show here since
// nothing is actually at risk. See migration game_afi_paper_trading_phase2.

export type PaperAccount = {
  startingBalance: number;
  cashBalance: number;
};

export type PaperTrade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  trade_date: string;
};

// Derived client-side from paper_trades + stock_universe -- not its own
// table (see lib/gameAfi/paperQueries.ts computeHoldings).
export type PaperHolding = {
  ticker: string;
  shares: number;
  avgCost: number; // cost basis per share across all buys, net of sells FIFO-free (simple average)
  currentPrice: number | null; // null if the ticker has since dropped out of stock_universe
  marketValue: number | null;
  unrealizedPl: number | null;
};

export type PaperLeaderboardRow = {
  user_id: string;
  display_name: string;
  dollar_return: number;
  pct_return: number;
  rank: number;
};

export type PaperWeeklyLeaderboard = {
  weekStart: string | null;
  rows: PaperLeaderboardRow[];
};

export type PaperSeasonLeaderboard = {
  seasonStart: string | null;
  rows: PaperLeaderboardRow[];
};

export type ExecuteTradeResult = {
  ok: boolean;
  message: string;
  newCashBalance: number | null;
};
