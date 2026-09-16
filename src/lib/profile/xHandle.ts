// Validation for the optional X (Twitter) handle profile field -- shown on
// My Profile as "X (Twitter) Handle". Not used to build any share text or
// link -- the "Share to X" buttons (see src/lib/share/shareImageToX.ts) post
// a still shot of the score with nothing pre-filled, per your call. Kept as
// a real profile field for a future use (e.g. an @mention or a public
// profile link). Deliberately looser than src/lib/profile/handle.ts (the
// in-app "Handle"): X's own rules aren't
// enforced here server-side (no CHECK constraint -- see the
// add_x_handle_to_profiles migration), and the worst case of a stale/wrong
// value is just a link that 404s on X's side, not anything broken here.
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
