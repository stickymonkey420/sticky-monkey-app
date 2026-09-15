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
};
