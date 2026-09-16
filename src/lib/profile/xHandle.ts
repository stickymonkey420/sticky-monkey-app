// Validation for the optional X (Twitter) handle profile field -- used by
// the "Share to X" quick links on the Head to Head jumbotron
// (HeadToHeadCard.tsx) to @mention a member directly instead of just
// naming them in plain text. Deliberately looser than src/lib/profile/handle.ts
// (the in-app "Handle"): X's own rules aren't enforced here server-side (no
// CHECK constraint -- see the add_x_handle_to_profiles migration), and the
// worst case of a stale/wrong value is just a share link that 404s on X's
// side, not anything broken in this app.
//
// X currently allows 1-15 characters: letters, numbers, and underscores.
export const X_HANDLE_REGEX = /^[A-Za-z0-9_]{1,15}$/;

export const X_HANDLE_HINT = "1-15 characters. Letters, numbers, and underscores only, no @.";

// Strips a leading "@" and surrounding whitespace, so it doesn't matter
// whether someone pastes "@handle" or "handle".
export function normalizeXHandle(value: string): string {
  return value.trim().replace(/^@+/, "");
}

// Returns a user-facing error message, or null when the value is valid.
// An empty value is valid (clearing the handle is allowed) -- pass the
// already-normalized value.
export function validateXHandle(value: string): string | null {
  if (!value) return null;
  if (!X_HANDLE_REGEX.test(value)) {
    return `X handle must be ${X_HANDLE_HINT.charAt(0).toLowerCase()}${X_HANDLE_HINT.slice(1)}`;
  }
  return null;
}

// The plain-text label to show/use when a member has no X handle set --
// falls back to their in-app Handle, then their name, matching the
// convention used everywhere else in Game-a-Fi (ChallengeMemberForm,
// ScoreboardCard, HeadToHeadCard).
export function xShareLabel(xHandle: string | null, username: string | null, name: string | null): string {
  if (xHandle) return `@${xHandle}`;
  if (username) return `@${username}`;
  return name || "Member";
}

export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
