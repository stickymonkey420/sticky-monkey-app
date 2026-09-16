import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Very light client-side-style check -- Supabase's own invite call is the
// real validation; this just avoids a wasted round trip on obvious typos.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends a Supabase Auth invite to a friend/family member, from the
// Dashboard's "Invite Friend or Family" Quick Access button -- any signed-in
// member can invite (not app_director-only, unlike delete-account), since
// this is meant to grow the member base member-to-member.
//
// Uses auth.admin.inviteUserByEmail(), the same mechanism as Users & Groups'
// "Invite" flow: it creates the auth.users row up front (unconfirmed) and
// sends Supabase's own "Invite user" email template (see the project doc
// claude/invite-user-email-template.html -- already hardcoded to link to
// this app's /auth/confirm route, so no redirectTo needs to be passed here).
// $0/month: Supabase's built-in auth email, no third-party invite/marketing
// service.
//
// The invited first name is passed as `data.name`, which
// public.handle_new_user() (the on-auth-user-created trigger) writes
// straight into profiles.name -- so the invite already has their name
// filled in when they finish setting their password.
async function handleInvite(request: Request): Promise<NextResponse> {
  let firstName: string | undefined;
  let email: string | undefined;
  try {
    ({ firstName, email } = (await request.json()) as { firstName?: string; email?: string });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  firstName = firstName?.trim();
  email = email?.trim().toLowerCase();

  if (!firstName) {
    return NextResponse.json({ error: "Enter a first name." }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Require the caller to be signed in -- this still uses the
  // service-role client below (the anon/RLS-scoped client can't invite
  // users), so this check is what stands between the route and an
  // anonymous invite-spam vector.
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase.from("profiles").select("name").eq("id", caller.id).maybeSingle();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      name: firstName,
      invited_by: caller.id,
      invited_by_name: callerProfile?.name || null,
    },
  });

  if (error) {
    const message = /already been registered|already registered|already exists/i.test(error.message)
      ? "That email already has an account."
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  try {
    return await handleInvite(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
