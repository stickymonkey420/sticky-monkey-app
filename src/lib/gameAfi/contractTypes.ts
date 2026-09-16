// Game-a-Fi "Sell Contracts" (wheel) mode: simulated cash-secured put sales
// only -- no share buying, no assignment/covered-call simulation at all.
// Row shape matches paper_contract_trades / game_afi_match_opponent_contract_trades
// exactly -- see the add_game_afi_sell_contracts_wheel_mode migration.

export type PaperContractTrade = {
  id: string;
  ticker: string;
  strike: number;
  contracts: number;
  premium: number;
  exp_date: string; // yyyy-mm-dd
  sold_date: string;
};

export type SellContractResult = {
  ok: boolean;
  message: string;
  premium: number | null;
  newCashBalance: number | null;
};
