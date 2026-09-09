import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the confirmation link from every Supabase auth email (confirm
// signup, magic link, password recovery, email change, reauthentication).
// Supabase's built-in email templates use {{ .ConfirmationURL }}, which
// points at Supabase's own hosted /auth/v1/verify endpoint and then
// redirects back here with token_hash + type once verified -- the redirect
// target is whatever `emailRedirectTo` / `redirectTo` was passed when the
// action was triggered (signUp, resetPasswordForEmail, etc.), so no changes
// to the shared email templates are needed.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
}
