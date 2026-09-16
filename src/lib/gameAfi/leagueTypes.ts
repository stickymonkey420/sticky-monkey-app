// Game-a-Fi League: season-long snake-draft fantasy stock league. See
// migration add_game_afi_league for the schema/RPC functions these types
// mirror. Modeled on the draft/scoring mechanics of a well-known fantasy
// stock draft site (mechanics aren't copyrightable -- only its code, text
// and design would be, and none of that is reused here).
export type LeagueStatus = "setup" | "drafting" | "active" | "completed";

export type LeagueSummary = {
  id: string;
  name: string;
  status: LeagueStatus;
  rosterSize: number;
  memberCount: number;
  pickCount: number;
  totalPicks: number;
  createdAt: string;
};

export type LeagueMember = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  seed: number;
};

export type OnClock = {
  userId: string;
  name: string;
  username: string | null;
  round: number;
  seed: number;
  pickNumber: number;
  draftingDone: boolean;
};

export type DraftPoolRow = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  price: number | null;
  dayChangePct: number | null;
  drafted: boolean;
  draftedByUsername: string | null;
  draftedSide: "long" | "short" | null;
};

export type DraftPickRow = {
  pickNumber: number;
  round: number;
  userId: string;
  username: string | null;
  name: string;
  ticker: string;
  side: "long" | "short";
  priceAtPick: number;
  pickedAt: string;
};

// One drafted position with its live return. A member with zero picks yet
// still gets one row (round/pickNumber/ticker/side/etc all null) so they
// show up in standings at 0% instead of vanishing -- see
// game_afi_league_positions's left joins.
export type LeaguePositionRow = {
  userId: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  seed: number;
  round: number | null;
  pickNumber: number | null;
  ticker: string | null;
  side: "long" | "short" | null;
  sector: string | null;
  priceAtPick: number | null;
  currentPrice: number | null;
  returnPct: number;
};

export type LeagueSnapshotRow = {
  userId: string;
  username: string | null;
  snapshotAt: string;
  avgReturnPct: number;
};
