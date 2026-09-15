// Shared handle validation for both the self-service My Profile modal and
// the admin Edit Profile modal. "Handle" is the new name/purpose for what
// used to be a free-text `username` column: Game-a-Fi identifies players
// by it (leaderboards today; leagues, head-to-head matchups, and
// tournaments once those exist), so it needs to actually be a stable,
// unique, presentable identifier instead of arbitrary text -- several
// existing rows had an email address sitting in this column, which is
// exactly what this format is meant to prevent going forward.
//
// This regex must stay in sync with the `profiles_username_format_check`
// CHECK constraint in Supabase -- that constraint is the enforced backstop
// for anything that bypasses this client-side check (direct API calls,
// future admin tooling), not a substitute for it.
export const HANDLE_REGEX = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

export const HANDLE_HINT = "3-20 characters, starting with a letter. Letters, numbers, and underscores only.";

// Returns a user-facing error message, or null when the value is valid.
// An empty/whitespace-only value is treated as valid (clearing the handle
// is allowed) -- callers should skip this check entirely once they've
// trimmed and confirmed the value is empty.
export function validateHandle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!HANDLE_REGEX.test(trimmed)) {
    return `Handle must be ${HANDLE_HINT.charAt(0).toLowerCase()}${HANDLE_HINT.slice(1)}`;
  }
  return null;
}

// Matches the unique index name from the add_game_afi_handle_to_profiles
// migration, so a race-condition duplicate (two people saving the same
// handle at once) surfaces as a friendly message instead of a raw
// Postgres constraint-violation string.
export function isHandleTakenError(message: string): boolean {
  return message.includes("profiles_username_lower_idx");
}
