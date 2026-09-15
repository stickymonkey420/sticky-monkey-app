import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Audit-trail columns across the schema that reference auth.users(id)
// WITHOUT cascading (pg_constraint confdeltype='a') -- they record "who
// last touched this row" (updated_by/created_by/granted_by/recorded_by/
// locked_by), not row ownership. Left in place, deleting the referenced
// user would fail with a raw foreign-key violation. They're cleared to
// NULL, not left blocking the delete -- the rows they're attached to
// (company_settings, pricing_tiers, etc.) are untouched otherwise.
const AUDIT_FK_CLEARS: { table: string; column: string }[] = [
  { table: "company_settings", column: "updated_by" },
  { table: "company_assets", column: "updated_by" },
  { table: "pricing_tiers", column: "updated_by" },
  { table: "simulator_assumptions", column: "updated_by" },
  { table: "pp_computation", column: "updated_by" },
  { table: "pp_computation_v2", column: "updated_by" },
  { table: "investment_properties", column: "updated_by" },
  { table: "investment_properties", column: "created_by" },
  { table: "revenue_simulator_lock", column: "locked_by" },
  { table: "revenue_simulator_lock", column: "updated_by" },
  { table: "user_roles", column: "granted_by" },
  { table: "cap_table_entries", column: "recorded_by" },
];

// Full account purge: removes the actual Supabase Auth user (auth.users),
// not just their `profiles` row. Every other table with
// `... REFERENCES auth.users(id) ON DELETE CASCADE` -- profiles,
// net_worth_snapshots, paper_accounts/trades/snapshots, business_*,
// game_*, smu_*, income_goals, auth.sessions/identities/mfa_factors, etc.
// -- cleans itself up automatically once the auth user is gone. Only the
// non-cascading exceptions below need explicit handling first.
//
// App Director only, enforced here (not just in the UI) since this uses
// the service-role key and bypasses RLS entirely.
export async function POST(request: Request) {
  let userId: string | undefined;
  try {
    ({ userId } = (await request.json()) as { userId?: string });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // 1. Authenticate the CALLER via their own session cookie and require
  // app_director -- matches the UI, which only ever renders the Delete
  // button for app_director (see UserRow.tsx).
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (caller.id === userId) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }
  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  if (callerProfile?.role !== "app_director") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // 2. Everything from here uses the service-role client -- this is the
  // only way to actually remove a Supabase Auth user.
  const admin = createAdminClient();

  // 2a. A cap table entry represents real equity ownership. Don't let an
  // account deletion silently erase it -- block with a clear message
  // instead of either failing with a raw FK error or quietly deleting
  // someone's ownership record.
  const { count: capTableCount, error: capTableError } = await admin
    .from("cap_table_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (capTableError) {
    return NextResponse.json(
      { error: `Could not check cap table entries: ${capTableError.message}` },
      { status: 500 }
    );
  }
  if ((capTableCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This member has cap table entries (equity ownership records). Reassign or remove those in the Cap Table first, then delete the account.",
      },
      { status: 409 }
    );
  }

  // 2b. Clear "who touched this" audit pointers so they don't block the
  // delete with a foreign-key violation.
  for (const { table, column } of AUDIT_FK_CLEARS) {
    const { error } = await admin
      .from(table)
      .update({ [column]: null })
      .eq(column, userId);
    if (error) {
      return NextResponse.json({ error: `Could not clear ${table}.${column}: ${error.message}` }, { status: 500 });
    }
  }

  // 2c. long_option_trades.user_id has no cascade either, but (unlike the
  // audit columns above) it IS real ownership -- purge it outright, same
  // as every cascaded table.
  const { error: tradesError } = await admin.from("long_option_trades").delete().eq("user_id", userId);
  if (tradesError) {
    return NextResponse.json({ error: `Could not delete option trades: ${tradesError.message}` }, { status: 500 });
  }

  // 3. Delete the actual Supabase Auth user.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
