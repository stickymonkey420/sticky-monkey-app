// Invite-only beta switch. Public sign-up stays closed unless
// NEXT_PUBLIC_SIGNUPS_OPEN=true is set in Vercel. The real block is Supabase
// Auth's "Allow new users to sign up" = OFF (admin invites still work); this
// flag only changes what the sign-up and sign-in pages show.
export const SIGNUPS_OPEN = process.env.NEXT_PUBLIC_SIGNUPS_OPEN === "true";
export const WAITLIST_URL = "https://stickymonkey.net";
