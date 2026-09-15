// Game-a-Fi head-to-head challenges. Row shape matches
// `game_afi_list_challenges()` exactly -- see the `add_game_afi_challenges`
// migration. All reads/writes go through SECURITY DEFINER RPCs (never a
// direct table select/insert/update) because profiles RLS only lets a
// regular member see their own row, and challenges need to join the OTHER
// party's name/handle/avatar.
export type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled";

export type ChallengeDirection = "sent" | "received";

export type ChallengeRow = {
  id: string;
  status: ChallengeStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  direction: ChallengeDirection;
  other_id: string;
  other_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  // Agreed starting paper capital, set by the challenger when sending the
  // invite and accepted as-is (no counter-offer, for now) when the
  // opponent accepts. Holdings during the match must be bought with this
  // capital -- not enforced yet; this is just the agreed number for now.
  starting_balance: number;
  // Optional match end date, set by the challenger when sending the invite.
  expires_at: string | null;
};

// Both sides of one accepted head-to-head match -- see
// game_afi_match_summary. Unlike ChallengeRow (which only ever carries the
// OTHER party's name/handle so a member can never see anyone's dollar
// figures but their own -- see game_afi_list_challenges), this DOES expose
// the opponent's cash/holdings/total, since a head-to-head match is an
// explicit 1:1 agreement both sides accepted, scoped to just that one match.
export type MatchSummary = {
  challengeId: string;
  status: ChallengeStatus;
  startingBalance: number;
  expiresAt: string | null;
  me: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    cashBalance: number;
    holdingsValue: number;
    totalValue: number;
  };
  opponent: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    cashBalance: number;
    holdingsValue: number;
    totalValue: number;
  };
};
