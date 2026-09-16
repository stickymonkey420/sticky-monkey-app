// Game-a-Fi "Sell Contracts" (wheel) mode: full wheel strategy, cash-secured
// puts AND covered calls, both with real Friday-close assignment simulation.
// Row shape matches paper_contract_trades / game_afi_match_opponent_contract_trades
// exactly -- see the add_game_afi_full_wheel_with_assignment migration.
// Available alongside Buy/Sell Shares on every match -- not an
// either/or strategy choice anymore (that's the now-vestigial
// game_afi_challenges.strategy column, unused by this mode).

export type ContractType = "put" | "call";
export type ContractStatus = "open" | "expired" | "assigned";

export type PaperContractTrade = {
  id: string;
  ticker: string;
  strike: number;
  contracts: number;
  premium: number;
  exp_date: string; // yyyy-mm-dd, always a Friday
  sold_date: string;
  contract_type: ContractType;
  status: ContractStatus;
  settlement_price: number | null;
  settled_at: string | null;
};

export type SellContractResult = {
  ok: boolean;
  message: string;
  premium: number | null;
  newCashBalance: number | null;
};
